import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).

let requesterAId: number;
let requesterBId: number;
let categoryId: number;
let relatedSystemId: number;

async function createTicket(requesterId: number, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/tickets")
    .set("X-Dev-Requester-Id", String(requesterId))
    .send({
      categoryId,
      relatedSystemId,
      summary: "Ticket detail fixture",
      description: "Description long enough for validation",
      requestedPriority: "MEDIUM",
      ...overrides,
    });
  return res.body.data;
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

describe("GET /api/tickets/:id", () => {
  it("returns the owned Ticket with an attachments array", async () => {
    const ticket = await createTicket(requesterAId, { summary: "Owned by A" });
    const res = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set("X-Dev-Requester-Id", String(requesterAId));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ticket.id);
    expect(res.body.data.summary).toBe("Owned by A");
    expect(res.body.data.attachments).toEqual([]);
  });

  it("returns 404 when the Ticket belongs to a different Requester", async () => {
    const ticket = await createTicket(requesterAId, { summary: "Owned by A, requested by B" });
    const res = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set("X-Dev-Requester-Id", String(requesterBId));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a Ticket id that does not exist, identical to the ownership case", async () => {
    const res = await request(app)
      .get("/api/tickets/999999999")
      .set("X-Dev-Requester-Id", String(requesterAId));
    expect(res.status).toBe(404);
  });
});
