import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { nextTicketNumber, withUniqueTicketNumber } from "./ticketNumber.js";
import { deleteFiles, MAX_ACTIVE_ATTACHMENTS, UnsupportedFileTypeError, uploadAttachments, UPLOAD_DIR } from "./attachmentStorage.js";
import { hashPassword, passwordRuleViolations, verifyPassword } from "./password.js";
import {
  AuthedRequest,
  attachSession,
  clearSessionCookie,
  requireAuth,
  requirePasswordChanged,
  requireRole,
  revokeSession,
  setSessionCookie,
  signSession,
} from "./session.js";
import { allowedTransitions, isAllowedTransition } from "./statusTransitions.js";

// Issue 34 — every Requester route requires both a session (401 if absent)
// and the REQUESTER role (403 for any other authenticated role); ownership
// itself always comes from the session's id, never a client-supplied value
// in the body/query (BR-03).
const requireRequester = [requireAuth, requireRole("REQUESTER")];

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

// Lab 3 (Issue 32) — credentials:true + an explicit origin (never a
// wildcard) is required for the browser to send/receive the session cookie
// across the Vite (5173) <-> API (3000) ports (specification.md §11).
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(attachSession);
app.use(requirePasswordChanged);

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// ---------------------------------------------------------------------------
// Issue 4 — category list
// GET /api/categories must read the seeded categories through Prisma.
// ---------------------------------------------------------------------------
app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(categories);
  } catch {
    res.status(500).json({ error: "Unable to load categories" });
  }
});

// ---------------------------------------------------------------------------
// Issue 6 — reference data and Development Requester context.
// No X-Dev-Requester-Id header required here: the selector calls these routes
// before a Requester is in context (api-spec.md "Reference data").
// ---------------------------------------------------------------------------
app.get("/api/related-systems", async (_req: Request, res: Response) => {
  try {
    const relatedSystems = await getPrisma().relatedSystem.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(relatedSystems);
  } catch {
    res.status(500).json({ error: "Unable to load related systems" });
  }
});

// Lab 3 (Issue 32) — the User table now also holds IT Staff and
// Administrator rows, so this legacy list must filter to role: "REQUESTER"
// or the Development Requester selector would start leaking staff/admin
// identities. The selector itself is removed in Issue 33; until then it
// must keep working exactly as it did in Lab 2.
app.get("/api/requesters", async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().user.findMany({
      where: { isActive: true, role: "REQUESTER" },
      orderBy: { id: "asc" },
      select: { id: true, name: true, email: true },
    });
    res.status(200).json(requesters);
  } catch {
    res.status(500).json({ error: "Unable to load requesters" });
  }
});

// ---------------------------------------------------------------------------
// Issue 8 — Create Ticket.
// ---------------------------------------------------------------------------
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
const TICKET_STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
] as const;

interface TicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH";
}

async function validateTicketInput(
  body: Record<string, unknown>
): Promise<{ errors: string[] } | { data: TicketInput }> {
  const errors: string[] = [];
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const categoryId = Number(body.categoryId);
  const relatedSystemId = Number(body.relatedSystemId);
  const requestedPriority = body.requestedPriority;

  if (summary.length < 5 || summary.length > 150) {
    errors.push("summary must be between 5 and 150 characters");
  }
  if (description.length < 10 || description.length > 4000) {
    errors.push("description must be between 10 and 4000 characters");
  }
  if (typeof requestedPriority !== "string" || !PRIORITIES.includes(requestedPriority)) {
    errors.push("requestedPriority must be LOW, MEDIUM, or HIGH");
  }
  if (!Number.isInteger(categoryId)) errors.push("categoryId is required");
  if (!Number.isInteger(relatedSystemId)) errors.push("relatedSystemId is required");
  if (errors.length > 0) return { errors };

  const [category, relatedSystem] = await Promise.all([
    getPrisma().category.findUnique({ where: { id: categoryId } }),
    getPrisma().relatedSystem.findUnique({ where: { id: relatedSystemId } }),
  ]);
  if (!category || !category.isActive) errors.push("categoryId does not match an active category");
  if (!relatedSystem || !relatedSystem.isActive) {
    errors.push("relatedSystemId does not match an active related system");
  }
  if (errors.length > 0) return { errors };

  return {
    data: {
      categoryId,
      relatedSystemId,
      summary,
      description,
      requestedPriority: requestedPriority as "LOW" | "MEDIUM" | "HIGH",
    },
  };
}

