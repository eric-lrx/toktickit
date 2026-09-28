import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAs } from "../lab-03/testAuth.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).

let staffCookie: string;
let staffId: number;
let otherStaffId: number;
let otherStaffCookie: string;
let inactiveStaffId: number;
let adminCookie: string;
let requesterCookie: string;
let requesterId: number;
let otherRequesterId: number;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const staff = await prisma.user.findFirstOrThrow({ where: { email: "margaret.hamilton@toktickit.com" } });
  const otherStaff = await prisma.user.findFirstOrThrow({ where: { email: "katherine.johnson@toktickit.com" } });
  const inactiveStaff = await prisma.user.findFirstOrThrow({ where: { email: "nolan.inactive@toktickit.com" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "barbara.liskov@toktickit.com" } });
  const requester = await prisma.user.findFirstOrThrow({ where: { email: "ada.lovelace@example.com" } });
  const otherRequester = await prisma.user.findFirstOrThrow({ where: { email: "grace.hopper@example.com" } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

  staffId = staff.id;
  otherStaffId = otherStaff.id;
  inactiveStaffId = inactiveStaff.id;
  requesterId = requester.id;
  otherRequesterId = otherRequester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  staffCookie = await loginAs(staff.email);
  otherStaffCookie = await loginAs(otherStaff.email);
  adminCookie = await loginAs(admin.email);
  requesterCookie = await loginAs(requester.email);
});

