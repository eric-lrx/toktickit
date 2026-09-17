import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAs } from "./testAuth.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).

let staffCookie: string;
let staffId: number;
let otherStaffId: number;
let adminCookie: string;
let requesterCookie: string;
let requesterId: number;
let inactiveStaffId: number;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const staff = await prisma.user.findFirstOrThrow({ where: { email: "margaret.hamilton@toktickit.com" } });
  const otherStaff = await prisma.user.findFirstOrThrow({ where: { email: "katherine.johnson@toktickit.com" } });
  const inactiveStaff = await prisma.user.findFirstOrThrow({ where: { email: "nolan.inactive@toktickit.com" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMINISTRATOR", isActive: true } });
  const requester = await prisma.user.findFirstOrThrow({ where: { role: "REQUESTER", isActive: true } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

  staffId = staff.id;
  otherStaffId = otherStaff.id;
  inactiveStaffId = inactiveStaff.id;
  requesterId = requester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  staffCookie = await loginAs(staff.email);
  adminCookie = await loginAs(admin.email);
  requesterCookie = await loginAs(requester.email);
});

// A dedicated fixture Ticket per test — bypasses the Requester creation
// flow (irrelevant here) and lets each test control its starting status/
// owner without interfering with any other test's assertions.
async function createFixtureTicket(overrides: { status?: string; ticketOwnerId?: number | null } = {}) {
  return getPrisma().ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Date.now()}${Math.floor(Math.random() * 1000)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: "Staff detail fixture",
      description: "Description long enough for validation",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      status: (overrides.status as never) ?? "NEW",
      ticketOwnerId: overrides.ticketOwnerId ?? null,
    },
  });
}