// Issue 11 — compensation strategy for creation-with-attachments
// (specification.md §11): validate all files first (fileFilter/limits below),
// write them to disk under their final safe name, then create the Ticket +
// Attachment rows in one transaction. On any failure after upload, delete the
// written files — no orphaned Ticket row and no orphaned file either way.
app.post(
  "/api/tickets",
  ...requireRequester,
  uploadAttachments.array("attachments", MAX_ACTIVE_ATTACHMENTS),
  async (req: AuthedRequest, res: Response) => {
    const files = (req.files as Express.Multer.File[]) ?? [];
    const result = await validateTicketInput(req.body);
    if ("errors" in result) {
      await deleteFiles(files);
      res.status(400).json({ error: { message: result.errors.join("; ") } });
      return;
    }

    try {
      const year = new Date().getFullYear();
      const ticket = await withUniqueTicketNumber(
        () => nextTicketNumber(year),
        (ticketNumber) =>
          getPrisma().$transaction(async (tx) => {
            const created = await tx.ticket.create({
              data: {
                ticketNumber,
                requesterId: req.user!.id,
                ...result.data,
                // BR-35 — IT Priority initially copies Requested Priority;
                // IT Staff can change it later (Issue 36).
                itPriority: result.data.requestedPriority,
              },
            });
            const attachments = await Promise.all(
              files.map((f) =>
                tx.attachment.create({
                  data: {
                    ticketId: created.id,
                    originalName: f.originalname,
                    storedName: path.basename(f.path),
                    mimeType: f.mimetype,
                    sizeBytes: f.size,
                  },
                })
              )
            );
            return { ...created, attachments };
          })
      );
      res.status(201).json({ data: ticket });
    } catch {
      await deleteFiles(files);
      res.status(500).json({ error: { message: "Unable to create ticket" } });
    }
  }
);

// ---------------------------------------------------------------------------
// Issue 9 — My Tickets: search, filter, sort, paginate the current
// Requester's own Tickets. Always scoped server-side (BR-11) — the frontend
// never receives another Requester's rows to filter out.
// `attachmentCount` is deferred to Issue 11 (no Attachment model yet).
// ---------------------------------------------------------------------------
const SORT_FIELDS = ["createdAt", "ticketNumber", "summary"] as const;
const ORDERS = ["asc", "desc"] as const;
const PAGE_SIZES = [10, 20, 50];

