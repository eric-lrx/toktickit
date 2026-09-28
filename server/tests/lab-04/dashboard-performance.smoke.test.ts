import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma, onPrismaQuery } from "../../src/prisma.js";
import { loginAs } from "../lab-03/testAuth.js";

// AC-24 / api-spec.md: both dashboards answer under 300 ms on at least 2,000
// Tickets and 2,000 Actions Taken, with a fixed number of SQL statements.
const THRESHOLD_MS = 300;
const MIN_TICKETS = 2000;
const MIN_ACTIONS = 2000;
const VOLUME_TICKET_SUMMARY = "Performance smoke volume fixture";

// The action volume lives on one CLOSED fixture Ticket, as COMPLETED actions
// with no assignee: it adds rows to every table the dashboards read without
// changing any dashboard figure a person would look at. Topped up only when
// missing, so repeated runs do not keep growing it.
async function ensureVolume() {
  const prisma = getPrisma();
  const tickets = await prisma.ticket.count();
  expect(tickets, `need at least ${MIN_TICKETS} Tickets in the local database`).toBeGreaterThanOrEqual(MIN_TICKETS);

  const actions = await prisma.actionTaken.count();
  if (actions >= MIN_ACTIONS) return;
  const performer = await prisma.user.findUniqueOrThrow({ where: { email: "margaret.hamilton@toktickit.com" } });
  const requester = await prisma.user.findUniqueOrThrow({ where: { email: "ada.lovelace@example.com" } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  const holder =
    (await prisma.ticket.findFirst({ where: { summary: VOLUME_TICKET_SUMMARY } })) ??
    (await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-TEST-PERF-${Date.now()}`,
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: VOLUME_TICKET_SUMMARY,
        description: "Holds bulk COMPLETED actions for the performance-smoke test.",
        requestedPriority: "LOW",
        itPriority: "LOW",
        status: "CLOSED",
      },
    }));
  await prisma.actionTaken.createMany({
    data: Array.from({ length: MIN_ACTIONS - actions }, (_, i) => ({
      ticketId: holder.id,
      performedById: performer.id,
      description: `Bulk completed action ${i + 1}`,
      result: "Completed",
      status: "COMPLETED" as const,
    })),
  });
}

async function median(fn: () => Promise<unknown>, runs = 5) {
  await fn(); // warm-up (connection pool, JIT)
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

// Statement text with whitespace collapsed and bind parameters (including the
// length of a batched `IN (...)` list) erased, so two calls that differ only
// in how many rows they load produce the same text.
const normalize = (sql: string) =>
  sql.replace(/\s+/g, " ").replace(/IN \((\$\d+,?)+\)/g, "IN (…)").replace(/\$\d+/g, "$n");

async function captureQueries(fn: () => Promise<unknown>) {
  const statements: string[] = [];
  const stop = onPrismaQuery((e) => statements.push(normalize(e.query)));
  try {
    await fn();
  } finally {
    stop();
  }
  return statements;
}

let staffCookie: string;
let otherStaffCookie: string;
let zeroStaffCookie: string;
let requesterCookie: string;

beforeAll(async () => {
  await ensureVolume();
  staffCookie = await loginAs("margaret.hamilton@toktickit.com");
  otherStaffCookie = await loginAs("katherine.johnson@toktickit.com");
  zeroStaffCookie = await loginAs("zed.empty@toktickit.com");
  requesterCookie = await loginAs("ada.lovelace@example.com");
}, 60_000);

describe("Dashboard performance smoke", () => {
  it(`PERF-01 staff dashboard answers under ${THRESHOLD_MS} ms (median of 5) on the full local volume`, async () => {
    const ms = await median(async () => {
      const res = await request(app).get("/api/dashboard/staff").set("Cookie", staffCookie);
      expect(res.status).toBe(200);
    });
    console.log(`PERF-01 staff dashboard median: ${ms.toFixed(1)} ms (tickets=${await getPrisma().ticket.count()}, actions=${await getPrisma().actionTaken.count()})`);
    expect(ms).toBeLessThan(THRESHOLD_MS);
  });

  it(`PERF-02 requester dashboard answers under ${THRESHOLD_MS} ms (median of 5) on the same volume`, async () => {
    const ms = await median(async () => {
      const res = await request(app).get("/api/dashboard/requester").set("Cookie", requesterCookie);
      expect(res.status).toBe(200);
    });
    console.log(`PERF-02 requester dashboard median: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(THRESHOLD_MS);
  });

  // Prisma loads a relation with one batched `WHERE id IN (…)` statement and
  // skips it when there are no rows. Two of those batches exist here:
  // - the Tickets of My Open Actions, which depends on the user, so a user
  //   with zero open actions issues one statement fewer;
  // - the owners of Recent Tickets, which depends on shared data (whether any
  //   of the 10 most recently updated Tickets has an owner), not on the user.
  //   Comparing raw counts made the test fail whenever that shared data
  //   changed between two calls (tests.md §9), so that batch is left out of
  //   the per-user comparison.
  // A per-row (N+1) pattern would run the same statement once per row, so each
  // call must run every statement at most once.
  it("PERF-03 staff dashboard issues the same small set of queries whatever the number of rows", async () => {
    const openCount = (email: string) =>
      getPrisma().actionTaken.count({ where: { assignee: { email }, status: { in: ["PLANNED", "IN_PROGRESS"] } } });
    const [many, few] = await Promise.all([openCount("margaret.hamilton@toktickit.com"), openCount("katherine.johnson@toktickit.com")]);
    expect(many, "Margaret and Katherine need different, non-zero numbers of open actions").not.toBe(few);
    expect(Math.min(many, few)).toBeGreaterThan(0);

    const busy = await captureQueries(() => request(app).get("/api/dashboard/staff").set("Cookie", staffCookie));
    const other = await captureQueries(() => request(app).get("/api/dashboard/staff").set("Cookie", otherStaffCookie));
    const empty = await captureQueries(() => request(app).get("/api/dashboard/staff").set("Cookie", zeroStaffCookie));
    console.log(`PERF-03 staff dashboard queries: ${many} open actions → ${busy.length}, ${few} open actions → ${other.length}, zero-data user → ${empty.length}`);

    for (const [label, statements] of [["busy", busy], ["other", other], ["empty", empty]] as const) {
      expect(new Set(statements).size, `${label}: a statement ran more than once`).toBe(statements.length);
      expect(statements.length, `${label}: statement count`).toBeLessThanOrEqual(12);
    }
    const recentOwners = /FROM "public"\."User" WHERE "public"\."User"\."id" IN \(…\)/;
    const perUser = (statements: string[]) => statements.filter((s) => !recentOwners.test(s)).sort();
    expect(perUser(busy)).toEqual(perUser(other));
    expect(perUser(empty).length).toBeLessThanOrEqual(perUser(busy).length);
  });
});
