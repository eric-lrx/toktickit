import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAs } from "../lab-03/testAuth.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).
// Issue 34 — migrated off X-Dev-Requester-Id to real session cookies for
// two distinct Requesters (A and B), still proving ownership isolation.

let cookieA: string;
let cookieB: string;
let categoryId: number;
let relatedSystemId: number;

async function createTicket(cookie: string, summary = "Attachment fixture") {
  const res = await request(app).post("/api/tickets").set("Cookie", cookie).send({
    categoryId,
    relatedSystemId,
    summary,
    description: "Description long enough for validation",
    requestedPriority: "MEDIUM",
  });
  return res.body.data;
}

function attachOne(ticketId: number, cookie: string, filename = "photo.jpg", contentType = "image/jpeg") {
  return request(app)
    .post(`/api/tickets/${ticketId}/attachments`)
    .set("Cookie", cookie)
    .attach("attachments", Buffer.from("fake file bytes"), { filename, contentType });
}

beforeAll(async () => {
  const prisma = getPrisma();
  const activeRequesters = await prisma.user.findMany({ where: { isActive: true, role: "REQUESTER" }, take: 2 });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
  cookieA = await loginAs(activeRequesters[0].email);
  cookieB = await loginAs(activeRequesters[1].email);
});

describe("POST /api/tickets/:id/attachments", () => {
  it("adds an attachment to an owned Ticket", async () => {
    const ticket = await createTicket(cookieA);
    const res = await attachOne(ticket.id, cookieA);
    expect(res.status).toBe(201);
    expect(res.body.data[0].originalName).toBe("photo.jpg");
  });

  it("returns 404 for a Ticket owned by another Requester", async () => {
    const ticket = await createTicket(cookieA);
    const res = await attachOne(ticket.id, cookieB);
    expect(res.status).toBe(404);
  });

  it("returns 415 for a disallowed file type", async () => {
    const ticket = await createTicket(cookieA);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set("Cookie", cookieA)
      .attach("attachments", Buffer.from("#!/bin/sh\necho hi"), {
        filename: "script.sh",
        contentType: "application/x-sh",
      });
    expect(res.status).toBe(415);
  });

  it("returns 413 for a file over 5 MB", async () => {
    const ticket = await createTicket(cookieA);
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set("Cookie", cookieA)
      .attach("attachments", big, { filename: "big.png", contentType: "image/png" });
    expect(res.status).toBe(413);
  });

  it("returns 409 when adding would exceed 5 active attachments", async () => {
    const ticket = await createTicket(cookieA);
    for (let i = 0; i < 5; i++) {
      const res = await attachOne(ticket.id, cookieA, `photo${i}.jpg`);
      expect(res.status).toBe(201);
    }
    const sixth = await attachOne(ticket.id, cookieA, "photo5.jpg");
    expect(sixth.status).toBe(409);
  });

  it("allows a new attachment when a removed one no longer counts toward the quota", async () => {
    const ticket = await createTicket(cookieA);
    const created: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await attachOne(ticket.id, cookieA, `quota${i}.jpg`);
      created.push(res.body.data[0].id);
    }
    const removeRes = await request(app)
      .delete(`/api/attachments/${created[0]}`)
      .set("Cookie", cookieA)
      .send({ reason: "wrong file" });
    expect(removeRes.status).toBe(200);

    const sixth = await attachOne(ticket.id, cookieA, "quota-replacement.jpg");
    expect(sixth.status).toBe(201);
  });
});

describe("GET /api/attachments/:id/download", () => {
  it("returns 404 for a soft-removed attachment", async () => {
    const ticket = await createTicket(cookieA);
    const addRes = await attachOne(ticket.id, cookieA);
    const attachmentId = addRes.body.data[0].id;

    await request(app)
      .delete(`/api/attachments/${attachmentId}`)
      .set("Cookie", cookieA)
      .send({ reason: "no longer needed" });

    const downloadRes = await request(app).get(`/api/attachments/${attachmentId}/download`).set("Cookie", cookieA);
    expect(downloadRes.status).toBe(404);
  });

  it("returns 404 for an attachment owned by another Requester", async () => {
    const ticket = await createTicket(cookieA);
    const addRes = await attachOne(ticket.id, cookieA);
    const attachmentId = addRes.body.data[0].id;

    const res = await request(app).get(`/api/attachments/${attachmentId}/download`).set("Cookie", cookieB);
    expect(res.status).toBe(404);
  });

  it("downloads an active attachment successfully", async () => {
    const ticket = await createTicket(cookieA);
    const addRes = await attachOne(ticket.id, cookieA);
    const attachmentId = addRes.body.data[0].id;

    const res = await request(app).get(`/api/attachments/${attachmentId}/download`).set("Cookie", cookieA);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/attachments/:id", () => {
  it("returns 400 when reason is missing", async () => {
    const ticket = await createTicket(cookieA);
    const addRes = await attachOne(ticket.id, cookieA);
    const attachmentId = addRes.body.data[0].id;

    const res = await request(app).delete(`/api/attachments/${attachmentId}`).set("Cookie", cookieA).send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when removing an attachment owned by another Requester", async () => {
    const ticket = await createTicket(cookieA);
    const addRes = await attachOne(ticket.id, cookieA);
    const attachmentId = addRes.body.data[0].id;

    const res = await request(app)
      .delete(`/api/attachments/${attachmentId}`)
      .set("Cookie", cookieB)
      .send({ reason: "not mine to remove" });
    expect(res.status).toBe(404);
  });

  it("keeps removed attachment metadata visible on the Ticket", async () => {
    const ticket = await createTicket(cookieA);
    const addRes = await attachOne(ticket.id, cookieA, "keepme.jpg");
    const attachmentId = addRes.body.data[0].id;

    await request(app)
      .delete(`/api/attachments/${attachmentId}`)
      .set("Cookie", cookieA)
      .send({ reason: "duplicate upload" });

    const detailRes = await request(app).get(`/api/tickets/${ticket.id}`).set("Cookie", cookieA);
    const found = detailRes.body.data.attachments.find((a: { id: number }) => a.id === attachmentId);
    expect(found).toBeDefined();
    expect(found.originalName).toBe("keepme.jpg");
    expect(found.removalReason).toBe("duplicate upload");
  });
});
