import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import fs from "fs/promises";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { UPLOAD_DIR } from "../../src/attachmentStorage.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).

let activeRequesterId: number;
let inactiveRequesterId: number;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const active = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: true } });
  const inactive = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: false } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  activeRequesterId = active.id;
  inactiveRequesterId = inactive.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
});

function validPayload() {
  return {
    categoryId,
    relatedSystemId,
    summary: "Printer jam on 3rd floor",
    description: "Paper is stuck in tray 2 and the printer shows a red light.",
    requestedPriority: "MEDIUM",
  };
}

describe("POST /api/tickets", () => {
  it("creates a Ticket for a valid payload and returns the generated Ticket Number", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .send(validPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
    expect(res.body.data.requesterId).toBe(activeRequesterId);
    expect(res.body.data.status).toBe("NEW");
  });

  it("returns 400 naming the field when Summary is missing", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .send({ ...validPayload(), summary: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/summary/i);
  });

  it("returns 400 when X-Dev-Requester-Id is missing", async () => {
    const res = await request(app).post("/api/tickets").send(validPayload());
    expect(res.status).toBe(400);
  });

  it("returns 400 when X-Dev-Requester-Id belongs to an inactive Requester", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(inactiveRequesterId))
      .send(validPayload());
    expect(res.status).toBe(400);
  });

  it("creates a Ticket with a valid attachment included", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field("categoryId", String(categoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field("summary", "Ticket with attachment")
      .field("description", "Description long enough for validation")
      .field("requestedPriority", "MEDIUM")
      .attach("attachments", Buffer.from("fake image bytes"), { filename: "evidence.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(201);
    expect(res.body.data.attachments).toHaveLength(1);
    expect(res.body.data.attachments[0].originalName).toBe("evidence.jpg");
  });

  it("returns 415 for a disallowed attachment type at creation", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field("categoryId", String(categoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field("summary", "Ticket with bad attachment")
      .field("description", "Description long enough for validation")
      .field("requestedPriority", "MEDIUM")
      .attach("attachments", Buffer.from("#!/bin/sh"), { filename: "script.sh", contentType: "application/x-sh" });
    expect(res.status).toBe(415);
  });

  it("returns 413 for an oversized attachment at creation", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field("categoryId", String(categoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field("summary", "Ticket with big attachment")
      .field("description", "Description long enough for validation")
      .field("requestedPriority", "MEDIUM")
      .attach("attachments", big, { filename: "big.png", contentType: "image/png" });
    expect(res.status).toBe(413);
  });

  it("cleans up the uploaded file and persists no Ticket when validation fails after upload", async () => {
    const filesBefore = await fs.readdir(UPLOAD_DIR).catch(() => [] as string[]);

    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .field("categoryId", "999999") // invalid category — fails validation after the file is written
      .field("relatedSystemId", String(relatedSystemId))
      .field("summary", "Should not be created")
      .field("description", "Description long enough for validation")
      .field("requestedPriority", "MEDIUM")
      .attach("attachments", Buffer.from("fake image bytes"), { filename: "orphan.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
    const filesAfter = await fs.readdir(UPLOAD_DIR).catch(() => [] as string[]);
    expect(filesAfter.length).toBe(filesBefore.length);
  });
});
