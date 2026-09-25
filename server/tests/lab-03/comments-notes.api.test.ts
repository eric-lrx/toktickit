import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { loginAs } from "./testAuth.js";

// Requires the DB to be migrated and seeded first (npx prisma migrate dev && npm run prisma:seed).

let requesterCookie: string;
let requesterId: number;
let otherRequesterCookie: string;
let staffCookie: string;
let staffId: number;
let adminCookie: string;
let ownTicketId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const requester = await prisma.user.findFirstOrThrow({ where: { role: "REQUESTER", isActive: true } });
  const otherRequester = await prisma.user.findFirstOrThrow({
    where: { role: "REQUESTER", isActive: true, id: { not: requester.id } },
  });
  const staff = await prisma.user.findFirstOrThrow({ where: { email: "margaret.hamilton@toktickit.com" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMINISTRATOR", isActive: true } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

  requesterId = requester.id;
  staffId = staff.id;
  requesterCookie = await loginAs(requester.email);
  otherRequesterCookie = await loginAs(otherRequester.email);
  staffCookie = await loginAs(staff.email);
  adminCookie = await loginAs(admin.email);

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Date.now()}${Math.floor(Math.random() * 1000)}`,
      requesterId,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary: "Comments/notes fixture",
      description: "Description long enough for validation",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
    },
  });
  ownTicketId = ticket.id;
});

describe("POST /api/tickets/:id/comments", () => {
  it("CN-01 lets the owning Requester post", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownTicketId}/comments`)
      .set("Cookie", requesterCookie)
      .send({ content: "Any update on this?" });
    expect(res.status).toBe(201);
    expect(res.body.data.authorName).toBeTruthy();
    expect(res.body.data.content).toBe("Any update on this?");
  });

  it("CN-02 rejects a Requester who doesn't own the Ticket with 404", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownTicketId}/comments`)
      .set("Cookie", otherRequesterCookie)
      .send({ content: "Not my ticket" });
    expect(res.status).toBe(404);
  });

  it("CN-03 rejects empty/whitespace-only content with 400", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownTicketId}/comments`)
      .set("Cookie", requesterCookie)
      .send({ content: "   " });
    expect(res.status).toBe(400);
  });

  it("CN-04 rejects content over 4000 characters with 400", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownTicketId}/comments`)
      .set("Cookie", requesterCookie)
      .send({ content: "a".repeat(4001) });
    expect(res.status).toBe(400);
  });

  it("CN-05 lets IT Staff post on any Ticket", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownTicketId}/comments`)
      .set("Cookie", staffCookie)
      .send({ content: "Looking into this now." });
    expect(res.status).toBe(201);
  });

  // Updated in Lab 4 (docs/lab-04/tests.md §3): Lab 3 made the
  // Administrator read-only on the workflow; Lab 4's revised matrix
  // (specification.md §4, handout §4.3) gives them IT Staff behavior.
  it("allows an Administrator to post (Lab 4 revised matrix; was 403 in Lab 3)", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownTicketId}/comments`)
      .set("Cookie", adminCookie)
      .send({ content: "Administrator support comment" });
    expect(res.status).toBe(201);
  });

  it("CN-10 ignores a client-supplied authorId/createdAt, always using the backend's own", async () => {
    const spoofedDate = "2000-01-01T00:00:00.000Z";
    const res = await request(app)
      .post(`/api/tickets/${ownTicketId}/comments`)
      .set("Cookie", requesterCookie)
      .send({ content: "Spoof attempt", authorId: 999999, createdAt: spoofedDate });
    expect(res.status).toBe(201);
    expect(res.body.data.authorId).toBe(requesterId);
    expect(res.body.data.createdAt).not.toBe(spoofedDate);
  });
});

describe("GET /api/tickets/:id/comments", () => {
  it("CN-06 shows the same list to the Requester, IT Staff, and Administrator", async () => {
    const asRequester = await request(app).get(`/api/tickets/${ownTicketId}/comments`).set("Cookie", requesterCookie);
    const asStaff = await request(app).get(`/api/tickets/${ownTicketId}/comments`).set("Cookie", staffCookie);
    const asAdmin = await request(app).get(`/api/tickets/${ownTicketId}/comments`).set("Cookie", adminCookie);

    expect(asRequester.status).toBe(200);
    expect(asStaff.status).toBe(200);
    expect(asAdmin.status).toBe(200);
    const ids = (r: request.Response) => r.body.data.map((c: { id: number }) => c.id);
    expect(ids(asRequester)).toEqual(ids(asStaff));
    expect(ids(asStaff)).toEqual(ids(asAdmin));
  });

  it("rejects a different Requester with 404, not 403 (ownership, BR-16)", async () => {
    const res = await request(app).get(`/api/tickets/${ownTicketId}/comments`).set("Cookie", otherRequesterCookie);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/tickets/:id/notes", () => {
  it("CN-07 lets IT Staff create an Internal Note", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownTicketId}/notes`)
      .set("Cookie", staffCookie)
      .send({ content: "Escalating to network team internally." });
    expect(res.status).toBe(201);
  });

  it("AUTHZ-02 rejects a Requester's direct call with 403 and no note content anywhere", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownTicketId}/notes`)
      .set("Cookie", requesterCookie)
      .send({ content: "A Requester should never get this far" });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/should never get this far/);
  });

  // Updated in Lab 4 (docs/lab-04/tests.md §3) — revised matrix.
  it("allows an Administrator to create a note (Lab 4 revised matrix; was 403 in Lab 3)", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownTicketId}/notes`)
      .set("Cookie", adminCookie)
      .send({ content: "Administrator support note" });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/tickets/:id/notes", () => {
  it("allows IT Staff and Administrator", async () => {
    const asStaff = await request(app).get(`/api/tickets/${ownTicketId}/notes`).set("Cookie", staffCookie);
    const asAdmin = await request(app).get(`/api/tickets/${ownTicketId}/notes`).set("Cookie", adminCookie);
    expect(asStaff.status).toBe(200);
    expect(asAdmin.status).toBe(200);
  });

  it("AUTHZ-01 rejects a Requester's direct call with 403 and no note content anywhere", async () => {
    const res = await request(app).get(`/api/tickets/${ownTicketId}/notes`).set("Cookie", requesterCookie);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/Escalating|network team/);
  });
});

