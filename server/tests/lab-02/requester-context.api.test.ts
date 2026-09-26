import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).
// Seed must include the fixtures asserted below (see prisma/seed.ts).

describe("GET /api/categories", () => {
  it("returns only active categories", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    const names = res.body.map((c: { name: string }) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Account and Access", "Hardware", "Software", "Network"]));
  });
});

describe("GET /api/related-systems", () => {
  it("returns the seeded active related systems", async () => {
    const res = await request(app).get("/api/related-systems");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
    const names = res.body.map((r: { name: string }) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(["Email", "Campus Wi-Fi", "VPN", "LEB2 App", "Grade Submission App", "Printer"])
    );
  });
});

// Updated in Lab 4 (docs/lab-04/tests.md §3, specification.md BR-31): the
// route behind Lab 2's Development Requester selector answered without any
// session and listed every active Requester's name and email. The selector
// went away in Lab 3; Lab 4 removes the route itself, so these two tests now
// pin that it stays gone and leaks nothing.
describe("GET /api/requesters (removed in Lab 4)", () => {
  it("no longer answers with a Requester list", async () => {
    const res = await request(app).get("/api/requesters");
    expect(res.status).toBe(404);
    expect(Array.isArray(res.body)).toBe(false);
  });

  it("never exposes any account email, Requester or staff", async () => {
    const res = await request(app).get("/api/requesters");
    const raw = JSON.stringify(res.body) + (res.text ?? "");
    expect(raw).not.toContain("ada.lovelace@example.com");
    expect(raw).not.toContain("margaret.hamilton@toktickit.com");
    expect(raw).not.toContain("barbara.liskov@toktickit.com");
  });
});