app.get("/api/tickets", ...requireRequester, async (req: AuthedRequest, res: Response) => {
  const sort = (req.query.sort as string) ?? "createdAt";
  const order = (req.query.order as string) ?? "desc";
  const pageRaw = req.query.page !== undefined ? Number(req.query.page) : 1;
  const pageSizeRaw = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 10;

  if (!SORT_FIELDS.includes(sort as (typeof SORT_FIELDS)[number])) {
    res.status(400).json({ error: { message: `invalid sort: '${sort}'` } });
    return;
  }
  if (!ORDERS.includes(order as (typeof ORDERS)[number])) {
    res.status(400).json({ error: { message: `invalid order: '${order}'` } });
    return;
  }
  if (!Number.isInteger(pageRaw) || pageRaw < 1) {
    res.status(400).json({ error: { message: `invalid page: '${req.query.page}'` } });
    return;
  }
  if (!PAGE_SIZES.includes(pageSizeRaw)) {
    res.status(400).json({ error: { message: `invalid pageSize: '${req.query.pageSize}'` } });
    return;
  }

  const where: Prisma.TicketWhereInput = { requesterId: req.user!.id };

  const search = req.query.search;
  if (typeof search === "string" && search.trim()) {
    const term = search.trim();
    where.OR = [
      { ticketNumber: { contains: term, mode: "insensitive" } },
      { summary: { contains: term, mode: "insensitive" } },
    ];
  }

  if (req.query.categoryId !== undefined) {
    const id = Number(req.query.categoryId);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: { message: `invalid categoryId: '${req.query.categoryId}'` } });
      return;
    }
    where.categoryId = id;
  }

  if (req.query.relatedSystemId !== undefined) {
    const id = Number(req.query.relatedSystemId);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: { message: `invalid relatedSystemId: '${req.query.relatedSystemId}'` } });
      return;
    }
    where.relatedSystemId = id;
  }

  if (req.query.requestedPriority !== undefined) {
    if (!PRIORITIES.includes(req.query.requestedPriority as string)) {
      res.status(400).json({ error: { message: `invalid requestedPriority: '${req.query.requestedPriority}'` } });
      return;
    }
    where.requestedPriority = req.query.requestedPriority as "LOW" | "MEDIUM" | "HIGH";
  }

  try {
    const [total, tickets] = await Promise.all([
      getPrisma().ticket.count({ where }),
      getPrisma().ticket.findMany({
        where,
        orderBy: [{ [sort]: order } as Prisma.TicketOrderByWithRelationInput, { id: "desc" }],
        skip: (pageRaw - 1) * pageSizeRaw,
        take: pageSizeRaw,
      }),
    ]);
    res.status(200).json({
      data: tickets,
      meta: { page: pageRaw, pageSize: pageSizeRaw, total, totalPages: Math.ceil(total / pageSizeRaw) },
    });
  } catch {
    res.status(500).json({ error: { message: "Unable to load tickets" } });
  }
});

// ---------------------------------------------------------------------------
// Issue 10 — Requester Ticket Detail, read-only. 404 (never 403) when the
// Ticket doesn't exist or isn't owned by the current Requester (BR-10):
// a 403 would confirm the resource exists under someone else.
// ---------------------------------------------------------------------------
app.get("/api/tickets/:id", ...requireRequester, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }

  try {
    const ticket = await getPrisma().ticket.findUnique({ where: { id } });
    if (!ticket || ticket.requesterId !== req.user!.id) {
      res.status(404).json({ error: { message: "Ticket not found" } });
      return;
    }
    const attachments = await getPrisma().attachment.findMany({ where: { ticketId: id }, orderBy: { id: "asc" } });
    res.status(200).json({ data: { ...ticket, attachments } });
  } catch {
    res.status(500).json({ error: { message: "Unable to load ticket" } });
  }
});

// ---------------------------------------------------------------------------
// Issue 11 — Attachment lifecycle.
// ---------------------------------------------------------------------------
app.post(
  "/api/tickets/:id/attachments",
  ...requireRequester,
  uploadAttachments.array("attachments", MAX_ACTIVE_ATTACHMENTS),
  async (req: AuthedRequest, res: Response) => {
    const files = (req.files as Express.Multer.File[]) ?? [];
    const ticketId = Number(req.params.id);

    if (!Number.isInteger(ticketId)) {
      await deleteFiles(files);
      res.status(404).json({ error: { message: "Ticket not found" } });
      return;
    }
    if (files.length === 0) {
      res.status(400).json({ error: { message: "At least one file is required" } });
      return;
    }

    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.requesterId !== req.user!.id) {
      await deleteFiles(files);
      res.status(404).json({ error: { message: "Ticket not found" } });
      return;
    }

    // BR-15/BR-16 — soft-removed attachments don't count toward the quota.
    const activeCount = await getPrisma().attachment.count({ where: { ticketId, removedAt: null } });
    if (activeCount + files.length > MAX_ACTIVE_ATTACHMENTS) {
      await deleteFiles(files);
      res.status(409).json({
        error: { message: `Ticket already has ${activeCount} active attachment(s); maximum is ${MAX_ACTIVE_ATTACHMENTS}` },
      });
      return;
    }

    try {
      const created = await getPrisma().$transaction(
        files.map((f) =>
          getPrisma().attachment.create({
            data: {
              ticketId,
              originalName: f.originalname,
              storedName: path.basename(f.path),
              mimeType: f.mimetype,
              sizeBytes: f.size,
            },
          })
        )
      );
      res.status(201).json({ data: created });
    } catch {
      await deleteFiles(files);
      res.status(500).json({ error: { message: "Unable to save attachments" } });
    }
  }
);

