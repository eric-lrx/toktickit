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

async function createTicket(cookie: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/tickets")
    .set("Cookie", cookie)
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
  const activeRequesters = await prisma.user.findMany({ where: { isActive: true, role: "REQUESTER" }, take: 2 });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
  cookieA = await loginAs(activeRequesters[0].email);
  cookieB = await loginAs(activeRequesters[1].email);
});

describe("GET /api/tickets/:id", () => {
  it("returns the owned Ticket with an attachments array", async () => {
    const ticket = await createTicket(cookieA, { summary: "Owned by A" });
    const res = await request(app).get(`/api/tickets/${ticket.id}`).set("Cookie", cookieA);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ticket.id);
    expect(res.body.data.summary).toBe("Owned by A");
    expect(res.body.data.attachments).toEqual([]);
  });

  it("returns 404 when the Ticket belongs to a different Requester", async () => {
    const ticket = await createTicket(cookieA, { summary: "Owned by A, requested by B" });
    const res = await request(app).get(`/api/tickets/${ticket.id}`).set("Cookie", cookieB);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a Ticket id that does not exist, identical to the ownership case", async () => {
    const res = await request(app).get("/api/tickets/999999999").set("Cookie", cookieA);
    expect(res.status).toBe(404);
  });
});
