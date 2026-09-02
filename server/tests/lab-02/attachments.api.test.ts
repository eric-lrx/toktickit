import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).

let requesterAId: number;
let requesterBId: number;
let categoryId: number;
let relatedSystemId: number;

async function createTicket(requesterId: number, summary = "Attachment fixture") {
  const res = await request(app)
    .post("/api/tickets")
    .set("X-Dev-Requester-Id", String(requesterId))
    .send({
      categoryId,
      relatedSystemId,
      summary,
      description: "Description long enough for validation",
      requestedPriority: "MEDIUM",
    });
  return res.body.data;
}

function attachOne(ticketId: number, requesterId: number, filename = "photo.jpg", contentType = "image/jpeg") {
  return request(app)
    .post(`/api/tickets/${ticketId}/attachments`)
    .set("X-Dev-Requester-Id", String(requesterId))
    .attach("attachments", Buffer.from("fake file bytes"), { filename, contentType });
}

beforeAll(async () => {
  const prisma = getPrisma();
  const activeRequesters = await prisma.requesterUser.findMany({ where: { isActive: true }, take: 2 });
  requesterAId = activeRequesters[0].id;
  requesterBId = activeRequesters[1].id;
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
});

describe("POST /api/tickets/:id/attachments", () => {
  it("adds an attachment to an owned Ticket", async () => {
    const ticket = await createTicket(requesterAId);
    const res = await attachOne(ticket.id, requesterAId);
    expect(res.status).toBe(201);
    expect(res.body.data[0].originalName).toBe("photo.jpg");
  });

  it("returns 404 for a Ticket owned by another Requester", async () => {
    const ticket = await createTicket(requesterAId);
    const res = await attachOne(ticket.id, requesterBId);
    expect(res.status).toBe(404);
  });

  it("returns 415 for a disallowed file type", async () => {
    const ticket = await createTicket(requesterAId);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set("X-Dev-Requester-Id", String(requesterAId))
      .attach("attachments", Buffer.from("#!/bin/sh\necho hi"), {
        filename: "script.sh",
        contentType: "application/x-sh",
      });
    expect(res.status).toBe(415);
  });

  it("returns 413 for a file over 5 MB", async () => {
    const ticket = await createTicket(requesterAId);
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set("X-Dev-Requester-Id", String(requesterAId))
      .attach("attachments", big, { filename: "big.png", contentType: "image/png" });
    expect(res.status).toBe(413);
  });

  it("returns 409 when adding would exceed 5 active attachments", async () => {
    const ticket = await createTicket(requesterAId);
    for (let i = 0; i < 5; i++) {
      const res = await attachOne(ticket.id, requesterAId, `photo${i}.jpg`);
      expect(res.status).toBe(201);
    }
    const sixth = await attachOne(ticket.id, requesterAId, "photo5.jpg");
    expect(sixth.status).toBe(409);
  });

  it("allows a new attachment when a removed one no longer counts toward the quota", async () => {
    const ticket = await createTicket(requesterAId);
    const created: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await attachOne(ticket.id, requesterAId, `quota${i}.jpg`);
      created.push(res.body.data[0].id);
    }
    const removeRes = await request(app)
      .delete(`/api/attachments/${created[0]}`)
      .set("X-Dev-Requester-Id", String(requesterAId))
      .send({ reason: "wrong file" });
    expect(removeRes.status).toBe(200);

    const sixth = await attachOne(ticket.id, requesterAId, "quota-replacement.jpg");
    expect(sixth.status).toBe(201);
  });
});

describe("GET /api/attachments/:id/download", () => {
  it("returns 404 for a soft-removed attachment", async () => {
    const ticket = await createTicket(requesterAId);
    const addRes = await attachOne(ticket.id, requesterAId);
    const attachmentId = addRes.body.data[0].id;

    await request(app)
      .delete(`/api/attachments/${attachmentId}`)
      .set("X-Dev-Requester-Id", String(requesterAId))
      .send({ reason: "no longer needed" });

    const downloadRes = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set("X-Dev-Requester-Id", String(requesterAId));
    expect(downloadRes.status).toBe(404);
  });

  it("returns 404 for an attachment owned by another Requester", async () => {
    const ticket = await createTicket(requesterAId);
    const addRes = await attachOne(ticket.id, requesterAId);
    const attachmentId = addRes.body.data[0].id;

    const res = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set("X-Dev-Requester-Id", String(requesterBId));
    expect(res.status).toBe(404);
  });

  it("downloads an active attachment successfully", async () => {
    const ticket = await createTicket(requesterAId);
    const addRes = await attachOne(ticket.id, requesterAId);
    const attachmentId = addRes.body.data[0].id;

    const res = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set("X-Dev-Requester-Id", String(requesterAId));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/attachments/:id", () => {
  it("returns 400 when reason is missing", async () => {
    const ticket = await createTicket(requesterAId);
    const addRes = await attachOne(ticket.id, requesterAId);
    const attachmentId = addRes.body.data[0].id;

    const res = await request(app)
      .delete(`/api/attachments/${attachmentId}`)
      .set("X-Dev-Requester-Id", String(requesterAId))
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when removing an attachment owned by another Requester", async () => {
    const ticket = await createTicket(requesterAId);
    const addRes = await attachOne(ticket.id, requesterAId);
    const attachmentId = addRes.body.data[0].id;

    const res = await request(app)
      .delete(`/api/attachments/${attachmentId}`)
      .set("X-Dev-Requester-Id", String(requesterBId))
      .send({ reason: "not mine to remove" });
    expect(res.status).toBe(404);
  });

  it("keeps removed attachment metadata visible on the Ticket", async () => {
    const ticket = await createTicket(requesterAId);
    const addRes = await attachOne(ticket.id, requesterAId, "keepme.jpg");
    const attachmentId = addRes.body.data[0].id;

    await request(app)
      .delete(`/api/attachments/${attachmentId}`)
      .set("X-Dev-Requester-Id", String(requesterAId))
      .send({ reason: "duplicate upload" });

    const detailRes = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set("X-Dev-Requester-Id", String(requesterAId));
    const found = detailRes.body.data.attachments.find((a: { id: number }) => a.id === attachmentId);
    expect(found).toBeDefined();
    expect(found.originalName).toBe("keepme.jpg");
    expect(found.removalReason).toBe("duplicate upload");
  });
});
