import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAs } from "./testAuth.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).
// Uses the seeded TKT-9999-* fixture Tickets (prisma/seed.ts) for deterministic
// assertions — "contains"/subset checks throughout, never exact-array
// equality, since the shared dev database also holds hundreds of Tickets
// created by other test files and manual verification.

let staffCookie: string;
let adminCookie: string;
let requesterCookie: string;
let hardwareCategoryId: number;
let margaretId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const staff = await prisma.user.findFirstOrThrow({ where: { email: "margaret.hamilton@toktickit.com" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMINISTRATOR", isActive: true } });
  const requester = await prisma.user.findFirstOrThrow({ where: { role: "REQUESTER", isActive: true } });
  const hardware = await prisma.category.findFirstOrThrow({ where: { name: "Hardware" } });
  margaretId = staff.id;
  hardwareCategoryId = hardware.id;
  staffCookie = await loginAs(staff.email);
  adminCookie = await loginAs(admin.email);
  requesterCookie = await loginAs(requester.email);
});

function ticketNumbers(body: { data: { ticketNumber: string }[] }): string[] {
  return body.data.map((t) => t.ticketNumber);
}

describe("GET /api/staff/tickets — role guard", () => {
  it("rejects a Requester with 403", async () => {
    const res = await request(app).get("/api/staff/tickets").set("Cookie", requesterCookie);
    expect(res.status).toBe(403);
  });

  it("allows IT Staff", async () => {
    const res = await request(app).get("/api/staff/tickets").set("Cookie", staffCookie);
    expect(res.status).toBe(200);
  });

  it("allows an Administrator (read-only per the authorization matrix)", async () => {
    const res = await request(app).get("/api/staff/tickets").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/staff/tickets — queue contract", () => {
  it("STAFF-Q-01 returns Tickets from multiple Requesters (shared, not scoped)", async () => {
    const res = await request(app).get("/api/staff/tickets?pageSize=50").set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    const requesterIds = new Set(res.body.data.map((t: { requesterId: number }) => t.requesterId));
    expect(requesterIds.size).toBeGreaterThan(1);
  });

  it("STAFF-Q-02 search matches ticketNumber", async () => {
    const res = await request(app).get("/api/staff/tickets?search=TKT-9999-000002").set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(ticketNumbers(res.body)).toEqual(["TKT-9999-000002"]);
  });

  it("STAFF-Q-03 search matches summary", async () => {
    const res = await request(app).get("/api/staff/tickets?search=Wi-Fi drops").set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(ticketNumbers(res.body)).toContain("TKT-9999-000002");
  });

  it("STAFF-Q-04 status filter returns only matching Tickets", async () => {
    // Scoped with search=TKT-9999 in Lab 4 (docs/lab-04/tests.md §3), for the
    // STAFF-Q-05 reason: every run of the suites resolves more fixture
    // Tickets, and after enough runs the seeded one fell off page 1.
    const res = await request(app)
      .get("/api/staff/tickets?status=RESOLVED&search=TKT-9999&pageSize=50")
      .set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(ticketNumbers(res.body)).toContain("TKT-9999-000005");
    expect(res.body.data.every((t: { status: string }) => t.status === "RESOLVED")).toBe(true);
  });

  it("STAFF-Q-05 itPriority filter returns only matching Tickets", async () => {
    // Scoped with search=TKT-9999 (the seed fixtures): itPriority=HIGH alone
    // also matches hundreds of ordinary Tickets from other tests/manual
    // verification, which would drown the two fixtures out of a page-sized
    // result sorted by recency.
    const res = await request(app)
      .get("/api/staff/tickets?itPriority=HIGH&search=TKT-9999&pageSize=50")
      .set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(ticketNumbers(res.body)).toEqual(expect.arrayContaining(["TKT-9999-000002", "TKT-9999-000010"]));
    expect(res.body.data.every((t: { itPriority: string }) => t.itPriority === "HIGH")).toBe(true);
  });

  it("STAFF-Q-06 ownerId=unassigned returns only Tickets with no owner", async () => {
    // Same scoping reason as STAFF-Q-05 — every ordinary Ticket is
    // unassigned too (nothing sets ticketOwnerId yet outside this seed).
    const res = await request(app)
      .get("/api/staff/tickets?ownerId=unassigned&search=TKT-9999&pageSize=50")
      .set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(ticketNumbers(res.body)).toEqual(
      expect.arrayContaining(["TKT-9999-000001", "TKT-9999-000008", "TKT-9999-000009"])
    );
    expect(res.body.data.every((t: { ticketOwnerId: number | null }) => t.ticketOwnerId === null)).toBe(true);
  });

  it("STAFF-Q-07 ownerId=<id> returns only that owner's Tickets", async () => {
    // Scoped with search=TKT-9999 in Lab 4 (docs/lab-04/tests.md §3): Lab 3's
    // own claim tests add Margaret-owned fixtures on every run (51 of the 54
    // that had pushed the seeded Tickets off page 1 when this broke).
    const res = await request(app)
      .get(`/api/staff/tickets?ownerId=${margaretId}&search=TKT-9999&pageSize=50`)
      .set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(ticketNumbers(res.body)).toEqual(expect.arrayContaining(["TKT-9999-000002", "TKT-9999-000003"]));
    expect(res.body.data.every((t: { ticketOwnerId: number | null }) => t.ticketOwnerId === margaretId)).toBe(true);
    // Response includes the owner's display name, not just the id.
    expect(res.body.data[0].ticketOwnerName).toBe("Margaret Hamilton");
  });

  it("STAFF-Q-08 categoryId filter returns only matching Tickets", async () => {
    const res = await request(app)
      .get(`/api/staff/tickets?categoryId=${hardwareCategoryId}&pageSize=50`)
      .set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.every((t: { categoryId: number }) => t.categoryId === hardwareCategoryId)).toBe(true);
  });

  it("STAFF-Q-09 combined filters return only Tickets matching all of them", async () => {
    const res = await request(app)
      // Scoped with search=TKT-9999 in Lab 4 (docs/lab-04/tests.md §3): 52
      // OPEN+HIGH Tickets had become newer than the seeded ones — 29 from
      // Lab 3's own E2E-04 (one per E2E run), 22 from Lab 4 fixtures.
      .get("/api/staff/tickets?status=OPEN&itPriority=HIGH&search=TKT-9999&pageSize=50")
      .set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(ticketNumbers(res.body)).toEqual(expect.arrayContaining(["TKT-9999-000002", "TKT-9999-000010"]));
    expect(
      res.body.data.every((t: { status: string; itPriority: string }) => t.status === "OPEN" && t.itPriority === "HIGH")
    ).toBe(true);
  });

  it("STAFF-Q-10 sorts by itPriority desc (High -> Low)", async () => {
    const res = await request(app)
      .get("/api/staff/tickets?sort=itPriority&order=desc&pageSize=50")
      .set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    const priorities = res.body.data.map((t: { itPriority: string }) => t.itPriority);
    const firstLowIndex = priorities.indexOf("LOW");
    const lastHighIndex = priorities.lastIndexOf("HIGH");
    if (firstLowIndex !== -1 && lastHighIndex !== -1) {
      expect(lastHighIndex).toBeLessThan(firstLowIndex);
    }
  });

  it("STAFF-Q-11 defaults to sort=updatedAt&order=desc", async () => {
    const res = await request(app).get("/api/staff/tickets?pageSize=50").set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    const dates = res.body.data.map((t: { updatedAt: string }) => new Date(t.updatedAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  it("STAFF-Q-12 invalid sort value returns 400 naming the parameter", async () => {
    const res = await request(app).get("/api/staff/tickets?sort=nope").set("Cookie", staffCookie);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/sort/i);
  });

  it("STAFF-Q-13 invalid status value returns 400 naming the parameter", async () => {
    const res = await request(app).get("/api/staff/tickets?status=NOPE").set("Cookie", staffCookie);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/status/i);
  });

  it("STAFF-Q-14 paginates with correct meta", async () => {
    const res = await request(app).get("/api/staff/tickets?page=2&pageSize=10").set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(10);
    expect(res.body.meta.page).toBe(2);
    expect(res.body.meta.pageSize).toBe(10);
    expect(res.body.meta.totalPages).toBe(Math.ceil(res.body.meta.total / 10));
  });
});

describe("GET /api/staff/users", () => {
  it("rejects a Requester with 403", async () => {
    const res = await request(app).get("/api/staff/users").set("Cookie", requesterCookie);
    expect(res.status).toBe(403);
  });

  it("returns active IT Staff and Administrator users, name-sorted, for IT Staff callers", async () => {
    const res = await request(app).get("/api/staff/users").set("Cookie", staffCookie);
    expect(res.status).toBe(200);
    const names = res.body.data.map((u: { name: string }) => u.name);
    expect(names).toEqual(expect.arrayContaining(["Margaret Hamilton", "Barbara Liskov"]));
    expect(names).not.toContain("Nolan Inactive"); // inactive
    expect(names).not.toContain("Ada Lovelace"); // Requester
    expect(names).toEqual([...names].sort());
  });
});
