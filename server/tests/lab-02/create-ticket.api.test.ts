import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).

let activeRequesterId: number;
let inactiveRequesterId: number;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const active = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: true } });
  const inactive = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: false } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  activeRequesterId = active.id;
  inactiveRequesterId = inactive.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
});

function validPayload() {
  return {
    categoryId,
    relatedSystemId,
    summary: "Printer jam on 3rd floor",
    description: "Paper is stuck in tray 2 and the printer shows a red light.",
    requestedPriority: "MEDIUM",
  };
}

describe("POST /api/tickets", () => {
  it("creates a Ticket for a valid payload and returns the generated Ticket Number", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .send(validPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
    expect(res.body.data.requesterId).toBe(activeRequesterId);
    expect(res.body.data.status).toBe("NEW");
  });

  it("returns 400 naming the field when Summary is missing", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(activeRequesterId))
      .send({ ...validPayload(), summary: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/summary/i);
  });

  it("returns 400 when X-Dev-Requester-Id is missing", async () => {
    const res = await request(app).post("/api/tickets").send(validPayload());
    expect(res.status).toBe(400);
  });

  it("returns 400 when X-Dev-Requester-Id belongs to an inactive Requester", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Dev-Requester-Id", String(inactiveRequesterId))
      .send(validPayload());
    expect(res.status).toBe(400);
  });
});