// Owned + active only (BR-10, BR-19): identical 404 whether the attachment
// doesn't exist, isn't owned via its Ticket, or has been soft-removed.
app.get("/api/attachments/:id/download", ...requireRequester, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: { message: "Attachment not found" } });
    return;
  }

  const attachment = await getPrisma().attachment.findUnique({ where: { id }, include: { ticket: true } });
  if (!attachment || attachment.ticket.requesterId !== req.user!.id || attachment.removedAt) {
    res.status(404).json({ error: { message: "Attachment not found" } });
    return;
  }

  res.download(path.join(UPLOAD_DIR, attachment.storedName), attachment.originalName, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: { message: "Unable to download attachment" } });
    }
  });
});

// Soft removal only — BR-18/BR-19: reason required, only the owner (via the
// Ticket) may remove, metadata stays visible afterward.
app.delete("/api/attachments/:id", ...requireRequester, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!reason) {
    res.status(400).json({ error: { message: "reason is required" } });
    return;
  }
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: { message: "Attachment not found" } });
    return;
  }

  const attachment = await getPrisma().attachment.findUnique({ where: { id }, include: { ticket: true } });
  if (!attachment || attachment.ticket.requesterId !== req.user!.id || attachment.removedAt) {
    res.status(404).json({ error: { message: "Attachment not found" } });
    return;
  }

  try {
    const updated = await getPrisma().attachment.update({
      where: { id },
      data: { removedAt: new Date(), removalReason: reason },
    });
    res.status(200).json({ data: updated });
  } catch {
    res.status(500).json({ error: { message: "Unable to remove attachment" } });
  }
});

// ---------------------------------------------------------------------------
// Issue 32 — Authentication foundation.
// ---------------------------------------------------------------------------
const GENERIC_LOGIN_ERROR = { error: { message: "Invalid email or password." } };

app.post("/api/auth/login", async (req: Request, res: Response) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) {
    res.status(400).json({ error: { message: "email and password are required" } });
    return;
  }

  try {
    const user = await getPrisma().user.findUnique({ where: { email } });
    // BR-08 — identical response whether the email is unknown, the password
    // is wrong, or the account is inactive: none of the three should be
    // distinguishable to someone probing which emails exist.
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json(GENERIC_LOGIN_ERROR);
      return;
    }

    const token = signSession({ id: user.id, role: user.role, mustChangePassword: user.mustChangePassword });
    setSessionCookie(res, token);
    res.status(200).json({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch {
    res.status(500).json({ error: { message: "Unable to log in" } });
  }
});

app.post("/api/auth/logout", requireAuth, (req: AuthedRequest, res: Response) => {
  revokeSession(req);
  clearSessionCookie(res);
  res.status(200).json({ data: { loggedOut: true } });
});

app.get("/api/auth/me", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const user = await getPrisma().user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(401).json({ error: { message: "Authentication required" } });
      return;
    }
    res.status(200).json({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch {
    res.status(500).json({ error: { message: "Unable to load current user" } });
  }
});

