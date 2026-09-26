import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAs } from "../lab-03/testAuth.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).

let staffCookie: string;
let staffId: number;
let otherStaffId: number;
let adminCookie: string;
let requesterCookie: string;
let requesterId: number;
let otherRequesterCookie: string;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const staff = await prisma.user.findFirstOrThrow({ where: { email: "margaret.hamilton@toktickit.com" } });
  const otherStaff = await prisma.user.findFirstOrThrow({ where: { email: "katherine.johnson@toktickit.com" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "barbara.liskov@toktickit.com" } });
  const requester = await prisma.user.findFirstOrThrow({ where: { email: "ada.lovelace@example.com" } });
  const otherRequester = await prisma.user.findFirstOrThrow({ where: { email: "grace.hopper@example.com" } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

  staffId = staff.id;
  otherStaffId = otherStaff.id;
  requesterId = requester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  staffCookie = await loginAs(staff.email);
  adminCookie = await loginAs(admin.email);
  requesterCookie = await loginAs(requester.email);
  otherRequesterCookie = await loginAs(otherRequester.email);
});

// Unassigned fixtures, owned by Ada — see actions-taken.api.test.ts for why
// fixtures never default to a shared staff owner.
async function createFixtureTicket(status: TicketStatus = "IN_PROGRESS") {
  return getPrisma().ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Date.now()}${Math.floor(Math.random() * 100000)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: "Workflow fixture",
      description: "Description long enough for validation",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      status,
      ticketOwnerId: null,
    },
  });
}

function setStatus(ticketId: number, body: Record<string, unknown>, cookie = staffCookie) {
  return request(app).patch(`/api/staff/tickets/${ticketId}/status`).set("Cookie", cookie).send(body);
}

function createAction(ticketId: number, body: Record<string, unknown>, cookie = staffCookie) {
  return request(app).post(`/api/tickets/${ticketId}/actions`).set("Cookie", cookie).send(body);
}

const MATRIX: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CANCELLED: [],
};

describe("Final transition matrix (BR-14)", () => {
  it("WF-01 accepts every transition in the matrix", async () => {
    for (const [from, targets] of Object.entries(MATRIX) as [TicketStatus, TicketStatus[]][]) {
      for (const to of targets) {
        const ticket = await createFixtureTicket(from);
        const res = await setStatus(ticket.id, { status: to });
        expect(res.status, `${from} → ${to}`).toBe(200);
        expect(res.body.data.status).toBe(to);
      }
    }
  });

  it("WF-02 rejects transitions outside the matrix, naming the allowed targets", async () => {
    const cases: [TicketStatus, TicketStatus][] = [
      ["NEW", "RESOLVED"],
      ["CLOSED", "RESOLVED"],
      ["RESOLVED", "IN_PROGRESS"],
      ["CANCELLED", "OPEN"],
    ];
    for (const [from, to] of cases) {
      const ticket = await createFixtureTicket(from);
      const res = await setStatus(ticket.id, { status: to });
      expect(res.status, `${from} → ${to}`).toBe(409);
      for (const allowed of MATRIX[from]) expect(res.body.error.message).toContain(allowed);
    }
  });
});

