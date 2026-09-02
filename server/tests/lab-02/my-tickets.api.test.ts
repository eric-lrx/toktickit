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
      summary: "Default summary",
      description: "Default description long enough",
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

describe("GET /api/tickets", () => {
  it("returns only the Requester's own Tickets, isolated from another Requester's", async () => {
    const ticketA = await createTicket(requesterAId, { summary: "Requester A's own ticket" });
    await createTicket(requesterBId, { summary: "Requester B's own ticket" });

    const resA = await request(app).get("/api/tickets").set("X-Dev-Requester-Id", String(requesterAId));
    expect(resA.status).toBe(200);
    const idsA = resA.body.data.map((t: { id: number }) => t.id);
    expect(idsA).toContain(ticketA.id);
    expect(resA.body.data.every((t: { requesterId: number }) => t.requesterId === requesterAId)).toBe(true);
  });

  it("filters by search matching the Ticket Number", async () => {
    const ticket = await createTicket(requesterAId, { summary: "Findable by number" });
    const res = await request(app)
      .get(`/api/tickets?search=${ticket.ticketNumber}`)
      .set("X-Dev-Requester-Id", String(requesterAId));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { id: number }) => t.id)).toEqual([ticket.id]);
  });

  it("sorts by ticketNumber ascending", async () => {
    const res = await request(app)
      .get("/api/tickets?sort=ticketNumber&order=asc&pageSize=50")
      .set("X-Dev-Requester-Id", String(requesterAId));
    expect(res.status).toBe(200);
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    expect(numbers).toEqual([...numbers].sort());
  });

  it("paginates with the requested page size", async () => {
    for (let i = 0; i < 3; i++) {
      await createTicket(requesterAId, { summary: `Pagination filler ${i}` });
    }
    const res = await request(app)
      .get("/api/tickets?page=1&pageSize=10")
      .set("X-Dev-Requester-Id", String(requesterAId));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(10);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 10 });
    expect(res.body.meta.total).toBeGreaterThan(0);
  });

  it("returns 400 naming the parameter for an invalid sort value", async () => {
    const res = await request(app)
      .get("/api/tickets?sort=nope")
      .set("X-Dev-Requester-Id", String(requesterAId));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/sort/i);
  });

  it("returns an empty list for a Requester with zero Tickets", async () => {
    const freshRequester = await getPrisma().requesterUser.create({
      data: { name: "Fresh Requester", email: `fresh-${Date.now()}@example.com`, isActive: true },
    });
    const res = await request(app).get("/api/tickets").set("X-Dev-Requester-Id", String(freshRequester.id));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });
});
