import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/password.js";
import { loginAs, TEST_FIXED_PASSWORD } from "./testAuth.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).
//
// Every subject user here (including the "acting Administrator") is a
// throwaway fixture created directly via Prisma, never a shared seeded
// identity (Barbara Liskov et al.) — this file mutates isActive/role/email
// on the users it tests, and Issue 35's auth.api.test.ts fragility already
// showed what happens when one file's mutation of a shared account leaks
// into another file's assumptions.

let adminCookie: string;
let adminId: number;
let staffCookie: string;
let requesterCookie: string;

const STRONG_PASSWORD = "GoodPass1!";
const WEAK_PASSWORD = "weak";

async function createFixtureUser(
  overrides: Partial<{ name: string; email: string; role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR"; isActive: boolean }> = {}
) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  const passwordHash = await hashPassword(TEST_FIXED_PASSWORD);
  return getPrisma().user.create({
    data: {
      name: overrides.name ?? `Fixture User ${suffix}`,
      email: overrides.email ?? `fixture-user-${suffix}@toktickit.com`,
      role: overrides.role ?? "REQUESTER",
      isActive: overrides.isActive ?? true,
      passwordHash,
      mustChangePassword: true,
    },
  });
}

beforeAll(async () => {
  const admin = await createFixtureUser({ role: "ADMINISTRATOR", name: "Fixture Admin Root" });
  adminId = admin.id;
  adminCookie = await loginAs(admin.email);

  const staff = await createFixtureUser({ role: "IT_STAFF", name: "Fixture Staff" });
  staffCookie = await loginAs(staff.email);

  const requester = await createFixtureUser({ role: "REQUESTER", name: "Fixture Requester" });
  requesterCookie = await loginAs(requester.email);
});

