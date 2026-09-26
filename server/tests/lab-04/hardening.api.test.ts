import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAs } from "../lab-03/testAuth.js";

// Not in the handout's minimum list — added on purpose (tests.md §1):
// specification.md BR-28, BR-30, BR-31 and handout §8.5.

let staffCookie: string;
let otherStaffCookie: string;
let requesterCookie: string;
let requesterId: number;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  requesterId = (await prisma.user.findUniqueOrThrow({ where: { email: "ada.lovelace@example.com" } })).id;
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  staffCookie = await loginAs("margaret.hamilton@toktickit.com");
  otherStaffCookie = await loginAs("katherine.johnson@toktickit.com");
  requesterCookie = await loginAs("ada.lovelace@example.com");
});

afterEach(() => vi.restoreAllMocks());

async function fixtureTicket() {
  return getPrisma().ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Date.now()}${Math.floor(Math.random() * 100000)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: "Hardening fixture",
      description: "Description long enough for validation",
      requestedPriority: "LOW",
      itPriority: "LOW",
      status: "OPEN",
    },
  });
}

describe("Idempotency-Key (BR-28)", () => {
  it("HARD-01 a repeated action create with the same key creates one record and replays the first response", async () => {
    const ticket = await fixtureTicket();
    const key = randomUUID();
    const send = () =>
      request(app).post(`/api/tickets/${ticket.id}/actions`).set("Cookie", staffCookie).set("Idempotency-Key", key).send({ description: "Retried create" });

    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(await getPrisma().actionTaken.count({ where: { ticketId: ticket.id } })).toBe(1);
  });

  it("HARD-01 two requests already in flight with the same key still create one record", async () => {
    const ticket = await fixtureTicket();
    const key = randomUUID();
    const send = () =>
      request(app).post(`/api/tickets/${ticket.id}/actions`).set("Cookie", staffCookie).set("Idempotency-Key", key).send({ description: "Double click" });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status].every((s) => s === 201 || s === 409)).toBe(true);
    expect(await getPrisma().actionTaken.count({ where: { ticketId: ticket.id } })).toBe(1);
  });

  it("HARD-02 applies to Ticket, Public Comment, and Internal Note creation", async () => {
    const ticket = await fixtureTicket();
    const commentKey = randomUUID();
    const noteKey = randomUUID();
    for (let i = 0; i < 2; i++) {
      await request(app).post(`/api/tickets/${ticket.id}/comments`).set("Cookie", staffCookie).set("Idempotency-Key", commentKey).send({ content: "Once only" });
      await request(app).post(`/api/tickets/${ticket.id}/notes`).set("Cookie", staffCookie).set("Idempotency-Key", noteKey).send({ content: "Once only" });
    }
    expect(await getPrisma().publicComment.count({ where: { ticketId: ticket.id } })).toBe(1);
    expect(await getPrisma().internalNote.count({ where: { ticketId: ticket.id } })).toBe(1);

    const ticketKey = randomUUID();
    const summary = `Idempotent ticket ${ticketKey}`;
    const body = { categoryId, relatedSystemId, summary, description: "Created twice by a retry, stored once", requestedPriority: "LOW" };
    const t1 = await request(app).post("/api/tickets").set("Cookie", requesterCookie).set("Idempotency-Key", ticketKey).send(body);
    const t2 = await request(app).post("/api/tickets").set("Cookie", requesterCookie).set("Idempotency-Key", ticketKey).send(body);
    expect(t1.status).toBe(201);
    expect(t2.body.data.id).toBe(t1.body.data.id);
    expect(await getPrisma().ticket.count({ where: { summary } })).toBe(1);
  });

  it("HARD-03 the same key from two different users creates two independent records", async () => {
    const ticket = await fixtureTicket();
    const key = randomUUID();
    const a = await request(app).post(`/api/tickets/${ticket.id}/actions`).set("Cookie", staffCookie).set("Idempotency-Key", key).send({ description: "User A" });
    const b = await request(app).post(`/api/tickets/${ticket.id}/actions`).set("Cookie", otherStaffCookie).set("Idempotency-Key", key).send({ description: "User B" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.data.id).not.toBe(b.body.data.id);
  });

  it("HARD-03 a request without the header is processed normally every time", async () => {
    const ticket = await fixtureTicket();
    await request(app).post(`/api/tickets/${ticket.id}/comments`).set("Cookie", staffCookie).send({ content: "No key 1" });
    await request(app).post(`/api/tickets/${ticket.id}/comments`).set("Cookie", staffCookie).send({ content: "No key 2" });
    expect(await getPrisma().publicComment.count({ where: { ticketId: ticket.id } })).toBe(2);
  });

  it("HARD-03 a failed request does not burn its key", async () => {
    const ticket = await fixtureTicket();
    const key = randomUUID();
    const bad = await request(app).post(`/api/tickets/${ticket.id}/actions`).set("Cookie", staffCookie).set("Idempotency-Key", key).send({ description: "" });
    expect(bad.status).toBe(400);
    const good = await request(app).post(`/api/tickets/${ticket.id}/actions`).set("Cookie", staffCookie).set("Idempotency-Key", key).send({ description: "Fixed input" });
    expect(good.status).toBe(201);
  });
});

