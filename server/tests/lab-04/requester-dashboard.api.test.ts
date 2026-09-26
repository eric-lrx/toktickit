import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAs } from "../lab-03/testAuth.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).
// Every expected figure is a direct Prisma query filtered by the same
// Requester (AC-19), never a hard-coded number.

interface Metric {
  key: string;
  label: string;
  count: number;
  drillDown: { path: string; query?: Record<string, string> };
}
interface RequesterDashboard {
  metrics: Metric[];
  recentTickets: { id: number; requesterId?: number }[];
  recentlyResolved: { id: number; status: string; resolvedAt: string }[];
}

let adaId: number;
let graceId: number;
let adaCookie: string;
let zoeCookie: string;
let staffCookie: string;
let adminCookie: string;

beforeAll(async () => {
  const prisma = getPrisma();
  adaId = (await prisma.user.findUniqueOrThrow({ where: { email: "ada.lovelace@example.com" } })).id;
  graceId = (await prisma.user.findUniqueOrThrow({ where: { email: "grace.hopper@example.com" } })).id;
  adaCookie = await loginAs("ada.lovelace@example.com");
  zoeCookie = await loginAs("zoe.empty@example.com");
  staffCookie = await loginAs("margaret.hamilton@toktickit.com");
  adminCookie = await loginAs("barbara.liskov@toktickit.com");
});

async function dashboard(cookie = adaCookie) {
  const res = await request(app).get("/api/dashboard/requester").set("Cookie", cookie);
  expect(res.status).toBe(200);
  return res.body.data as RequesterDashboard;
}

const metric = (data: RequesterDashboard, key: string) => {
  const m = data.metrics.find((x) => x.key === key);
  expect(m, `metric ${key}`).toBeDefined();
  return m!;
};

const BUCKETS: [string, TicketStatus[]][] = [
  ["myOpen", ["NEW", "OPEN", "IN_PROGRESS", "REOPENED"]],
  ["waitingForMe", ["WAITING_FOR_REQUESTER"]],
  ["resolved", ["RESOLVED"]],
  ["closed", ["CLOSED"]],
];

describe("GET /api/dashboard/requester", () => {
  it("DASH-R-01 each count equals a direct count of this Requester's Tickets, and all four are non-zero for Ada", async () => {
    const data = await dashboard();
    for (const [key, statuses] of BUCKETS) {
      const expected = await getPrisma().ticket.count({ where: { requesterId: adaId, status: { in: statuses } } });
      expect(metric(data, key).count, key).toBe(expected);
      expect(expected, `${key} should be non-zero for the demo Requester`).toBeGreaterThan(0);
    }
  });

  it("DASH-R-02 never counts or lists another Requester's Tickets", async () => {
    const data = await dashboard();
    const graceTicketIds = new Set(
      (await getPrisma().ticket.findMany({ where: { requesterId: graceId }, select: { id: true } })).map((t) => t.id)
    );
    expect(graceTicketIds.size).toBeGreaterThan(0);
    for (const t of [...data.recentTickets, ...data.recentlyResolved]) expect(graceTicketIds.has(t.id)).toBe(false);
    const allAda = await getPrisma().ticket.count({ where: { requesterId: adaId } });
    const counted = data.metrics.reduce((sum, m) => sum + m.count, 0);
    expect(counted).toBeLessThanOrEqual(allAda);
  });

  it("DASH-R-03 My Recent Tickets are this Requester's 5 most recently updated", async () => {
    const data = await dashboard();
    const expected = await getPrisma().ticket.findMany({
      where: { requesterId: adaId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 5,
      select: { id: true },
    });
    expect(data.recentTickets.map((t) => t.id)).toEqual(expected.map((t) => t.id));
  });

  it("DASH-R-04 Recently Resolved lists up to 5 RESOLVED/CLOSED Tickets by resolvedAt", async () => {
    const data = await dashboard();
    const expected = await getPrisma().ticket.findMany({
      where: { requesterId: adaId, status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { not: null } },
      orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
      take: 5,
      select: { id: true },
    });
    expect(data.recentlyResolved.map((t) => t.id)).toEqual(expected.map((t) => t.id));
    expect(data.recentlyResolved.every((t) => ["RESOLVED", "CLOSED"].includes(t.status))).toBe(true);
    expect(data.recentlyResolved.length).toBeGreaterThan(0);
  });

  it("DASH-R-05 shows zeros and empty lists for a Requester with no Tickets, drill-downs kept", async () => {
    const data = await dashboard(zoeCookie);
    for (const [key] of BUCKETS) {
      expect(metric(data, key).count, key).toBe(0);
      expect(metric(data, key).drillDown.path).toBe("/tickets");
    }
    expect(data.recentTickets).toEqual([]);
    expect(data.recentlyResolved).toEqual([]);
  });

  it("DASH-R-06 each card's drill-down, applied to My Tickets, returns exactly the card's count", async () => {
    const data = await dashboard();
    for (const m of data.metrics) {
      const params = new URLSearchParams(m.drillDown.query);
      const res = await request(app).get(`/api/tickets?${params.toString()}`).set("Cookie", adaCookie);
      expect(res.status, m.key).toBe(200);
      expect(res.body.meta.total, m.key).toBe(m.count);
    }
  });

  it("DASH-R-07 rejects IT Staff and Administrators (403) and a missing session (401)", async () => {
    expect((await request(app).get("/api/dashboard/requester").set("Cookie", staffCookie)).status).toBe(403);
    expect((await request(app).get("/api/dashboard/requester").set("Cookie", adminCookie)).status).toBe(403);
    expect((await request(app).get("/api/dashboard/requester")).status).toBe(401);
  });
});

describe("GET /api/tickets — status filter (drill-down support)", () => {
  it("DASH-R-08 filters by one or several statuses, own Tickets only, and names an invalid value", async () => {
    const list = await request(app).get("/api/tickets?status=NEW,OPEN&pageSize=50").set("Cookie", adaCookie);
    expect(list.status).toBe(200);
    expect(list.body.data.every((t: { status: string; requesterId: number }) => ["NEW", "OPEN"].includes(t.status) && t.requesterId === adaId)).toBe(true);
    expect(list.body.meta.total).toBe(await getPrisma().ticket.count({ where: { requesterId: adaId, status: { in: ["NEW", "OPEN"] } } }));

    const bad = await request(app).get("/api/tickets?status=OPEN,DONE").set("Cookie", adaCookie);
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain("DONE");
  });
});