describe("Resolution gate (BR-15), called directly on the API", () => {
  it("WF-03 blocks RESOLVED while an action is PLANNED and names it", async () => {
    const ticket = await createFixtureTicket("IN_PROGRESS");
    const planned = await createAction(ticket.id, { description: "Still to do" });
    await createAction(ticket.id, { description: "Done already", status: "COMPLETED", result: "ok" });

    const res = await setStatus(ticket.id, { status: "RESOLVED", resolutionSummary: "Trying to close early" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RESOLUTION_BLOCKED");
    expect(res.body.error.blockingActionIds).toEqual([planned.body.data.id]);
    const saved = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(saved.status).toBe("IN_PROGRESS");
    expect(saved.resolvedAt).toBeNull();
  });

  it("WF-04 blocks RESOLVED while an action is IN_PROGRESS", async () => {
    const ticket = await createFixtureTicket("OPEN");
    const started = await createAction(ticket.id, { description: "Being worked", status: "IN_PROGRESS" });
    const res = await setStatus(ticket.id, { status: "RESOLVED" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RESOLUTION_BLOCKED");
    expect(res.body.error.blockingActionIds).toEqual([started.body.data.id]);
  });

  it("WF-05 resolves once every action is COMPLETED or CANCELLED, and sets resolvedAt", async () => {
    const ticket = await createFixtureTicket("IN_PROGRESS");
    await createAction(ticket.id, { description: "Done", status: "COMPLETED", result: "ok" });
    const dropped = await createAction(ticket.id, { description: "Dropped" });
    await request(app).patch(`/api/actions/${dropped.body.data.id}`).set("Cookie", staffCookie).send({ version: 1, status: "CANCELLED" });

    const before = Date.now();
    const res = await setStatus(ticket.id, { status: "RESOLVED", resolutionSummary: "All work done" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("RESOLVED");
    const resolvedAt = new Date(res.body.data.resolvedAt).getTime();
    expect(resolvedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(resolvedAt).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("WF-06 never blocks a Ticket that has no Actions Taken", async () => {
    const ticket = await createFixtureTicket("OPEN");
    const res = await setStatus(ticket.id, { status: "RESOLVED" });
    expect(res.status).toBe(200);
  });

  it("WF-07 never ends RESOLVED with an open action when resolve and create race", async () => {
    for (let i = 0; i < 8; i++) {
      const ticket = await createFixtureTicket("IN_PROGRESS");
      const [resolve, create] = await Promise.all([
        setStatus(ticket.id, { status: "RESOLVED" }),
        createAction(ticket.id, { description: `Racing action ${i}` }),
      ]);
      const saved = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      const open = await getPrisma().actionTaken.count({ where: { ticketId: ticket.id, status: { in: ["PLANNED", "IN_PROGRESS"] } } });
      // Exactly one of the two wins; the loser is refused with a 409.
      const resolveWon = resolve.status === 200;
      const createWon = create.status === 201;
      expect(resolveWon !== createWon, `resolve ${resolve.status}, create ${create.status}`).toBe(true);
      expect(resolveWon ? create.status : resolve.status).toBe(409);
      expect(saved.status === "RESOLVED" && open > 0).toBe(false);
    }
  });
});

describe("resolvedAt lifecycle (BR-16)", () => {
  it("WF-08 keeps resolvedAt on CLOSED and clears it on REOPENED", async () => {
    const ticket = await createFixtureTicket("OPEN");
    const resolved = await setStatus(ticket.id, { status: "RESOLVED" });
    const resolvedAt = resolved.body.data.resolvedAt;
    expect(resolvedAt).not.toBeNull();

    const closed = await setStatus(ticket.id, { status: "CLOSED" });
    expect(closed.body.data.resolvedAt).toBe(resolvedAt);

    const reopened = await setStatus(ticket.id, { status: "REOPENED" });
    expect(reopened.body.data.resolvedAt).toBeNull();
  });
});

describe("Status history (BR-18)", () => {
  it("WF-09 appends one row per change, oldest first", async () => {
    const ticket = await createFixtureTicket("NEW");
    await setStatus(ticket.id, { status: "OPEN" });
    await setStatus(ticket.id, { status: "IN_PROGRESS" }, adminCookie);
    await setStatus(ticket.id, { status: "WAITING_FOR_REQUESTER" });

    const res = await request(app).get(`/api/tickets/${ticket.id}/status-history`).set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((h: { fromStatus: string; toStatus: string }) => [h.fromStatus, h.toStatus])).toEqual([
      ["NEW", "OPEN"],
      ["OPEN", "IN_PROGRESS"],
      ["IN_PROGRESS", "WAITING_FOR_REQUESTER"],
    ]);
    expect(res.body.data.map((h: { changedByName: string }) => h.changedByName)).toEqual([
      "Margaret Hamilton",
      "Barbara Liskov",
      "Margaret Hamilton",
    ]);
    expect(res.body.data[1].changedByRole).toBe("ADMINISTRATOR");
  });

  it("WF-09 records nothing when the change is refused", async () => {
    const ticket = await createFixtureTicket("NEW");
    await setStatus(ticket.id, { status: "RESOLVED" });
    expect(await getPrisma().ticketStatusChange.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("WF-10 shows the history to the owning Requester, hides it from another Requester", async () => {
    const ticket = await createFixtureTicket("NEW");
    await setStatus(ticket.id, { status: "OPEN" });
    const owner = await request(app).get(`/api/tickets/${ticket.id}/status-history`).set("Cookie", requesterCookie);
    const other = await request(app).get(`/api/tickets/${ticket.id}/status-history`).set("Cookie", otherRequesterCookie);
    const staff = await request(app).get(`/api/tickets/${ticket.id}/status-history`).set("Cookie", staffCookie);
    expect(owner.status).toBe(200);
    expect(owner.body.data).toHaveLength(1);
    expect(other.status).toBe(404);
    expect(staff.status).toBe(200);
  });
});

describe("Stale Ticket updates (BR-21)", () => {
  it("WF-11 rejects a status change sent with a stale version and keeps the status", async () => {
    const ticket = await createFixtureTicket("OPEN");
    const first = await setStatus(ticket.id, { status: "IN_PROGRESS", version: 1 });
    expect(first.status).toBe(200);
    expect(first.body.data.version).toBe(2);

    const stale = await setStatus(ticket.id, { status: "CANCELLED", version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("STALE_UPDATE");
    expect(stale.body.error.current).toMatchObject({ status: "IN_PROGRESS", version: 2 });
    const saved = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(saved.status).toBe("IN_PROGRESS");
  });

  it("WF-12 checks the version on owner and priority changes, and still accepts a request without one", async () => {
    const ticket = await createFixtureTicket("OPEN");
    const owner = await request(app).patch(`/api/staff/tickets/${ticket.id}/owner`).set("Cookie", staffCookie).send({ ticketOwnerId: staffId, version: 1 });
    expect(owner.status).toBe(200);
    expect(owner.body.data.version).toBe(2);

    const staleOwner = await request(app).patch(`/api/staff/tickets/${ticket.id}/owner`).set("Cookie", staffCookie).send({ ticketOwnerId: otherStaffId, version: 1 });
    expect(staleOwner.status).toBe(409);
    expect(staleOwner.body.error.code).toBe("STALE_UPDATE");

    const stalePriority = await request(app).patch(`/api/staff/tickets/${ticket.id}/priority`).set("Cookie", staffCookie).send({ itPriority: "HIGH", version: 1 });
    expect(stalePriority.status).toBe(409);
    expect(stalePriority.body.error.code).toBe("STALE_UPDATE");

    const noVersion = await request(app).patch(`/api/staff/tickets/${ticket.id}/priority`).set("Cookie", staffCookie).send({ itPriority: "HIGH" });
    expect(noVersion.status).toBe(200);
    expect(noVersion.body.data.version).toBe(3);
  });
});

describe("Staff Ticket detail payload", () => {
  it("WF-13 exposes allowedTransitions, version, and resolvedAt", async () => {
    for (const status of ["OPEN", "RESOLVED", "CANCELLED"] as TicketStatus[]) {
      const ticket = await createFixtureTicket(status);
      const res = await request(app).get(`/api/staff/tickets/${ticket.id}`).set("Cookie", staffCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.allowedTransitions).toEqual(MATRIX[status]);
      expect(res.body.data.version).toBe(1);
      expect(res.body.data).toHaveProperty("resolvedAt");
    }
  });
});

describe("Requester signal stays advisory (BR-17)", () => {
  it("WF-14 records the signal on a Ticket with open actions without changing its status", async () => {
    const ticket = await createFixtureTicket("IN_PROGRESS");
    await createAction(ticket.id, { description: "Still open" });
    const res = await request(app).patch(`/api/tickets/${ticket.id}/resolution-indicated`).set("Cookie", requesterCookie);
    expect(res.status).toBe(200);
    const saved = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(saved.requesterResolutionIndicatedAt).not.toBeNull();
    expect(saved.status).toBe("IN_PROGRESS");
  });
});

describe("Revised authorization matrix (specification §4)", () => {
  it("AUTHZ-07 lets an Administrator claim and reassign a Ticket", async () => {
    const ticket = await createFixtureTicket("OPEN");
    const claim = await request(app).patch(`/api/staff/tickets/${ticket.id}/owner`).set("Cookie", adminCookie).send({ ticketOwnerId: staffId });
    expect(claim.status).toBe(200);
    const reassign = await request(app).patch(`/api/staff/tickets/${ticket.id}/owner`).set("Cookie", adminCookie).send({ ticketOwnerId: otherStaffId });
    expect(reassign.status).toBe(200);
    expect(reassign.body.data.ticketOwnerId).toBe(otherStaffId);
  });

  it("AUTHZ-08 lets an Administrator set IT Priority", async () => {
    const ticket = await createFixtureTicket("OPEN");
    const res = await request(app).patch(`/api/staff/tickets/${ticket.id}/priority`).set("Cookie", adminCookie).send({ itPriority: "HIGH" });
    expect(res.status).toBe(200);
    expect(res.body.data.itPriority).toBe("HIGH");
  });

  it("AUTHZ-09 lets an Administrator change status, with the resolution gate applying to them too", async () => {
    const ticket = await createFixtureTicket("OPEN");
    const moved = await setStatus(ticket.id, { status: "IN_PROGRESS" }, adminCookie);
    expect(moved.status).toBe(200);
    await createAction(ticket.id, { description: "Open work" }, adminCookie);
    const blocked = await setStatus(ticket.id, { status: "RESOLVED" }, adminCookie);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("RESOLUTION_BLOCKED");
  });

  it("AUTHZ-10 lets an Administrator post a Public Comment and an Internal Note", async () => {
    const ticket = await createFixtureTicket("OPEN");
    const comment = await request(app).post(`/api/tickets/${ticket.id}/comments`).set("Cookie", adminCookie).send({ content: "Admin comment" });
    const note = await request(app).post(`/api/tickets/${ticket.id}/notes`).set("Cookie", adminCookie).send({ content: "Admin note" });
    expect(comment.status).toBe(201);
    expect(note.status).toBe(201);
  });

  it("AUTHZ-11 still rejects a Requester changing status, owner, or priority on their own Ticket", async () => {
    const ticket = await createFixtureTicket("OPEN");
    const status = await setStatus(ticket.id, { status: "CANCELLED" }, requesterCookie);
    const owner = await request(app).patch(`/api/staff/tickets/${ticket.id}/owner`).set("Cookie", requesterCookie).send({ ticketOwnerId: staffId });
    const priority = await request(app).patch(`/api/staff/tickets/${ticket.id}/priority`).set("Cookie", requesterCookie).send({ itPriority: "HIGH" });
    expect([status.status, owner.status, priority.status]).toEqual([403, 403, 403]);
  });
});
