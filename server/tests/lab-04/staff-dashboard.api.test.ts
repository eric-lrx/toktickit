import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAs } from "../lab-03/testAuth.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).
// Every expected number is a direct Prisma query run here, against the same
// database, at the same moment — never a hard-coded figure (AC-19).

const ACTIVE: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "REOPENED"];

interface Metric {
  key: string;
  label: string;
  count: number;
  drillDown: { path: string; query?: Record<string, string> };
}

let staffCookie: string;
let staffId: number;
let zeroStaffCookie: string;
let adminCookie: string;
let requesterCookie: string;

beforeAll(async () => {
  const prisma = getPrisma();
  staffId = (await prisma.user.findUniqueOrThrow({ where: { email: "margaret.hamilton@toktickit.com" } })).id;
  staffCookie = await loginAs("margaret.hamilton@toktickit.com");
  zeroStaffCookie = await loginAs("zed.empty@toktickit.com");
  adminCookie = await loginAs("barbara.liskov@toktickit.com");
  requesterCookie = await loginAs("ada.lovelace@example.com");
});

async function dashboard(cookie = staffCookie) {
  const res = await request(app).get("/api/dashboard/staff").set("Cookie", cookie);
  expect(res.status).toBe(200);
  return res.body.data as { metrics: Metric[]; myOpenActions: { total: number; items: { id: number; ticketId: number }[] }; recentTickets: { id: number }[]; accounts?: { active: number; inactive: number } };
}

const metric = (data: { metrics: Metric[] }, key: string) => {
  const m = data.metrics.find((x) => x.key === key);
  expect(m, `metric ${key}`).toBeDefined();
  return m!;
};

describe("GET /api/dashboard/staff", () => {
  it("DASH-S-01 New / Open / In Progress / Waiting equal direct counts", async () => {
    const data = await dashboard();
    const prisma = getPrisma();
    const pairs: [string, TicketStatus][] = [
      ["new", "NEW"],
      ["open", "OPEN"],
      ["inProgress", "IN_PROGRESS"],
      ["waitingForRequester", "WAITING_FOR_REQUESTER"],
    ];
    for (const [key, status] of pairs) {
      expect(metric(data, key).count, key).toBe(await prisma.ticket.count({ where: { status } }));
    }
  });

  it("DASH-S-02 Unassigned, My Assigned, High Priority equal direct counts and exclude CLOSED/CANCELLED", async () => {
    const data = await dashboard();
    const prisma = getPrisma();
    expect(metric(data, "unassigned").count).toBe(await prisma.ticket.count({ where: { ticketOwnerId: null, status: { in: ACTIVE } } }));
    expect(metric(data, "myAssigned").count).toBe(await prisma.ticket.count({ where: { ticketOwnerId: staffId, status: { in: ACTIVE } } }));
    expect(metric(data, "highPriority").count).toBe(await prisma.ticket.count({ where: { itPriority: "HIGH", status: { in: ACTIVE } } }));
    expect(metric(data, "myAssigned").count).toBeGreaterThan(0);
  });

  it("DASH-S-03 My Open Actions counts only my PLANNED/IN_PROGRESS actions and lists the 10 oldest", async () => {
    const data = await dashboard();
    const where = { assigneeId: staffId, status: { in: ["PLANNED", "IN_PROGRESS"] as ("PLANNED" | "IN_PROGRESS")[] } };
    const total = await getPrisma().actionTaken.count({ where });
    const expected = await getPrisma().actionTaken.findMany({ where, orderBy: [{ actionAt: "asc" }, { id: "asc" }], take: 10, select: { id: true } });
    expect(metric(data, "myOpenActions").count).toBe(total);
    expect(data.myOpenActions.total).toBe(total);
    expect(data.myOpenActions.items.map((a) => a.id)).toEqual(expected.map((a) => a.id));
    expect(data.myOpenActions.items.length).toBeLessThanOrEqual(10);
    expect(total).toBeGreaterThan(0);
  });

  it("DASH-S-04 Recent Tickets are the 10 most recently updated", async () => {
    const data = await dashboard();
    const expected = await getPrisma().ticket.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 10, select: { id: true } });
    expect(data.recentTickets.map((t) => t.id)).toEqual(expected.map((t) => t.id));
  });

  it("DASH-S-05 shows zero for an IT Staff user with nothing assigned, drill-downs still present", async () => {
    const data = await dashboard(zeroStaffCookie);
    expect(metric(data, "myAssigned").count).toBe(0);
    expect(metric(data, "myOpenActions").count).toBe(0);
    expect(data.myOpenActions).toEqual({ total: 0, items: [] });
    expect(metric(data, "myAssigned").drillDown.path).toBe("/queue");
    expect(metric(data, "myOpenActions").drillDown.path).toBe("#my-open-actions");
  });

  it("DASH-S-06 every Queue drill-down, applied to the queue API, returns exactly the card's count", async () => {
    const data = await dashboard();
    const queueMetrics = data.metrics.filter((m) => m.drillDown.path === "/queue");
    expect(queueMetrics.map((m) => m.key).sort()).toEqual(["highPriority", "inProgress", "myAssigned", "new", "open", "unassigned", "waitingForRequester"]);
    for (const m of queueMetrics) {
      const params = new URLSearchParams(m.drillDown.query);
      const res = await request(app).get(`/api/staff/tickets?${params.toString()}`).set("Cookie", staffCookie);
      expect(res.status, m.key).toBe(200);
      expect(res.body.meta.total, m.key).toBe(m.count);
    }
  });

  it("DASH-S-07 adds active/inactive account counts for an Administrator", async () => {
    const data = await dashboard(adminCookie);
    expect(data.accounts).toEqual({
      active: await getPrisma().user.count({ where: { isActive: true } }),
      inactive: await getPrisma().user.count({ where: { isActive: false } }),
    });
    expect(data.metrics.map((m) => m.key)).toEqual((await dashboard()).metrics.map((m) => m.key));
  });

  it("DASH-S-08 leaves the account counts out for IT Staff", async () => {
    const data = await dashboard();
    expect(data.accounts).toBeUndefined();
  });

  it("DASH-S-09 rejects a Requester (403) and a missing session (401)", async () => {
    expect((await request(app).get("/api/dashboard/staff").set("Cookie", requesterCookie)).status).toBe(403);
    expect((await request(app).get("/api/dashboard/staff")).status).toBe(401);
  });
});

describe("GET /api/staff/tickets — comma-separated status (drill-down support)", () => {
  it("DASH-S-10 accepts a list, keeps a single value working, and names an invalid value", async () => {
    const list = await request(app).get("/api/staff/tickets?status=OPEN,REOPENED&pageSize=50").set("Cookie", staffCookie);
    expect(list.status).toBe(200);
    expect(list.body.data.every((t: { status: string }) => ["OPEN", "REOPENED"].includes(t.status))).toBe(true);
    expect(list.body.meta.total).toBe(await getPrisma().ticket.count({ where: { status: { in: ["OPEN", "REOPENED"] } } }));

    const single = await request(app).get("/api/staff/tickets?status=OPEN&pageSize=10").set("Cookie", staffCookie);
    expect(single.body.meta.total).toBe(await getPrisma().ticket.count({ where: { status: "OPEN" } }));

    const bad = await request(app).get("/api/staff/tickets?status=OPEN,DONE").set("Cookie", staffCookie);
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain("DONE");
  });
});
