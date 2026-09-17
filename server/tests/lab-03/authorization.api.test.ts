import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { attachSession, requireRole, SESSION_COOKIE } from "../../src/session.js";
import { getPrisma } from "../../src/prisma.js";
import { app } from "../../src/app.js";
import { loginAs } from "./testAuth.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).
//
// Designated home for every direct-API authorization test in the sprint
// (AUTHZ-01..12) — every protected operation called directly with the wrong
// role, per the handout's "hiding a button is not authorization." Most rows
// need routes that don't exist until their own Issue lands (staff queue/
// detail: 35/36, comments/notes: 37, admin: 38, Requester identity spoofing:
// 34); they stay Pending until then. AUTHZ-08/09 are generic properties of
// the session middleware itself, provable now with no business route yet to
// hang them on — a throwaway route mounting the real requireRole (not a
// copy) is how that gets proven in isolation.

function buildTestApp() {
  const testApp = express();
  testApp.use(cookieParser());
  testApp.use(attachSession);
  testApp.get("/staff-only", requireRole("IT_STAFF", "ADMINISTRATOR"), (_req, res) => {
    res.status(200).json({ data: "ok" });
  });
  return testApp;
}

async function cookieFor(email: string) {
  const user = await getPrisma().user.findUniqueOrThrow({ where: { email } });
  const token = jwt.sign(
    { id: user.id, role: user.role, mustChangePassword: user.mustChangePassword, jti: "test-jti" },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" }
  );
  return `${SESSION_COOKIE}=${token}`;
}

describe("requireRole", () => {
  it("AUTHZ-08 rejects with 401, not 403, when there is no session at all", async () => {
    const res = await request(buildTestApp()).get("/staff-only");
    expect(res.status).toBe(401);
  });

  it("AUTHZ-09 rejects with 401 for a tampered/invalid token", async () => {
    const res = await request(buildTestApp()).get("/staff-only").set("Cookie", `${SESSION_COOKIE}=not-a-real-jwt`);
    expect(res.status).toBe(401);
  });

  it("rejects an authenticated Requester with 403, not 401", async () => {
    const cookie = await cookieFor("ada.lovelace@example.com");
    const res = await request(buildTestApp()).get("/staff-only").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("allows an authenticated IT Staff user through", async () => {
    const cookie = await cookieFor("margaret.hamilton@toktickit.com");
    const res = await request(buildTestApp()).get("/staff-only").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });

  it("allows an authenticated Administrator through", async () => {
    const cookie = await cookieFor("barbara.liskov@toktickit.com");
    const res = await request(buildTestApp()).get("/staff-only").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});

describe("AUTHZ-10 — a client-supplied requesterId is ignored on Ticket creation", () => {
  it("uses the session's identity, not a requesterId injected into the request body", async () => {
    const requester = await getPrisma().user.findFirstOrThrow({ where: { role: "REQUESTER", isActive: true } });
    const impersonated = await getPrisma().user.findFirstOrThrow({
      where: { role: "REQUESTER", isActive: true, id: { not: requester.id } },
    });
    const category = await getPrisma().category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await getPrisma().relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    const cookie = await loginAs(requester.email);

    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", cookie)
      .send({
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Body-spoofing attempt",
        description: "requesterId below claims to be someone else entirely",
        requestedPriority: "LOW",
        requesterId: impersonated.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.requesterId).toBe(requester.id);
  });
});
