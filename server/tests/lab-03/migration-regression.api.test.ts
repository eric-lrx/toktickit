import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAs } from "./testAuth.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).
//
// Not in the handout's minimum file list — added deliberately (tests.md §1)
// because specification.md §5.2/§10 and the Issue 32 Definition of Done both
// require the RequesterUser -> User migration to be proven correct, not just
// eyeballed.

describe("MIG-04 — every pre-existing Ticket has itPriority backfilled from requestedPriority", () => {
  it("matches requestedPriority for every Ticket that predates the Issue 35 migration", async () => {
    // Scoped to Tickets that existed BEFORE the itPriority column did
    // (createdAt earlier than that migration's own recorded finished_at,
    // read from Prisma's own migration history) — not "every Ticket minus a
    // growing list of known-divergent fixtures by ticket-number prefix,"
    // which broke three separate times over this sprint as new, entirely
    // legitimate sources of post-migration divergence kept appearing
    // (Issue 35's seed fixtures, Issue 36's STAFF-D-07, and now Issue 39's
    // own E2E Tickets — which get real auto-generated ticket numbers with
    // no distinguishing prefix to exclude by at all). A Ticket created
    // after the migration ran gets its itPriority from BR-35's ongoing
    // "copies requestedPriority at creation" rule, not from the backfill —
    // it was never this test's subject to begin with, regardless of what
    // created it or what its ticket number looks like.
    //
    // The date cutoff and the two-column comparison are deliberately split
    // across two separate steps rather than one raw-SQL query: a first
    // attempt compared "createdAt" (timestamp, no time zone) directly
    // against _prisma_migrations.finished_at (timestamptz) in one SQL
    // expression, and this session's Postgres timezone (Asia/Bangkok,
    // UTC+7) silently shifted that comparison by 7 hours, mis-scoping
    // dozens of genuinely post-migration Tickets as "pre-migration."
    // Prisma's own query builder resolves a JS Date consistently regardless
    // of session time zone, so the date filter goes through `findMany`
    // here; only the actual two-column comparison — which Prisma's query
    // builder can't express portably — happens in plain JS afterward.
    const migration = await getPrisma().$queryRaw<{ finished_at: Date }[]>`
      SELECT finished_at FROM "_prisma_migrations" WHERE migration_name = '20260916121616_lab3_ticket_workflow_fields'
    `;
    const preMigrationTickets = await getPrisma().ticket.findMany({
      where: { createdAt: { lt: migration[0].finished_at } },
      select: { itPriority: true, requestedPriority: true },
    });
    const mismatched = preMigrationTickets.filter((t) => t.itPriority !== t.requestedPriority);
    expect(mismatched.length).toBe(0);
  });
});

const SEEDED_REQUESTER_EMAILS = [
  "ada.lovelace@example.com",
  "grace.hopper@example.com",
  "alan.turing@example.com",
  "linus.torvalds@example.com",
];
const SEEDED_INACTIVE_REQUESTER_EMAIL = "ivy.inactive@example.com";
const BCRYPT_HASH_SHAPE = /^\$2[aby]\$\d{2}\$/;

describe("MIG-02/MIG-03 — every pre-existing Requester survived the User rename", () => {
  it("resolves every seeded active Requester email to a correctly backfilled User row", async () => {
    const prisma = getPrisma();
    for (const email of SEEDED_REQUESTER_EMAILS) {
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user, `expected a migrated User row for ${email}`).not.toBeNull();
      expect(user!.role).toBe("REQUESTER");
      expect(user!.isActive).toBe(true);
      expect(user!.passwordHash).toMatch(BCRYPT_HASH_SHAPE);
      // mustChangePassword is NOT asserted here: it correctly flips to false
      // once an account completes a real change-password flow (API-14), and
      // these shared named seed accounts are also used for manual/API
      // verification elsewhere in the sprint. That flip is the feature
      // working, not a migration regression — the stable, permanent
      // invariant is checked below on the inactive account instead, which
      // can never log in to change it.
    }
  });

  it("keeps the seeded inactive Requester inactive, still gated, after migration", async () => {
    const user = await getPrisma().user.findUnique({ where: { email: SEEDED_INACTIVE_REQUESTER_EMAIL } });
    expect(user).not.toBeNull();
    expect(user!.isActive).toBe(false);
    expect(user!.role).toBe("REQUESTER");
    // Can never log in (isActive:false), so unlike the active accounts above
    // this one's mustChangePassword is a stable, permanent invariant.
    expect(user!.mustChangePassword).toBe(true);
  });
});