app.post("/api/auth/change-password", requireAuth, async (req: AuthedRequest, res: Response) => {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: { message: "currentPassword and newPassword are required" } });
    return;
  }

  try {
    const user = await getPrisma().user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      res.status(401).json({ error: { message: "Current password is incorrect" } });
      return;
    }

    const violations = passwordRuleViolations(newPassword);
    if (violations.length > 0) {
      res.status(400).json({ error: { message: violations.join("; ") } });
      return;
    }
    if (newPassword === currentPassword) {
      res.status(400).json({ error: { message: "newPassword must be different from currentPassword" } });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    await getPrisma().user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });

    // Re-sign the cookie with mustChangePassword:false — the old token has
    // the old value baked in (a JWT can't be edited in place), so without
    // this the gate would keep firing on the very session that just
    // satisfied it. The old token is also revoked, closing the tiny window
    // where both would otherwise verify.
    revokeSession(req);
    const token = signSession({ id: user.id, role: user.role, mustChangePassword: false });
    setSessionCookie(res, token);
    res.status(200).json({ data: { mustChangePassword: false } });
  } catch {
    res.status(500).json({ error: { message: "Unable to change password" } });
  }
});

// ---------------------------------------------------------------------------
// Issue 35 — IT Staff Ticket Queue.
// ---------------------------------------------------------------------------
const STAFF_SORT_FIELDS = ["createdAt", "updatedAt", "itPriority", "ticketNumber"] as const;
const requireStaffRead = [requireAuth, requireRole("IT_STAFF", "ADMINISTRATOR")];
// Issue 36 — Administrator is read-only on Tickets (specification.md §11's
// authorization-matrix decision): claim/reassign/priority/status are
// IT_STAFF-only, unlike the read routes above.
const requireStaffWrite = [requireAuth, requireRole("IT_STAFF")];

app.get("/api/staff/tickets", ...requireStaffRead, async (req: AuthedRequest, res: Response) => {
  const sort = (req.query.sort as string) ?? "updatedAt";
  const order = (req.query.order as string) ?? "desc";
  const pageRaw = req.query.page !== undefined ? Number(req.query.page) : 1;
  const pageSizeRaw = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 10;

  if (!STAFF_SORT_FIELDS.includes(sort as (typeof STAFF_SORT_FIELDS)[number])) {
    res.status(400).json({ error: { message: `invalid sort: '${sort}'` } });
    return;
  }
  if (!ORDERS.includes(order as (typeof ORDERS)[number])) {
    res.status(400).json({ error: { message: `invalid order: '${order}'` } });
    return;
  }
  if (!Number.isInteger(pageRaw) || pageRaw < 1) {
    res.status(400).json({ error: { message: `invalid page: '${req.query.page}'` } });
    return;
  }
  if (!PAGE_SIZES.includes(pageSizeRaw)) {
    res.status(400).json({ error: { message: `invalid pageSize: '${req.query.pageSize}'` } });
    return;
  }

  // Shared queue (FR-11) — every Ticket, not just the caller's own.
  const where: Prisma.TicketWhereInput = {};

  const search = req.query.search;
  if (typeof search === "string" && search.trim()) {
    const term = search.trim();
    where.OR = [
      { ticketNumber: { contains: term, mode: "insensitive" } },
      { summary: { contains: term, mode: "insensitive" } },
    ];
  }

  if (req.query.status !== undefined) {
    if (!TICKET_STATUSES.includes(req.query.status as (typeof TICKET_STATUSES)[number])) {
      res.status(400).json({ error: { message: `invalid status: '${req.query.status}'` } });
      return;
    }
    where.status = req.query.status as (typeof TICKET_STATUSES)[number];
  }

  if (req.query.itPriority !== undefined) {
    if (!PRIORITIES.includes(req.query.itPriority as string)) {
      res.status(400).json({ error: { message: `invalid itPriority: '${req.query.itPriority}'` } });
      return;
    }
    where.itPriority = req.query.itPriority as "LOW" | "MEDIUM" | "HIGH";
  }

  if (req.query.ownerId !== undefined) {
    if (req.query.ownerId === "unassigned") {
      where.ticketOwnerId = null;
    } else {
      const id = Number(req.query.ownerId);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: { message: `invalid ownerId: '${req.query.ownerId}'` } });
        return;
      }
      where.ticketOwnerId = id;
    }
  }

  if (req.query.categoryId !== undefined) {
    const id = Number(req.query.categoryId);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: { message: `invalid categoryId: '${req.query.categoryId}'` } });
      return;
    }
    where.categoryId = id;
  }

  try {
    const [total, tickets] = await Promise.all([
      getPrisma().ticket.count({ where }),
      getPrisma().ticket.findMany({
        where,
        include: { ticketOwner: { select: { name: true } }, category: { select: { name: true } } },
        orderBy: [{ [sort]: order } as Prisma.TicketOrderByWithRelationInput, { id: "desc" }],
        skip: (pageRaw - 1) * pageSizeRaw,
        take: pageSizeRaw,
      }),
    ]);
    const data = tickets.map(({ ticketOwner, category, ...ticket }) => ({
      ...ticket,
      ticketOwnerName: ticketOwner?.name ?? null,
      categoryName: category.name,
    }));
    res.status(200).json({
      data,
      meta: { page: pageRaw, pageSize: pageSizeRaw, total, totalPages: Math.ceil(total / pageSizeRaw) },
    });
  } catch {
    res.status(500).json({ error: { message: "Unable to load the ticket queue" } });
  }
});

