import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAs } from "../lab-03/testAuth.js";

// Not in the handout's minimum file list — added on purpose (tests.md §1):
// specification.md §7 requires the Lab 4 migration to be proven lossless,
// not eyeballed.
//
// "Pre-migration" rows are selected by createdAt < the migration's recorded
// finished_at, resolved through Prisma's query builder rather than a raw SQL
// comparison: the Lab 3 MIG-04 incident showed that comparing a timestamp
// column with the timestamptz finished_at inside SQL gets shifted by the
// session time zone (Asia/Bangkok here).
async function migrationFinishedAt(): Promise<Date> {
  const rows = await getPrisma().$queryRaw<{ finished_at: Date }[]>`
    SELECT finished_at FROM "_prisma_migrations" WHERE migration_name LIKE '%_lab4_actions_taken'
  `;
  expect(rows.length, "the lab4_actions_taken migration must be applied").toBe(1);
  return rows[0].finished_at;
}

describe("MIG-01 — every pre-migration Ticket starts at version 1", () => {
  it("has version = 1 on every Ticket created before the migration", async () => {
    const cutoff = await migrationFinishedAt();
    const legacy = await getPrisma().ticket.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true, version: true, updatedAt: true },
    });
    expect(legacy.length).toBeGreaterThan(0);
    // A legacy Ticket touched through the Lab 4 API afterward legitimately
    // moves past 1; only rows untouched since the migration are the subject.
    const untouched = legacy.filter((t) => t.updatedAt < cutoff);
    expect(untouched.length).toBeGreaterThan(0);
    expect(untouched.filter((t) => t.version !== 1)).toEqual([]);
  });
});

describe("MIG-02 — legacy RESOLVED/CLOSED Tickets got resolvedAt backfilled from updatedAt", () => {
  it("sets resolvedAt = updatedAt on every such Ticket untouched since the migration", async () => {
    const cutoff = await migrationFinishedAt();
    const legacy = await getPrisma().ticket.findMany({
      where: { createdAt: { lt: cutoff }, updatedAt: { lt: cutoff }, status: { in: ["RESOLVED", "CLOSED"] } },
      select: { id: true, resolvedAt: true, updatedAt: true },
    });
    expect(legacy.length).toBeGreaterThan(0);
    const wrong = legacy.filter((t) => t.resolvedAt?.getTime() !== t.updatedAt.getTime());
    expect(wrong).toEqual([]);
  });

  it("leaves resolvedAt null on legacy Tickets that were never resolved", async () => {
    const cutoff = await migrationFinishedAt();
    const count = await getPrisma().ticket.count({
      where: {
        createdAt: { lt: cutoff },
        updatedAt: { lt: cutoff },
        status: { notIn: ["RESOLVED", "CLOSED"] },
        resolvedAt: { not: null },
      },
    });
    expect(count).toBe(0);
  });
});

describe("MIG-03 — legacy Tickets are never blocked by the resolution gate", () => {
  it("resolves a pre-migration Ticket that has no Actions Taken", async () => {
    const cutoff = await migrationFinishedAt();
    // A Lab 3 test fixture, never a seeded or hand-created Ticket: resolving
    // it changes legacy data, so the subject must be disposable.
    const legacy = await getPrisma().ticket.findFirst({
      where: {
        createdAt: { lt: cutoff },
        ticketNumber: { startsWith: "TKT-TEST-" },
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] },
        actionsTaken: { none: {} },
      },
      orderBy: { id: "asc" },
    });
    expect(legacy, "expected a pre-migration fixture Ticket without actions").not.toBeNull();
    const cookie = await loginAs("margaret.hamilton@toktickit.com");
    const res = await request(app).patch(`/api/staff/tickets/${legacy!.id}/status`).set("Cookie", cookie).send({ status: "RESOLVED" });
    expect(res.status).toBe(200);
    expect(res.body.data.resolvedAt).not.toBeNull();
  });
});

describe("MIG-04 — Lab 1–3 data is still reachable after the migration", () => {
  let requesterCookie: string;
  let staffCookie: string;

  beforeAll(async () => {
    requesterCookie = await loginAs("ada.lovelace@example.com");
    staffCookie = await loginAs("margaret.hamilton@toktickit.com");
  });

  it("serves a pre-migration Ticket with its Attachments to its owner, unchanged", async () => {
    const cutoff = await migrationFinishedAt();
    const prisma = getPrisma();
    const ada = await prisma.user.findUniqueOrThrow({ where: { email: "ada.lovelace@example.com" } });
    const legacy = await prisma.ticket.findFirst({
      where: { requesterId: ada.id, createdAt: { lt: cutoff }, attachments: { some: {} } },
      include: { attachments: true },
      orderBy: { id: "asc" },
    });
    expect(legacy, "expected a pre-migration Ticket with attachments owned by Ada").not.toBeNull();

    const res = await request(app).get(`/api/tickets/${legacy!.id}`).set("Cookie", requesterCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      ticketNumber: legacy!.ticketNumber,
      summary: legacy!.summary,
      description: legacy!.description,
    });
    expect(res.body.data.attachments.map((a: { id: number }) => a.id).sort()).toEqual(
      legacy!.attachments.map((a) => a.id).sort()
    );
  });

  it("serves pre-migration Public Comments and Internal Notes to staff", async () => {
    const cutoff = await migrationFinishedAt();
    const prisma = getPrisma();
    const withBoth = await prisma.ticket.findFirst({
      where: { createdAt: { lt: cutoff }, publicComments: { some: {} }, internalNotes: { some: {} } },
      include: { _count: { select: { publicComments: true, internalNotes: true } } },
      orderBy: { id: "asc" },
    });
    expect(withBoth, "expected a pre-migration Ticket with comments and notes").not.toBeNull();

    const detail = await request(app).get(`/api/staff/tickets/${withBoth!.id}`).set("Cookie", staffCookie);
    expect(detail.status).toBe(200);
    expect(detail.body.data.publicComments.length).toBe(withBoth!._count.publicComments);
    expect(detail.body.data.internalNotes.length).toBe(withBoth!._count.internalNotes);
  });

  it("gives legacy Tickets zero Actions Taken", async () => {
    const cutoff = await migrationFinishedAt();
    const legacyWithActions = await getPrisma().ticket.count({
      where: { createdAt: { lt: cutoff }, ticketNumber: { not: { startsWith: "TKT-9999-" } }, actionsTaken: { some: {} } },
    });
    expect(legacyWithActions).toBe(0);
  });
});

describe("MIG-06 — the seed is idempotent", () => {
  it("creates nothing new when run a second time", async () => {
    const prisma = getPrisma();
    const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const counts = async () => ({
      users: await prisma.user.count(),
      tickets: await prisma.ticket.count(),
      actions: await prisma.actionTaken.count(),
      comments: await prisma.publicComment.count(),
      notes: await prisma.internalNote.count(),
    });

    execSync("npx tsx prisma/seed.ts", { cwd: serverDir, stdio: "pipe" });
    const afterFirst = await counts();
    execSync("npx tsx prisma/seed.ts", { cwd: serverDir, stdio: "pipe" });
    const afterSecond = await counts();
    expect(afterSecond).toEqual(afterFirst);
  }, 120_000);
});