// Unassigned by default: owning dozens of fixture Tickets per run would push
// a shared seeded account's real Tickets off page 1 of its queue, which is
// exactly what broke Lab 3's STAFF-Q-07 during Issue 23.
async function createFixtureTicket(overrides: { status?: string; requesterId?: number; ticketOwnerId?: number | null } = {}) {
  return getPrisma().ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Date.now()}${Math.floor(Math.random() * 100000)}`,
      requesterId: overrides.requesterId ?? requesterId,
      categoryId,
      relatedSystemId,
      summary: "Actions Taken fixture",
      description: "Description long enough for validation",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      status: (overrides.status as never) ?? "IN_PROGRESS",
      ticketOwnerId: overrides.ticketOwnerId ?? null,
    },
  });
}

function createAction(ticketId: number, body: Record<string, unknown>, cookie = staffCookie) {
  return request(app).post(`/api/tickets/${ticketId}/actions`).set("Cookie", cookie).send(body);
}

function patchAction(actionId: number, body: Record<string, unknown>, cookie = staffCookie) {
  return request(app).patch(`/api/actions/${actionId}`).set("Cookie", cookie).send(body);
}

describe("GET /api/tickets/:id/actions", () => {
  it("API-01 lists a Ticket's Actions Taken ordered by actionAt, then id", async () => {
    const ticket = await createFixtureTicket();
    await createAction(ticket.id, { description: "Second in time", actionAt: "2026-10-02T10:00:00.000Z" });
    await createAction(ticket.id, { description: "First in time", actionAt: "2026-10-01T10:00:00.000Z" });

    const res = await request(app).get(`/api/tickets/${ticket.id}/actions`).set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { description: string }) => a.description)).toEqual(["First in time", "Second in time"]);
  });

  it("API-02 keeps a stable order (id breaks ties) for equal actionAt values", async () => {
    const ticket = await createFixtureTicket();
    const at = "2026-10-03T08:00:00.000Z";
    const ids: number[] = [];
    for (const d of ["A", "B", "C"]) {
      ids.push((await createAction(ticket.id, { description: d, actionAt: at })).body.data.id);
    }

    const first = await request(app).get(`/api/tickets/${ticket.id}/actions`).set("Cookie", staffCookie);
    const second = await request(app).get(`/api/tickets/${ticket.id}/actions`).set("Cookie", staffCookie);
    expect(first.body.data.map((a: { id: number }) => a.id)).toEqual(ids);
    expect(second.body.data.map((a: { id: number }) => a.id)).toEqual(ids);
  });
});

describe("POST /api/tickets/:id/actions", () => {
  it("API-03 creates a valid Action Taken under the correct Ticket with the authenticated creator and approved assignee", async () => {
    const ticket = await createFixtureTicket();
    const res = await createAction(ticket.id, {
      description: "Replaced the laptop battery",
      result: "Battery holds charge",
      assigneeId: otherStaffId,
      attachmentNotes: "See battery-report.pdf",
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      ticketId: ticket.id,
      performedById: staffId,
      performedByName: "Margaret Hamilton",
      assigneeId: otherStaffId,
      assigneeName: "Katherine Johnson",
      assigneeActive: true,
      status: "PLANNED",
      followUpRequired: false,
      followUpNote: null,
      attachmentNotes: "See battery-report.pdf",
      version: 1,
    });
    const saved = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(saved.ticketId).toBe(ticket.id);
    expect(saved.performedById).toBe(staffId);
  });

  it("API-04 ignores a forged performedById and records the session user", async () => {
    const ticket = await createFixtureTicket();
    const res = await createAction(ticket.id, { description: "Forged performer attempt", performedById: otherStaffId });
    expect(res.status).toBe(201);
    expect(res.body.data.performedById).toBe(staffId);
    const saved = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(saved.performedById).toBe(staffId);
  });

  it("API-05 rejects followUpRequired without a follow-up note, on create and on update", async () => {
    const ticket = await createFixtureTicket();
    const before = await getPrisma().actionTaken.count({ where: { ticketId: ticket.id } });
    const create = await createAction(ticket.id, { description: "Needs a follow-up", followUpRequired: true });
    expect(create.status).toBe(400);
    expect(await getPrisma().actionTaken.count({ where: { ticketId: ticket.id } })).toBe(before);

    const created = await createAction(ticket.id, { description: "No follow-up yet" });
    const update = await patchAction(created.body.data.id, { version: 1, followUpRequired: true, followUpNote: "   " });
    expect(update.status).toBe(400);
    const saved = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(saved.followUpRequired).toBe(false);
  });

  it("API-06 clears the follow-up note when followUpRequired is false", async () => {
    const ticket = await createFixtureTicket();
    const res = await createAction(ticket.id, { description: "Done, nothing to follow", followUpRequired: false, followUpNote: "stray note" });
    expect(res.status).toBe(201);
    expect(res.body.data.followUpNote).toBeNull();
  });

  it("API-07 rejects an inactive IT Staff assignee on create and on update", async () => {
    const ticket = await createFixtureTicket();
    const create = await createAction(ticket.id, { description: "Assign to inactive", assigneeId: inactiveStaffId });
    expect(create.status).toBe(400);

    const created = await createAction(ticket.id, { description: "Assign later" });
    const update = await patchAction(created.body.data.id, { version: 1, assigneeId: inactiveStaffId });
    expect(update.status).toBe(400);
  });

  it("API-08 rejects a Requester as assignee", async () => {
    const ticket = await createFixtureTicket();
    const res = await createAction(ticket.id, { description: "Assign to requester", assigneeId: requesterId });
    expect(res.status).toBe(400);
  });

  it("API-10 rejects a blank description, text over 4000 characters, and an invalid actionAt", async () => {
    const ticket = await createFixtureTicket();
    expect((await createAction(ticket.id, { description: "   " })).status).toBe(400);
    expect((await createAction(ticket.id, {})).status).toBe(400);
    expect((await createAction(ticket.id, { description: "x".repeat(4001) })).status).toBe(400);
    expect((await createAction(ticket.id, { description: "ok", result: "x".repeat(4001) })).status).toBe(400);
    expect((await createAction(ticket.id, { description: "ok", actionAt: "not-a-date" })).status).toBe(400);
    expect((await createAction(ticket.id, { description: "ok", status: "DONE" })).status).toBe(400);
  });

  it("API-10 defaults actionAt to the server's current time", async () => {
    const ticket = await createFixtureTicket();
    const before = Date.now();
    const res = await createAction(ticket.id, { description: "No explicit time" });
    const at = new Date(res.body.data.actionAt).getTime();
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("API-12 rejects creating an action already COMPLETED without a result", async () => {
    const ticket = await createFixtureTicket();
    const res = await createAction(ticket.id, { description: "Completed on the spot", status: "COMPLETED" });
    expect(res.status).toBe(400);
  });

  it("API-16 rejects creating an action on a RESOLVED, CLOSED, or CANCELLED Ticket", async () => {
    for (const status of ["RESOLVED", "CLOSED", "CANCELLED"]) {
      const ticket = await createFixtureTicket({ status });
      const res = await createAction(ticket.id, { description: `On a ${status} ticket` });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("TICKET_NOT_ACTIVE");
    }
  });

  it("API-20 lets an IT Staff member who is not the Ticket Owner record an action", async () => {
    const ticket = await createFixtureTicket({ ticketOwnerId: otherStaffId });
    const res = await createAction(ticket.id, { description: "Helping out on someone else's ticket" });
    expect(res.status).toBe(201);
    expect(res.body.data.performedById).toBe(staffId);
    expect(ticket.ticketOwnerId).toBe(otherStaffId);
  });

  it("returns 404 for a Ticket that does not exist", async () => {
    const res = await createAction(999999999, { description: "Nowhere" });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/actions/:id", () => {
  it("API-09 reassigns to another active staff user, then unassigns", async () => {
    const ticket = await createFixtureTicket();
    const created = await createAction(ticket.id, { description: "Reassign me", assigneeId: staffId });
    const reassigned = await patchAction(created.body.data.id, { version: 1, assigneeId: otherStaffId });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.data.assigneeId).toBe(otherStaffId);

    const unassigned = await patchAction(created.body.data.id, { version: 2, assigneeId: null });
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.data.assigneeId).toBeNull();
    expect(unassigned.body.data.assigneeName).toBeNull();
  });

  it("API-11 moves PLANNED → IN_PROGRESS → COMPLETED, incrementing version each time", async () => {
    const ticket = await createFixtureTicket();
    const created = await createAction(ticket.id, { description: "Full lifecycle" });
    const started = await patchAction(created.body.data.id, { version: 1, status: "IN_PROGRESS" });
    expect(started.status).toBe(200);
    expect(started.body.data).toMatchObject({ status: "IN_PROGRESS", version: 2 });

    const completed = await patchAction(created.body.data.id, { version: 2, status: "COMPLETED", result: "Fixed" });
    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({ status: "COMPLETED", result: "Fixed", version: 3 });
  });

  it("API-12 rejects completing without a result and leaves the status unchanged", async () => {
    const ticket = await createFixtureTicket();
    const created = await createAction(ticket.id, { description: "No result yet" });
    const res = await patchAction(created.body.data.id, { version: 1, status: "COMPLETED" });
    expect(res.status).toBe(400);
    const saved = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(saved.status).toBe("PLANNED");
  });

  it("API-13 cancels a PLANNED action", async () => {
    const ticket = await createFixtureTicket();
    const created = await createAction(ticket.id, { description: "Not needed anymore" });
    const res = await patchAction(created.body.data.id, { version: 1, status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CANCELLED");
  });

  it("API-14 rejects a transition outside the matrix, naming the allowed targets", async () => {
    const ticket = await createFixtureTicket();
    const created = await createAction(ticket.id, { description: "Started", status: "IN_PROGRESS" });
    const res = await patchAction(created.body.data.id, { version: 1, status: "PLANNED" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_ACTION_TRANSITION");
    expect(res.body.error.message).toContain("COMPLETED");
    expect(res.body.error.message).toContain("CANCELLED");
  });

  it("API-15 rejects any update to a COMPLETED or CANCELLED action", async () => {
    const ticket = await createFixtureTicket();
    const done = await createAction(ticket.id, { description: "Done", status: "COMPLETED", result: "ok" });
    const cancelled = await createAction(ticket.id, { description: "Dropped" });
    await patchAction(cancelled.body.data.id, { version: 1, status: "CANCELLED" });

    const editDone = await patchAction(done.body.data.id, { version: 1, description: "Rewrite history" });
    expect(editDone.status).toBe(409);
    expect(editDone.body.error.code).toBe("ACTION_TERMINAL");

    const editCancelled = await patchAction(cancelled.body.data.id, { version: 2, status: "PLANNED" });
    expect(editCancelled.status).toBe(409);
    expect(editCancelled.body.error.code).toBe("ACTION_TERMINAL");
  });

  // Reaches the non-active Ticket through the real API (cancelling the
  // Ticket), not by forcing a status in the database: a RESOLVED Ticket
  // with an open action is exactly the state BR-10/BR-15 make unreachable.
  it("API-16 rejects updating an action once its Ticket is no longer active", async () => {
    const ticket = await createFixtureTicket({ status: "IN_PROGRESS" });
    const open = await createAction(ticket.id, { description: "Planned before cancellation" });
    const cancel = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set("Cookie", staffCookie)
      .send({ status: "CANCELLED" });
    expect(cancel.status).toBe(200);

    const res = await patchAction(open.body.data.id, { version: 1, description: "Edited after cancellation" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TICKET_NOT_ACTIVE");
  });

  it("API-17 rejects a stale version with STALE_UPDATE and keeps the first change", async () => {
    const ticket = await createFixtureTicket();
    const created = await createAction(ticket.id, { description: "Original" });
    const first = await patchAction(created.body.data.id, { version: 1, description: "First editor" }, staffCookie);
    expect(first.status).toBe(200);

    const second = await patchAction(created.body.data.id, { version: 1, description: "Second editor" }, otherStaffCookie);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("STALE_UPDATE");
    expect(second.body.error.current).toMatchObject({ description: "First editor", version: 2 });

    const saved = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(saved.description).toBe("First editor");
  });

  it("API-18 requires version", async () => {
    const ticket = await createFixtureTicket();
    const created = await createAction(ticket.id, { description: "Needs version" });
    const res = await patchAction(created.body.data.id, { description: "No version sent" });
    expect(res.status).toBe(400);
  });

  it("API-19 has no DELETE route; the action is still there", async () => {
    const ticket = await createFixtureTicket();
    const created = await createAction(ticket.id, { description: "Cannot be deleted" });
    const res = await request(app).delete(`/api/actions/${created.body.data.id}`).set("Cookie", staffCookie);
    expect(res.status).toBe(404);
    expect(await getPrisma().actionTaken.findUnique({ where: { id: created.body.data.id } })).not.toBeNull();
  });

  it("never lets a PATCH change performedById or ticketId", async () => {
    const ticket = await createFixtureTicket();
    const otherTicket = await createFixtureTicket();
    const created = await createAction(ticket.id, { description: "Immutable links" });
    const res = await patchAction(created.body.data.id, { version: 1, performedById: otherStaffId, ticketId: otherTicket.id, description: "Edited" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ performedById: staffId, ticketId: ticket.id, description: "Edited" });
  });

  it("returns 404 for an action that does not exist", async () => {
    const res = await patchAction(999999999, { version: 1, description: "Nowhere" });
    expect(res.status).toBe(404);
  });
});

describe("Actions Taken authorization", () => {
  it("AUTHZ-01 rejects a Requester creating an action on their own Ticket", async () => {
    const ticket = await createFixtureTicket({ requesterId });
    const res = await createAction(ticket.id, { description: "Requester tries" }, requesterCookie);
    expect(res.status).toBe(403);
    expect(await getPrisma().actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("AUTHZ-02 rejects a Requester updating an action", async () => {
    const ticket = await createFixtureTicket({ requesterId });
    const created = await createAction(ticket.id, { description: "Staff action" });
    const res = await patchAction(created.body.data.id, { version: 1, description: "Requester edit" }, requesterCookie);
    expect(res.status).toBe(403);
    const saved = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(saved.description).toBe("Staff action");
  });

  it("AUTHZ-03 lets a Requester read the Actions Taken of their own Ticket", async () => {
    const ticket = await createFixtureTicket({ requesterId });
    await createAction(ticket.id, { description: "Visible to the requester", followUpRequired: true, followUpNote: "Check next week" });
    const res = await request(app).get(`/api/tickets/${ticket.id}/actions`).set("Cookie", requesterCookie);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ description: "Visible to the requester", followUpNote: "Check next week" });
  });

  it("AUTHZ-04 returns 404 when a Requester lists another Requester's Ticket actions", async () => {
    const ticket = await createFixtureTicket({ requesterId: otherRequesterId });
    await createAction(ticket.id, { description: "Not yours" });
    const res = await request(app).get(`/api/tickets/${ticket.id}/actions`).set("Cookie", requesterCookie);
    expect(res.status).toBe(404);
    expect(res.body.data).toBeUndefined();
  });

  it("AUTHZ-05 lets an Administrator create and complete an action", async () => {
    const ticket = await createFixtureTicket();
    const created = await createAction(ticket.id, { description: "Admin support work" }, adminCookie);
    expect(created.status).toBe(201);
    const completed = await patchAction(created.body.data.id, { version: 1, status: "COMPLETED", result: "Done by admin" }, adminCookie);
    expect(completed.status).toBe(200);
  });

  it("AUTHZ-06 rejects every Actions Taken route without a session or with a tampered token", async () => {
    const ticket = await createFixtureTicket();
    const created = await createAction(ticket.id, { description: "Protected" });
    const tampered = "token=eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwicm9sZSI6IklUX1NUQUZGIn0.forged";

    for (const cookie of [undefined, tampered]) {
      const list = request(app).get(`/api/tickets/${ticket.id}/actions`);
      const create = request(app).post(`/api/tickets/${ticket.id}/actions`).send({ description: "x" });
      const update = request(app).patch(`/api/actions/${created.body.data.id}`).send({ version: 1, description: "x" });
      if (cookie) {
        list.set("Cookie", cookie);
        create.set("Cookie", cookie);
        update.set("Cookie", cookie);
      }
      expect((await list).status).toBe(401);
      expect((await create).status).toBe(401);
      expect((await update).status).toBe(401);
    }
  });
});
