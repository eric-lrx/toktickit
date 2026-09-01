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

describe("GET /api/requesters", () => {
  it("returns active requesters and excludes the seeded inactive one", async () => {
    const res = await request(app).get("/api/requesters");
    expect(res.status).toBe(200);
    const emails = res.body.map((r: { email: string }) => r.email);
    expect(emails).toContain("ada.lovelace@example.com");
    expect(emails).not.toContain("ivy.inactive@example.com");
  });
});
