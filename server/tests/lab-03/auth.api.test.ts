import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Response as SupertestResponse } from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/password.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).

const GENERIC_LOGIN_ERROR = "Invalid email or password.";
const SEED_PASSWORD = "ChangeMe123!"; // matches prisma/seed.ts SEED_INITIAL_PASSWORD

let activeRequesterEmail: string;
let inactiveRequesterEmail: string;

// Fresh, dedicated fixtures — not the shared named seed accounts (Ada,
// Grace...). Several other test files' testAuth.ts login helper resets a
// shared account's password to a different known value as a side effect;
// depending on file execution order, this file's own SEED_PASSWORD-based
// logins could otherwise start failing for a "seeded" account that some
// earlier file already logged into and changed. Full self-containment
// avoids that regardless of order.
async function createFreshRequester(overrides: { isActive?: boolean } = {}) {
  const email = `auth-fixture-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await getPrisma().user.create({
    data: {
      name: "Auth Fixture Requester",
      email,
      isActive: overrides.isActive ?? true,
      role: "REQUESTER",
      passwordHash: await hashPassword(SEED_PASSWORD),
      mustChangePassword: true,
    },
  });
  return email;
}

beforeAll(async () => {
  activeRequesterEmail = await createFreshRequester();
  inactiveRequesterEmail = await createFreshRequester({ isActive: false });
});

function extractCookie(res: SupertestResponse): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | string | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const tokenCookie = cookies.find((c) => c.startsWith("token="));
  if (!tokenCookie) throw new Error("no token cookie set on response");
  return tokenCookie.split(";")[0];
}

async function login(email: string, password = SEED_PASSWORD) {
  return request(app).post("/api/auth/login").send({ email, password });
}

describe("POST /api/auth/login", () => {
  it("API-01 logs in with valid credentials, sets a cookie, returns identity + role", async () => {
    const res = await login(activeRequesterEmail);
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.body.data).toMatchObject({
      email: activeRequesterEmail,
      role: "REQUESTER",
      mustChangePassword: true,
    });
    expect(res.body.data.id).toEqual(expect.any(Number));
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it("API-02 rejects an unknown email with the generic message", async () => {
    const res = await login("nobody-at-all@example.com");
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe(GENERIC_LOGIN_ERROR);
  });

  it("API-03 rejects a wrong password with the identical generic message", async () => {
    const res = await login(activeRequesterEmail, "WrongPassword1!");
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe(GENERIC_LOGIN_ERROR);
  });

  it("API-04 rejects an inactive account with the correct password, same generic message", async () => {
    const res = await login(inactiveRequesterEmail);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe(GENERIC_LOGIN_ERROR);
  });

  it("API-05 returns 400 when email or password is missing", async () => {
    const noPassword = await request(app).post("/api/auth/login").send({ email: activeRequesterEmail });
    expect(noPassword.status).toBe(400);
    const noEmail = await request(app).post("/api/auth/login").send({ password: SEED_PASSWORD });
    expect(noEmail.status).toBe(400);
  });
});

describe("GET /api/auth/me", () => {
  it("API-06 returns the correct identity/role/mustChangePassword for a valid session", async () => {
    const cookie = extractCookie(await login(activeRequesterEmail));
    const res = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: activeRequesterEmail, role: "REQUESTER", mustChangePassword: true });
  });

  it("API-07 returns 401 with no session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("API-08 invalidates the cookie so a later protected request with it returns 401", async () => {
    const cookie = extractCookie(await login(activeRequesterEmail));
    const before = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(before.status).toBe(200);

    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(200);
    expect(logout.body.data).toEqual({ loggedOut: true });

    const after = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(after.status).toBe(401);
  });
});

describe("Password-change gate (BR-02/BR-04)", () => {
  it("API-09 blocks a normal route with 403 PASSWORD_CHANGE_REQUIRED while mustChangePassword is true", async () => {
    const cookie = extractCookie(await login(activeRequesterEmail));
    const res = await request(app).get("/api/categories").set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("API-10 still allows /me, /change-password, and /logout while mustChangePassword is true", async () => {
    const email = await createFreshRequester();
    const cookie = extractCookie(await login(email));

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);

    // Reachable despite the gate — rejected on credentials (401), not
    // blocked by the gate (which would be 403).
    const badChange = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: "TotallyWrong1!", newPassword: "NewValid123!" });
    expect(badChange.status).toBe(401);

    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(200);
  });
});

describe("POST /api/auth/change-password", () => {
  it("API-11 rejects a rule-violating new password with 400", async () => {
    const email = await createFreshRequester();
    const cookie = extractCookie(await login(email));
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: SEED_PASSWORD, newPassword: "short1!" });
    expect(res.status).toBe(400);
  });

  it("API-12 rejects a new password identical to the current one with 400", async () => {
    const email = await createFreshRequester();
    const cookie = extractCookie(await login(email));
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: SEED_PASSWORD, newPassword: SEED_PASSWORD });
    expect(res.status).toBe(400);
  });

  it("API-13 rejects the wrong current password with 401", async () => {
    const email = await createFreshRequester();
    const cookie = extractCookie(await login(email));
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: "NotTheRealPassword1!", newPassword: "NewValid123!" });
    expect(res.status).toBe(401);
  });

  it("API-14 succeeds, clears mustChangePassword, and unlocks normal routes immediately", async () => {
    const email = await createFreshRequester();
    const cookie = extractCookie(await login(email));

    const change = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: SEED_PASSWORD, newPassword: "NewValid123!" });
    expect(change.status).toBe(200);
    expect(change.body.data).toEqual({ mustChangePassword: false });

    const newCookie = extractCookie(change);
    const categories = await request(app).get("/api/categories").set("Cookie", newCookie);
    expect(categories.status).toBe(200);

    // The new password now logs in on its own; the old one no longer does.
    const reLogin = await login(email, "NewValid123!");
    expect(reLogin.status).toBe(200);
    const oldLogin = await login(email, SEED_PASSWORD);
    expect(oldLogin.status).toBe(401);
  });
});