describe("GET /api/staff/tickets/:id", () => {
  it("STAFF-D-01 returns 200 with the Ticket and its attachments", async () => {
    const ticket = await createFixtureTicket();
    const res = await request(app).get(`/api/staff/tickets/${ticket.id}`).set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ticket.id);
    expect(res.body.data.attachments).toEqual([]);
  });

  it("AUTHZ-12 allows a read-only Administrator", async () => {
    const ticket = await createFixtureTicket();
    const res = await request(app).get(`/api/staff/tickets/${ticket.id}`).set("Cookie", adminCookie);
    expect(res.status).toBe(200);
  });

  it("rejects a Requester with 403", async () => {
    const ticket = await createFixtureTicket();
    const res = await request(app).get(`/api/staff/tickets/${ticket.id}`).set("Cookie", requesterCookie);
    expect(res.status).toBe(403);
  });

  it("STAFF-D-02 returns 404 for a nonexistent id", async () => {
    const res = await request(app).get("/api/staff/tickets/999999999").set("Cookie", staffCookie);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/staff/tickets/:id/owner", () => {
  it("STAFF-D-03 claims an unassigned Ticket", async () => {
    const ticket = await createFixtureTicket({ ticketOwnerId: null });
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set("Cookie", staffCookie)
      .send({ ticketOwnerId: staffId });
    expect(res.status).toBe(200);
    expect(res.body.data.ticketOwnerId).toBe(staffId);
  });

  it("STAFF-D-04 reassigns to another active IT Staff user", async () => {
    const ticket = await createFixtureTicket({ ticketOwnerId: staffId });
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set("Cookie", staffCookie)
      .send({ ticketOwnerId: otherStaffId });
    expect(res.status).toBe(200);
    expect(res.body.data.ticketOwnerId).toBe(otherStaffId);
    expect(res.body.data.ticketOwnerName).toBeTruthy();
  });

  it("unassigns with ticketOwnerId: null", async () => {
    const ticket = await createFixtureTicket({ ticketOwnerId: staffId });
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set("Cookie", staffCookie)
      .send({ ticketOwnerId: null });
    expect(res.status).toBe(200);
    expect(res.body.data.ticketOwnerId).toBeNull();
  });

  it("STAFF-D-05 rejects assigning an inactive user with 400", async () => {
    const ticket = await createFixtureTicket();
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set("Cookie", staffCookie)
      .send({ ticketOwnerId: inactiveStaffId });
    expect(res.status).toBe(400);
  });

  it("STAFF-D-06 rejects assigning a Requester-role user with 400", async () => {
    const ticket = await createFixtureTicket();
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set("Cookie", staffCookie)
      .send({ ticketOwnerId: requesterId });
    expect(res.status).toBe(400);
  });

  it("AUTHZ-04 rejects a Requester with 403", async () => {
    const ticket = await createFixtureTicket();
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set("Cookie", requesterCookie)
      .send({ ticketOwnerId: staffId });
    expect(res.status).toBe(403);
  });

  it("AUTHZ-11 rejects an Administrator (read-only) with 403", async () => {
    const ticket = await createFixtureTicket();
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set("Cookie", adminCookie)
      .send({ ticketOwnerId: staffId });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/staff/tickets/:id/priority", () => {
  it("STAFF-D-07 updates itPriority without touching requestedPriority", async () => {
    const ticket = await createFixtureTicket();
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/priority`)
      .set("Cookie", staffCookie)
      .send({ itPriority: "HIGH" });
    expect(res.status).toBe(200);
    expect(res.body.data.itPriority).toBe("HIGH");

    const reloaded = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(reloaded.requestedPriority).toBe("MEDIUM");
  });

  it("AUTHZ-04 rejects a Requester with 403", async () => {
    const ticket = await createFixtureTicket();
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/priority`)
      .set("Cookie", requesterCookie)
      .send({ itPriority: "HIGH" });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/staff/tickets/:id/status", () => {
  it("STAFF-D-08 allows a valid transition (New -> Open)", async () => {
    const ticket = await createFixtureTicket({ status: "NEW" });
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set("Cookie", staffCookie)
      .send({ status: "OPEN" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("OPEN");
  });

  it("STAFF-D-09 rejects a disallowed transition (New -> Resolved) with 409 naming current + allowed", async () => {
    const ticket = await createFixtureTicket({ status: "NEW" });
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set("Cookie", staffCookie)
      .send({ status: "RESOLVED" });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/NEW/);
    expect(res.body.error.message).toMatch(/OPEN/);
    expect(res.body.error.message).toMatch(/CANCELLED/);
  });

  it("STAFF-D-10 rejects any transition from Cancelled (terminal) with an empty allowed list", async () => {
    const ticket = await createFixtureTicket({ status: "CANCELLED" });
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set("Cookie", staffCookie)
      .send({ status: "OPEN" });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/no transitions|none|terminal/i);
  });

  it("STAFF-D-11 saves a resolutionSummary when moving to Resolved", async () => {
    const ticket = await createFixtureTicket({ status: "OPEN" });
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set("Cookie", staffCookie)
      .send({ status: "RESOLVED", resolutionSummary: "Replaced the faulty cable." });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("RESOLVED");
    expect(res.body.data.resolutionSummary).toBe("Replaced the faulty cable.");
  });

  it("AUTHZ-05 rejects a Requester's direct status change attempt regardless of target", async () => {
    const ticket = await createFixtureTicket({ status: "NEW" });
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set("Cookie", requesterCookie)
      .send({ status: "CANCELLED" });
    expect(res.status).toBe(403);
  });

  it("AUTHZ-11 rejects an Administrator's status change attempt with 403", async () => {
    const ticket = await createFixtureTicket({ status: "NEW" });
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set("Cookie", adminCookie)
      .send({ status: "OPEN" });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/tickets/:id/resolution-indicated", () => {
  it("STAFF-D-12 sets requesterResolutionIndicatedAt without changing status", async () => {
    const ticket = await createFixtureTicket({ status: "IN_PROGRESS" });
    const res = await request(app)
      .patch(`/api/tickets/${ticket.id}/resolution-indicated`)
      .set("Cookie", requesterCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.requesterResolutionIndicatedAt).toBeTruthy();

    const reloaded = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(reloaded.status).toBe("IN_PROGRESS");
  });

  it("returns 403 for a non-Requester caller", async () => {
    const ticket = await createFixtureTicket();
    const res = await request(app).patch(`/api/tickets/${ticket.id}/resolution-indicated`).set("Cookie", staffCookie);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a Ticket not owned by the caller", async () => {
    const ticket = await createFixtureTicket();
    const otherRequester = await getPrisma().user.findFirstOrThrow({
      where: { role: "REQUESTER", isActive: true, id: { not: requesterId } },
    });
    const otherCookie = await loginAs(otherRequester.email);
    const res = await request(app).patch(`/api/tickets/${ticket.id}/resolution-indicated`).set("Cookie", otherCookie);
    expect(res.status).toBe(404);
  });
});