describe("GET /api/admin/users", () => {
  it("ADMIN-01 lists users with no filters", async () => {
    const res = await request(app).get("/api/admin/users").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.find((u: { id: number }) => u.id === adminId)).toBeTruthy();
    expect(res.body.data[0]).not.toHaveProperty("passwordHash");
  });

  it("ADMIN-02 filters by partial name, case-insensitive", async () => {
    // A per-run-unique marker, not a static string — fixture users from
    // earlier runs against this same shared dev DB never get cleaned up
    // (the same accumulation this sprint has seen with Tickets), so a
    // static "Zzyzx" would eventually match more than just this run's row.
    const marker = `Zzyzx${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
    const target = await createFixtureUser({ name: `${marker} Uniquename` });
    const res = await request(app).get("/api/admin/users").query({ search: marker.toLowerCase() }).set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((u: { id: number }) => u.id)).toEqual([target.id]);
  });

  it("ADMIN-03 filters by partial email, case-insensitive", async () => {
    const marker = `unique-zz-${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
    const target = await createFixtureUser({ email: `${marker}@toktickit.com` });
    const res = await request(app).get("/api/admin/users").query({ search: marker.toUpperCase() }).set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((u: { id: number }) => u.id)).toEqual([target.id]);
  });

  it("ADMIN-04 filters by role", async () => {
    const res = await request(app).get("/api/admin/users").query({ role: "ADMINISTRATOR" }).set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((u: { role: string }) => u.role === "ADMINISTRATOR")).toBe(true);
  });

  it("AUTHZ-06 rejects IT Staff with 403", async () => {
    const res = await request(app).get("/api/admin/users").set("Cookie", staffCookie);
    expect(res.status).toBe(403);
  });

  it("AUTHZ-07 rejects a Requester with 403", async () => {
    const res = await request(app).get("/api/admin/users").set("Cookie", requesterCookie);
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated call with 401", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/users", () => {
  it("ADMIN-05 creates a user with valid data", async () => {
    const email = `created-${Date.now()}@toktickit.com`;
    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", adminCookie)
      .send({ name: "New Person", email, role: "IT_STAFF", isActive: true, initialPassword: STRONG_PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe(email);
    expect(res.body.data.mustChangePassword).toBe(true);
    expect(res.body.data).not.toHaveProperty("passwordHash");
  });

  it("ADMIN-06 rejects a duplicate email with 409", async () => {
    const existing = await createFixtureUser();
    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", adminCookie)
      .send({ name: "Dup", email: existing.email, role: "REQUESTER", isActive: true, initialPassword: STRONG_PASSWORD });
    expect(res.status).toBe(409);
  });

  it("ADMIN-07 rejects an invalid role value with 400", async () => {
    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", adminCookie)
      .send({
        name: "Bad Role",
        email: `bad-role-${Date.now()}@toktickit.com`,
        role: "SUPERUSER",
        isActive: true,
        initialPassword: STRONG_PASSWORD,
      });
    expect(res.status).toBe(400);
  });

  it("ADMIN-08 rejects a weak initialPassword with 400", async () => {
    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", adminCookie)
      .send({
        name: "Weak Pw",
        email: `weak-pw-${Date.now()}@toktickit.com`,
        role: "REQUESTER",
        isActive: true,
        initialPassword: WEAK_PASSWORD,
      });
    expect(res.status).toBe(400);
  });

  it("rejects a non-Administrator with 403", async () => {
    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", requesterCookie)
      .send({
        name: "X",
        email: `x-${Date.now()}@toktickit.com`,
        role: "REQUESTER",
        isActive: true,
        initialPassword: STRONG_PASSWORD,
      });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/admin/users/:id", () => {
  it("ADMIN-09 edits name/email/role/isActive", async () => {
    const target = await createFixtureUser();
    const newEmail = `edited-${Date.now()}@toktickit.com`;
    const res = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set("Cookie", adminCookie)
      .send({ name: "Edited Name", email: newEmail, role: "IT_STAFF", isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Edited Name", email: newEmail, role: "IT_STAFF", isActive: false });
  });

  it("ADMIN-10 rejects an email already used by another user with 409", async () => {
    const other = await createFixtureUser();
    const target = await createFixtureUser();
    const res = await request(app).patch(`/api/admin/users/${target.id}`).set("Cookie", adminCookie).send({ email: other.email });
    expect(res.status).toBe(409);
  });

  it("ADMIN-11/AC-13 rejects an Administrator deactivating their own account with 409", async () => {
    const res = await request(app).patch(`/api/admin/users/${adminId}`).set("Cookie", adminCookie).send({ isActive: false });
    expect(res.status).toBe(409);
    const check = await getPrisma().user.findUniqueOrThrow({ where: { id: adminId } });
    expect(check.isActive).toBe(true);
  });

  it("rejects editing a nonexistent user with 404", async () => {
    const res = await request(app).patch("/api/admin/users/999999999").set("Cookie", adminCookie).send({ name: "Ghost" });
    expect(res.status).toBe(404);
  });

  it("rejects a non-Administrator with 403", async () => {
    const target = await createFixtureUser();
    const res = await request(app).patch(`/api/admin/users/${target.id}`).set("Cookie", staffCookie).send({ name: "Nope" });
    expect(res.status).toBe(403);
  });
});

// BR-30 — "the system must always retain at least one active Administrator"
// is a statement about the whole table, so testing it honestly means
// controlling the whole table's admin count for the duration of these
// cases: every other real active Administrator (the seeded Barbara Liskov
// included) is deactivated in beforeAll and restored in afterAll.
describe("Last-active-Administrator protection (BR-30)", () => {
  let otherActiveAdminIds: number[] = [];
  let actingAdminCookie: string;

  beforeAll(async () => {
    const prisma = getPrisma();
    // A second admin, logged in *before* the isolation below — its session
    // stays valid afterward regardless of its own isActive flag, since
    // requireAuth/requireRole trust the JWT claims and never re-check
    // isActive per-request (session.ts). That's what lets this second
    // admin act as "a different Administrator" on adminId once adminId is
    // the only *row* left with role=ADMINISTRATOR and isActive=true.
    const actingAdmin = await createFixtureUser({ role: "ADMINISTRATOR", name: "Fixture Admin Acting" });
    actingAdminCookie = await loginAs(actingAdmin.email);

    const others = await prisma.user.findMany({
      where: { role: "ADMINISTRATOR", isActive: true, id: { not: adminId } },
    });
    otherActiveAdminIds = others.map((u) => u.id);
    if (otherActiveAdminIds.length > 0) {
      await prisma.user.updateMany({ where: { id: { in: otherActiveAdminIds } }, data: { isActive: false } });
    }
  });

  afterAll(async () => {
    if (otherActiveAdminIds.length > 0) {
      await getPrisma().user.updateMany({ where: { id: { in: otherActiveAdminIds } }, data: { isActive: true } });
    }
  });

  it("ADMIN-12/AC-14 rejects deactivating the last active Administrator with 409", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminId}`)
      .set("Cookie", actingAdminCookie)
      .send({ isActive: false });
    expect(res.status).toBe(409);
    const check = await getPrisma().user.findUniqueOrThrow({ where: { id: adminId } });
    expect(check.isActive).toBe(true);
  });

  it("ADMIN-13/AC-14 rejects changing the last active Administrator's role away from ADMINISTRATOR with 409", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminId}`)
      .set("Cookie", actingAdminCookie)
      .send({ role: "IT_STAFF" });
    expect(res.status).toBe(409);
    const check = await getPrisma().user.findUniqueOrThrow({ where: { id: adminId } });
    expect(check.role).toBe("ADMINISTRATOR");
  });

  it("ADMIN-14 lets at most one of two concurrent deactivations of the two remaining active Administrators succeed", async () => {
    const secondAdmin = await createFixtureUser({ role: "ADMINISTRATOR", name: "Fixture Admin Second" });
    // Exactly two active Administrators exist at this point: adminId and
    // secondAdmin. Fire both deactivations at once.
    const [resA, resB] = await Promise.all([
      request(app).patch(`/api/admin/users/${adminId}`).set("Cookie", actingAdminCookie).send({ isActive: false }),
      request(app).patch(`/api/admin/users/${secondAdmin.id}`).set("Cookie", actingAdminCookie).send({ isActive: false }),
    ]);
    const successes = [resA, resB].filter((r) => r.status === 200);
    expect(successes.length).toBeLessThanOrEqual(1);

    const remainingActive = await getPrisma().user.count({
      where: { role: "ADMINISTRATOR", isActive: true, id: { in: [adminId, secondAdmin.id] } },
    });
    expect(remainingActive).toBeGreaterThanOrEqual(1);

    // Restore whichever one the race deactivated, for afterAll's own restore
    // step (adminId) to still find its expected starting state.
    await getPrisma().user.update({ where: { id: adminId }, data: { isActive: true } });
  });
});

describe("PATCH /api/admin/users/:id/password", () => {
  it("ADMIN-15 sets a new initial password and forces mustChangePassword", async () => {
    const target = await createFixtureUser();
    const res = await request(app)
      .patch(`/api/admin/users/${target.id}/password`)
      .set("Cookie", adminCookie)
      .send({ newPassword: STRONG_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.mustChangePassword).toBe(true);

    const login = await request(app).post("/api/auth/login").send({ email: target.email, password: STRONG_PASSWORD });
    expect(login.status).toBe(200);
  });

  it("ADMIN-16 rejects a weak new password with 400", async () => {
    const target = await createFixtureUser();
    const res = await request(app)
      .patch(`/api/admin/users/${target.id}/password`)
      .set("Cookie", adminCookie)
      .send({ newPassword: WEAK_PASSWORD });
    expect(res.status).toBe(400);
  });

  it("rejects a nonexistent user with 404", async () => {
    const res = await request(app)
      .patch("/api/admin/users/999999999/password")
      .set("Cookie", adminCookie)
      .send({ newPassword: STRONG_PASSWORD });
    expect(res.status).toBe(404);
  });

  it("rejects a non-Administrator with 403", async () => {
    const target = await createFixtureUser();
    const res = await request(app)
      .patch(`/api/admin/users/${target.id}/password`)
      .set("Cookie", staffCookie)
      .send({ newPassword: STRONG_PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe("No delete-user route (BR-31)", () => {
  it("ADMIN-17 confirms DELETE /api/admin/users/:id is not a registered route", async () => {
    const target = await createFixtureUser();
    const res = await request(app).delete(`/api/admin/users/${target.id}`).set("Cookie", adminCookie);
    expect([404, 405]).toContain(res.status);
  });
});