// Not in api-spec.md's original contract — added while building the queue's
// Owner filter (ui-spec.md §4: a named dropdown, not a raw id input), and
// reused by Issue 36's claim/reassign control. IT Staff needs this list too
// (not just Administrator), so it can't be the Issue 38 admin users route.
app.get("/api/staff/users", ...requireStaffRead, async (_req: Request, res: Response) => {
  try {
    const staffUsers = await getPrisma().user.findMany({
      where: { isActive: true, role: { in: ["IT_STAFF", "ADMINISTRATOR"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json({ data: staffUsers });
  } catch {
    res.status(500).json({ error: { message: "Unable to load staff users" } });
  }
});

// ---------------------------------------------------------------------------
// Issue 36 — IT Staff Ticket Detail and workflow.
// ---------------------------------------------------------------------------

// publicComments/internalNotes are hardcoded empty until Issue 37 creates
// those models — the response shape stays stable across both Issues, only
// the contents change from always-empty to real queries.
app.get("/api/staff/tickets/:id", ...requireStaffRead, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }

  try {
    const ticket = await getPrisma().ticket.findUnique({
      where: { id },
      include: { ticketOwner: { select: { name: true } }, category: { select: { name: true } } },
    });
    if (!ticket) {
      res.status(404).json({ error: { message: "Ticket not found" } });
      return;
    }
    const attachments = await getPrisma().attachment.findMany({ where: { ticketId: id }, orderBy: { id: "asc" } });
    const { ticketOwner, category, ...rest } = ticket;
    res.status(200).json({
      data: {
        ...rest,
        ticketOwnerName: ticketOwner?.name ?? null,
        categoryName: category.name,
        attachments,
        publicComments: [],
        internalNotes: [],
      },
    });
  } catch {
    res.status(500).json({ error: { message: "Unable to load ticket" } });
  }
});

// BR-19 (briefing) — the owner must be an active IT_STAFF/ADMINISTRATOR
// user; Administrator itself cannot call this route (write, not read), but
// CAN be the target of an assignment (an Admin picking up a ticket).
app.patch("/api/staff/tickets/:id/owner", ...requireStaffWrite, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }
  const ticket = await getPrisma().ticket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }

  const raw = req.body?.ticketOwnerId;
  const ticketOwnerId = raw === null ? null : Number(raw);
  if (ticketOwnerId !== null && !Number.isInteger(ticketOwnerId)) {
    res.status(400).json({ error: { message: "ticketOwnerId must be an integer or null" } });
    return;
  }
  if (ticketOwnerId !== null) {
    const owner = await getPrisma().user.findUnique({ where: { id: ticketOwnerId } });
    if (!owner || !owner.isActive || (owner.role !== "IT_STAFF" && owner.role !== "ADMINISTRATOR")) {
      res.status(400).json({ error: { message: "ticketOwnerId must be an active IT Staff or Administrator user" } });
      return;
    }
  }

  try {
    const updated = await getPrisma().ticket.update({
      where: { id },
      data: { ticketOwnerId },
      include: { ticketOwner: { select: { name: true } } },
    });
    res.status(200).json({ data: { ticketOwnerId: updated.ticketOwnerId, ticketOwnerName: updated.ticketOwner?.name ?? null } });
  } catch {
    res.status(500).json({ error: { message: "Unable to update the ticket owner" } });
  }
});

