import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).
//
// Not in the handout's minimum file list — added deliberately (tests.md §1)
// because specification.md §5.2/§10 and the Issue 32 Definition of Done both
// require the RequesterUser -> User migration to be proven correct, not just
// eyeballed. MIG-04 (itPriority backfill) is out of scope here: that column
// doesn't exist until Issue 36 adds it (specification.md §7 migration path,
// steps 5-7 are scoped to the Ticket workflow Issues, not this one).

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

describe("MIG-01 — a Ticket owned by a migrated Requester is still reachable", () => {
  let requesterId: number;
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
  });

  it("creates and re-fetches a Ticket by the same migrated owner id, content and attachments intact", async () => {
    const create = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(requesterId))
      .field("categoryId", String(categoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field("summary", "Migration regression fixture ticket")
      .field("description", "Proves ownership survives the RequesterUser -> User rename")
      .field("requestedPriority", "LOW")
      .attach("attachments", Buffer.from("fixture bytes"), { filename: "evidence.jpg", contentType: "image/jpeg" });
    expect(create.status).toBe(201);
    const ticketId = create.body.data.id;
    const ticketNumber = create.body.data.ticketNumber;

    const fetched = await request(app).get(`/api/tickets/${ticketId}`).set("X-Dev-Requester-Id", String(requesterId));
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.ticketNumber).toBe(ticketNumber);
    expect(fetched.body.data.requesterId).toBe(requesterId);
    expect(fetched.body.data.attachments).toHaveLength(1);
    expect(fetched.body.data.attachments[0].originalName).toBe("evidence.jpg");
  });
});

describe("Regression — the legacy header must not accept a non-Requester id post-migration", () => {
  // Discovered while implementing Issue 32: once RequesterUser became User,
  // the same table also holds IT Staff and Administrator rows. Without the
  // role check added to requireActiveRequester (src/requesterAuth.ts), an IT
  // Staff or Administrator id sent as X-Dev-Requester-Id would pass (the row
  // exists and is active) and let that person's numeric id create/see
  // Tickets as if they were a Requester.
  it("rejects an active IT Staff id passed as X-Dev-Requester-Id", async () => {
    const staff = await getPrisma().user.findFirstOrThrow({
      where: { role: "IT_STAFF", isActive: true },
    });
    const res = await request(app).get("/api/tickets").set("X-Dev-Requester-Id", String(staff.id));
    expect(res.status).toBe(400);
  });

  it("rejects an active Administrator id passed as X-Dev-Requester-Id", async () => {
    const admin = await getPrisma().user.findFirstOrThrow({
      where: { role: "ADMINISTRATOR", isActive: true },
    });
    const res = await request(app).get("/api/tickets").set("X-Dev-Requester-Id", String(admin.id));
    expect(res.status).toBe(400);
  });
});