describe("Removed legacy route (BR-31)", () => {
  it("HARD-04 GET /api/requesters returns no Requester data without a session", async () => {
    const res = await request(app).get("/api/requesters");
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("@example.com");
  });
});

describe("Safe failure (BR-30)", () => {
  it("HARD-05 a database failure on a Lab 4 route returns a generic 500 with no internal detail", async () => {
    const ticket = await fixtureTicket();
    vi.spyOn(getPrisma().actionTaken, "findMany").mockRejectedValueOnce(new Error("connection reset by peer at 10.0.0.5:5432"));
    const res = await request(app).get(`/api/tickets/${ticket.id}/actions`).set("Cookie", staffCookie);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { message: "Unable to load actions" } });
    expect(JSON.stringify(res.body)).not.toMatch(/connection|10\.0\.0|stack/i);
  });
});

describe("CSRF content-type layer (Lab 3 BR-10, implemented in Lab 4)", () => {
  it("HARD-06 rejects a mutating request sent as a plain HTML form would send it", async () => {
    const ticket = await fixtureTicket();
    const form = await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set("Cookie", staffCookie)
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send("content=csrf");
    const text = await request(app).post(`/api/tickets/${ticket.id}/comments`).set("Cookie", staffCookie).set("Content-Type", "text/plain").send("content=csrf");
    expect(form.status).toBe(415);
    expect(text.status).toBe(415);
    expect(await getPrisma().publicComment.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("HARD-06 still accepts JSON, multipart uploads, and body-less requests", async () => {
    const ticket = await fixtureTicket();
    const json = await request(app).post(`/api/tickets/${ticket.id}/comments`).set("Cookie", staffCookie).send({ content: "JSON is fine" });
    expect(json.status).toBe(201);
    const multipart = await request(app)
      .post("/api/tickets")
      .set("Cookie", requesterCookie)
      .field("categoryId", String(categoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field("summary", "Multipart still accepted")
      .field("description", "Created with multipart/form-data")
      .field("requestedPriority", "LOW");
    expect(multipart.status).toBe(201);
    const noBody = await request(app).post("/api/auth/logout").set("Cookie", await loginAs("grace.hopper@example.com"));
    expect(noBody.status).toBe(200);
  });
});

describe("Session probe (zero console errors, handout §8.5)", () => {
  it("HARD-07 answers 200 with no user when there is no session, instead of a 401 the browser logs as an error", async () => {
    const res = await request(app).get("/api/auth/session");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });
  });

  it("HARD-07 returns the signed-in identity, never the password hash, and works while a password change is pending", async () => {
    const res = await request(app).get("/api/auth/session").set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: "margaret.hamilton@toktickit.com", role: "IT_STAFF" });
    expect(res.body.data.passwordHash).toBeUndefined();

    const email = `probe-${Date.now()}@example.com`;
    const admin = await loginAs("barbara.liskov@toktickit.com");
    await request(app).post("/api/admin/users").set("Cookie", admin).send({ name: "Probe User", email, role: "REQUESTER", isActive: true, initialPassword: "ProbeFirst1!" });
    const login = await request(app).post("/api/auth/login").send({ email, password: "ProbeFirst1!" });
    const cookie = (login.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("token="))!.split(";")[0];
    const pending = await request(app).get("/api/auth/session").set("Cookie", cookie);
    expect(pending.status).toBe(200);
    expect(pending.body.data.mustChangePassword).toBe(true);
  });

  it("HARD-07 leaves GET /api/auth/me's Lab 3 contract unchanged (401 without a session)", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
  });
});