app.patch("/api/staff/tickets/:id/priority", ...requireStaffWrite, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }
  const ticket = await getPrisma().ticket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }
  if (!PRIORITIES.includes(req.body?.itPriority)) {
    res.status(400).json({ error: { message: `invalid itPriority: '${req.body?.itPriority}'` } });
    return;
  }

  try {
    const updated = await getPrisma().ticket.update({
      where: { id },
      data: { itPriority: req.body.itPriority },
    });
    res.status(200).json({ data: { itPriority: updated.itPriority } });
  } catch {
    res.status(500).json({ error: { message: "Unable to update IT Priority" } });
  }
});

// BR-22/BR-23 (briefing) — the transition table is the sole source of
// truth; a disallowed transition names the current state and every allowed
// target so the caller (or its UI) can self-correct without guessing.
app.patch("/api/staff/tickets/:id/status", ...requireStaffWrite, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }
  const ticket = await getPrisma().ticket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }
  const targetStatus = req.body?.status;
  if (!TICKET_STATUSES.includes(targetStatus)) {
    res.status(400).json({ error: { message: `invalid status: '${targetStatus}'` } });
    return;
  }
  if (!isAllowedTransition(ticket.status, targetStatus)) {
    const allowed = allowedTransitions(ticket.status);
    const message =
      allowed.length === 0
        ? `Cannot move from ${ticket.status}: no transitions are allowed (terminal state).`
        : `Cannot move from ${ticket.status} to ${targetStatus}. Allowed: ${allowed.join(", ")}.`;
    res.status(409).json({ error: { message } });
    return;
  }

  const resolutionSummary = typeof req.body?.resolutionSummary === "string" ? req.body.resolutionSummary.trim() : undefined;
  try {
    const updated = await getPrisma().ticket.update({
      where: { id },
      data: { status: targetStatus, ...(resolutionSummary !== undefined ? { resolutionSummary } : {}) },
    });
    res.status(200).json({ data: { status: updated.status, resolutionSummary: updated.resolutionSummary } });
  } catch {
    res.status(500).json({ error: { message: "Unable to update status" } });
  }
});

// Requester-only — BR-05: sets the signal, never the formal status.
app.patch("/api/tickets/:id/resolution-indicated", ...requireRequester, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }
  const ticket = await getPrisma().ticket.findUnique({ where: { id } });
  if (!ticket || ticket.requesterId !== req.user!.id) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }

  try {
    const updated = await getPrisma().ticket.update({
      where: { id },
      data: { requesterResolutionIndicatedAt: new Date() },
    });
    res.status(200).json({ data: { requesterResolutionIndicatedAt: updated.requesterResolutionIndicatedAt } });
  } catch {
    res.status(500).json({ error: { message: "Unable to record the resolution signal" } });
  }
});

// Multer's fileFilter/limits errors surface here (must stay last, 4 args).
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof UnsupportedFileTypeError) {
    res.status(415).json({ error: { message: err.message } });
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: { message: "File exceeds the 5 MB limit" } });
      return;
    }
    res.status(400).json({ error: { message: err.message } });
    return;
  }
  next(err);
});

export default app;