describe("MIG-01/MIG-06 — a Ticket owned by a migrated Requester is still reachable, now under real auth", () => {
  let requesterId: number;
  let cookie: string;
  let categoryId: number;
  let relatedSystemId: number;

  beforeAll(async () => {
    const prisma = getPrisma();
    const requester = await prisma.user.findFirstOrThrow({
      where: { email: "ada.lovelace@example.com" },
    });
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    requesterId = requester.id;
    categoryId = category.id;
    relatedSystemId = relatedSystem.id;
    cookie = await loginAs(requester.email);
  });

  it("creates and re-fetches a Ticket by the same migrated owner, content and attachments intact", async () => {
    const create = await request(app)
      .post("/api/tickets")
      .set("Cookie", cookie)
      .field("categoryId", String(categoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field("summary", "Migration regression fixture ticket")
      .field("description", "Proves ownership survives the RequesterUser -> User rename")
      .field("requestedPriority", "LOW")
      .attach("attachments", Buffer.from("fixture bytes"), { filename: "evidence.jpg", contentType: "image/jpeg" });
    expect(create.status).toBe(201);
    const ticketId = create.body.data.id;
    const ticketNumber = create.body.data.ticketNumber;

    const fetched = await request(app).get(`/api/tickets/${ticketId}`).set("Cookie", cookie);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.ticketNumber).toBe(ticketNumber);
    expect(fetched.body.data.requesterId).toBe(requesterId);
    expect(fetched.body.data.attachments).toHaveLength(1);
    expect(fetched.body.data.attachments[0].originalName).toBe("evidence.jpg");
  });
});

describe("MIG-05 — X-Dev-Requester-Id is fully removed, not merely revalidated", () => {
  // Issue 32 (still active header) fixed a narrower gap: the header
  // accepted any active User id regardless of role. Issue 34 removes the
  // header mechanism from every route entirely (specification.md §7 step
  // 9) — so it must now be silently ignored, full stop. A request that only
  // carries the header (no session cookie) must fail with 401 (no session),
  // never with the old header-validation 400, and never succeed.
  it("ignores the header entirely — a Requester id via header alone is 401, not treated as identity", async () => {
    const requester = await getPrisma().user.findFirstOrThrow({ where: { role: "REQUESTER", isActive: true } });
    const res = await request(app).get("/api/tickets").set("X-Dev-Requester-Id", String(requester.id));
    expect(res.status).toBe(401);
  });

  it("ignores the header even for IT Staff/Administrator ids — still 401, not 400", async () => {
    const staff = await getPrisma().user.findFirstOrThrow({ where: { role: "IT_STAFF", isActive: true } });
    const res = await request(app).get("/api/tickets").set("X-Dev-Requester-Id", String(staff.id));
    expect(res.status).toBe(401);
  });

  it("a real session works normally even when an (ignored) X-Dev-Requester-Id header is also present", async () => {
    const requester = await getPrisma().user.findFirstOrThrow({ where: { role: "REQUESTER", isActive: true } });
    const otherRequester = await getPrisma().user.findFirstOrThrow({
      where: { role: "REQUESTER", isActive: true, id: { not: requester.id } },
    });
    const cookie = await loginAs(requester.email);
    // The header claims a DIFFERENT Requester's id — if it were honored at
    // all, this would return someone else's Tickets.
    const res = await request(app)
      .get("/api/tickets")
      .set("Cookie", cookie)
      .set("X-Dev-Requester-Id", String(otherRequester.id));
    expect(res.status).toBe(200);
    expect(res.body.data.every((t: { requesterId: number }) => t.requesterId === requester.id)).toBe(true);
  });
});