describe("CN-08 — Internal Notes never reach the Requester through the Ticket detail response", () => {
  it("a Note posted after the fact is absent anywhere in the Requester's GET /api/tickets/:id", async () => {
    await request(app)
      .post(`/api/tickets/${ownTicketId}/notes`)
      .set("Cookie", staffCookie)
      .send({ content: "SECRET-INTERNAL-MARKER-should-never-leak" });

    const res = await request(app).get(`/api/tickets/${ownTicketId}`).set("Cookie", requesterCookie);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET-INTERNAL-MARKER/);
  });
});

describe("CN-09 — append-only, no edit or delete route exists", () => {
  it("PATCH on a comment path is not a registered route", async () => {
    const comment = await getPrisma().publicComment.findFirstOrThrow({ where: { ticketId: ownTicketId } });
    const res = await request(app)
      .patch(`/api/tickets/${ownTicketId}/comments/${comment.id}`)
      .set("Cookie", requesterCookie)
      .send({ content: "edited" });
    expect([404, 405]).toContain(res.status);
  });

  it("DELETE on a note path is not a registered route", async () => {
    const note = await getPrisma().internalNote.findFirstOrThrow({ where: { ticketId: ownTicketId } });
    const res = await request(app).delete(`/api/tickets/${ownTicketId}/notes/${note.id}`).set("Cookie", staffCookie);
    expect([404, 405]).toContain(res.status);
  });
});
