import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/password.js";
import { loginAs } from "../lab-03/testAuth.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).
// Issue 34 — migrated off X-Dev-Requester-Id to real session cookies.

let requesterAId: number;
let cookieA: string;
let cookieB: string;
let categoryId: number;
let relatedSystemId: number;
let otherRelatedSystemId: number;

// mustChangePassword:false here (unlike prisma/seed.ts's real accounts) is
// deliberate: these are one-off, throwaway fixtures whose password is
// already known to the test, not accounts meant to exercise the
// change-password flow itself — that flow has its own dedicated tests.
async function createFreshRequester(name: string) {
  const password = "FixtureOnly1!";
  const email = `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const user = await getPrisma().user.create({
    data: {
      name,
      email,
      isActive: true,
      role: "REQUESTER",
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
    },
  });
  const login = await request(app).post("/api/auth/login").send({ email, password });
  const raw = login.headers["set-cookie"] as unknown as string[] | string | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cookie = cookies.find((c) => c.startsWith("token="))!.split(";")[0];
  return { id: user.id, cookie };
}

async function createTicket(cookie: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/tickets")
    .set("Cookie", cookie)
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
  const activeRequesters = await prisma.user.findMany({ where: { isActive: true, role: "REQUESTER" }, take: 2 });
  requesterAId = activeRequesters[0].id;
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystems = await prisma.relatedSystem.findMany({ where: { isActive: true }, take: 2 });
  categoryId = category.id;
  relatedSystemId = relatedSystems[0].id;
  otherRelatedSystemId = relatedSystems[1].id;
  cookieA = await loginAs(activeRequesters[0].email);
  cookieB = await loginAs(activeRequesters[1].email);
});

describe("GET /api/tickets", () => {
  it("returns only the Requester's own Tickets, isolated from another Requester's", async () => {
    const ticketA = await createTicket(cookieA, { summary: "Requester A's own ticket" });
    await createTicket(cookieB, { summary: "Requester B's own ticket" });

    const resA = await request(app).get("/api/tickets").set("Cookie", cookieA);
    expect(resA.status).toBe(200);
    const idsA = resA.body.data.map((t: { id: number }) => t.id);
    expect(idsA).toContain(ticketA.id);
    expect(resA.body.data.every((t: { requesterId: number }) => t.requesterId === requesterAId)).toBe(true);
  });

  it("filters by search matching the Ticket Number", async () => {
    const ticket = await createTicket(cookieA, { summary: "Findable by number" });
    const res = await request(app).get(`/api/tickets?search=${ticket.ticketNumber}`).set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { id: number }) => t.id)).toEqual([ticket.id]);
  });

  it("returns only Tickets matching every applied filter together", async () => {
    const fresh = await createFreshRequester("Filter Test Requester");
    const matching = await createTicket(fresh.cookie, {
      relatedSystemId: otherRelatedSystemId,
      requestedPriority: "HIGH",
      summary: "Matches every filter",
    });
    await createTicket(fresh.cookie, {
      relatedSystemId: relatedSystemId, // wrong related system
      requestedPriority: "HIGH",
      summary: "Wrong related system",
    });
    await createTicket(fresh.cookie, {
      relatedSystemId: otherRelatedSystemId,
      requestedPriority: "LOW", // wrong priority
      summary: "Wrong priority",
    });

    const res = await request(app)
      .get(`/api/tickets?categoryId=${categoryId}&relatedSystemId=${otherRelatedSystemId}&requestedPriority=HIGH`)
      .set("Cookie", fresh.cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { id: number }) => t.id)).toEqual([matching.id]);
  });

  it("sorts by ticketNumber ascending", async () => {
    const res = await request(app).get("/api/tickets?sort=ticketNumber&order=asc&pageSize=50").set("Cookie", cookieA);
    expect(res.status).toBe(200);
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    expect(numbers).toEqual([...numbers].sort());
  });

  it("paginates with the requested page size", async () => {
    for (let i = 0; i < 3; i++) {
      await createTicket(cookieA, { summary: `Pagination filler ${i}` });
    }
    const res = await request(app).get("/api/tickets?page=1&pageSize=10").set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(10);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 10 });
    expect(res.body.meta.total).toBeGreaterThan(0);
  });

  it("returns 400 naming the parameter for an invalid sort value", async () => {
    const res = await request(app).get("/api/tickets?sort=nope").set("Cookie", cookieA);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/sort/i);
  });

  it("returns an empty list for a Requester with zero Tickets", async () => {
    const fresh = await createFreshRequester("Fresh Requester");
    const res = await request(app).get("/api/tickets").set("Cookie", fresh.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });
});
