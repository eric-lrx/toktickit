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
import { registerActionsTakenRoutes } from "./actionsTaken.js";
import { OPEN_ACTION_STATUSES } from "./actionStatus.js";
import { nextResolvedAt } from "./ticketWorkflow.js";

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
    const [attachments, comments] = await Promise.all([
      getPrisma().attachment.findMany({ where: { ticketId: id }, orderBy: { id: "asc" } }),
      getPrisma().publicComment.findMany({
        where: { ticketId: id },
        include: { author: { select: { name: true, role: true } } },
        orderBy: { id: "asc" },
      }),
    ]);
    // Internal Notes are never queried here at all — not filtered out, not
    // present to begin with, so a Requester session structurally cannot
    // receive one through this route (ui-spec.md §6).
    res.status(200).json({
      data: {
        ...ticket,
        attachments,
        publicComments: comments.map((c) => ({
          id: c.id,
          authorName: c.author.name,
          authorRole: c.author.role,
          content: c.content,
          createdAt: c.createdAt,
        })),
      },
    });
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
// Lab 4 (docs/lab-04/specification.md §4, §11) — the Administrator now
// performs IT Staff behavior on Tickets (handout §4.3), reversing Lab 3's
// read-only decision on purpose: claim/reassign/priority/status/notes are
// open to both roles.
const requireStaffWrite = [requireAuth, requireRole("IT_STAFF", "ADMINISTRATOR")];

// BR-21 — optional on the Lab 3 Ticket routes so their contract keeps
// working; the Lab 4 UI always sends it. undefined = not sent.
function parseOptionalVersion(raw: unknown): number | undefined | "invalid" {
  if (raw === undefined) return undefined;
  return Number.isInteger(raw) ? (raw as number) : "invalid";
}

function staleTicketBody(t: { id: number; status: string; version: number; ticketOwnerId: number | null; itPriority: string; resolutionSummary: string | null; resolvedAt: Date | null }) {
  return {
    error: {
      message: "This ticket was changed by someone else. Reload to see the latest version.",
      code: "STALE_UPDATE",
      current: {
        id: t.id,
        status: t.status,
        version: t.version,
        ticketOwnerId: t.ticketOwnerId,
        itPriority: t.itPriority,
        resolutionSummary: t.resolutionSummary,
        resolvedAt: t.resolvedAt,
      },
    },
  };
}

class WorkflowError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    super("workflow error");
  }
}

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
    const [attachments, comments, notes] = await Promise.all([
      getPrisma().attachment.findMany({ where: { ticketId: id }, orderBy: { id: "asc" } }),
      getPrisma().publicComment.findMany({
        where: { ticketId: id },
        include: { author: { select: { name: true, role: true } } },
        orderBy: { id: "asc" },
      }),
      getPrisma().internalNote.findMany({
        where: { ticketId: id },
        include: { author: { select: { name: true } } },
        orderBy: { id: "asc" },
      }),
    ]);
    const { ticketOwner, category, ...rest } = ticket;
    res.status(200).json({
      data: {
        ...rest,
        ticketOwnerName: ticketOwner?.name ?? null,
        categoryName: category.name,
        // Lab 4 — the UI offers exactly these, never a copy of the table.
        allowedTransitions: allowedTransitions(rest.status),
        attachments,
        publicComments: comments.map((c) => ({
          id: c.id,
          authorName: c.author.name,
          authorRole: c.author.role,
          content: c.content,
          createdAt: c.createdAt,
        })),
        internalNotes: notes.map((n) => ({ id: n.id, authorName: n.author.name, content: n.content, createdAt: n.createdAt })),
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

  const version = parseOptionalVersion(req.body?.version);
  if (version === "invalid") {
    res.status(400).json({ error: { message: "version must be an integer" } });
    return;
  }

  try {
    const { count } = await getPrisma().ticket.updateMany({
      where: { id, ...(version !== undefined ? { version } : {}) },
      data: { ticketOwnerId, version: { increment: 1 } },
    });
    const updated = await getPrisma().ticket.findUniqueOrThrow({ where: { id }, include: { ticketOwner: { select: { name: true } } } });
    if (count === 0) {
      res.status(409).json(staleTicketBody(updated));
      return;
    }
    res.status(200).json({
      data: { ticketOwnerId: updated.ticketOwnerId, ticketOwnerName: updated.ticketOwner?.name ?? null, version: updated.version },
    });
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

  const version = parseOptionalVersion(req.body?.version);
  if (version === "invalid") {
    res.status(400).json({ error: { message: "version must be an integer" } });
    return;
  }

  try {
    const { count } = await getPrisma().ticket.updateMany({
      where: { id, ...(version !== undefined ? { version } : {}) },
      data: { itPriority: req.body.itPriority, version: { increment: 1 } },
    });
    const updated = await getPrisma().ticket.findUniqueOrThrow({ where: { id } });
    if (count === 0) {
      res.status(409).json(staleTicketBody(updated));
      return;
    }
    res.status(200).json({ data: { itPriority: updated.itPriority, version: updated.version } });
  } catch {
    res.status(500).json({ error: { message: "Unable to update IT Priority" } });
  }
});

// BR-22/BR-23 (briefing) — the transition table is the sole source of
// truth; a disallowed transition names the current state and every allowed
// target so the caller (or its UI) can self-correct without guessing.
//
// Lab 4 — one transaction with the Ticket row locked (SELECT … FOR UPDATE):
// version check (BR-21) → transition matrix (BR-14) → resolution gate
// (BR-15) → update with resolvedAt (BR-16) → status-history row (BR-18).
// Action Taken writes lock the same row (actionsTaken.ts), so no action can
// be created between the gate's check and the RESOLVED update.
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
  const version = parseOptionalVersion(req.body?.version);
  if (version === "invalid") {
    res.status(400).json({ error: { message: "version must be an integer" } });
    return;
  }
  const resolutionSummary = typeof req.body?.resolutionSummary === "string" ? req.body.resolutionSummary.trim() : undefined;

  try {
    const updated = await getPrisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
      const current = await tx.ticket.findUniqueOrThrow({ where: { id } });

      if (version !== undefined && current.version !== version) {
        throw new WorkflowError(409, staleTicketBody(current));
      }
      if (!isAllowedTransition(current.status, targetStatus)) {
        const allowed = allowedTransitions(current.status);
        const message =
          allowed.length === 0
            ? `Cannot move from ${current.status}: no transitions are allowed (terminal state).`
            : `Cannot move from ${current.status} to ${targetStatus}. Allowed: ${allowed.join(", ")}.`;
        throw new WorkflowError(409, { error: { message } });
      }
      if (targetStatus === "RESOLVED") {
        const blocking = await tx.actionTaken.findMany({
          where: { ticketId: id, status: { in: OPEN_ACTION_STATUSES } },
          select: { id: true },
          orderBy: { id: "asc" },
        });
        if (blocking.length > 0) {
          throw new WorkflowError(409, {
            error: {
              message: "Resolve or cancel the open Actions Taken first.",
              code: "RESOLUTION_BLOCKED",
              blockingActionIds: blocking.map((a) => a.id),
            },
          });
        }
      }

      const saved = await tx.ticket.update({
        where: { id },
        data: {
          status: targetStatus,
          resolvedAt: nextResolvedAt(targetStatus, current.resolvedAt, new Date()),
          version: { increment: 1 },
          ...(resolutionSummary !== undefined ? { resolutionSummary } : {}),
        },
      });
      await tx.ticketStatusChange.create({
        data: { ticketId: id, fromStatus: current.status, toStatus: targetStatus, changedById: req.user!.id },
      });
      return saved;
    });
    res.status(200).json({
      data: {
        status: updated.status,
        resolutionSummary: updated.resolutionSummary,
        resolvedAt: updated.resolvedAt,
        version: updated.version,
        allowedTransitions: allowedTransitions(updated.status),
      },
    });
  } catch (err) {
    if (err instanceof WorkflowError) {
      res.status(err.status).json(err.body);
      return;
    }
    res.status(500).json({ error: { message: "Unable to update status" } });
  }
});

// Lab 4, BR-18 — append-only history, oldest first. Requester: own Ticket
// only (404 otherwise, never 403 — BR-16 of Lab 3).
app.get("/api/tickets/:id/status-history", requireAuth, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const ticket = Number.isInteger(id) ? await getPrisma().ticket.findUnique({ where: { id } }) : null;
  if (!ticket || (req.user!.role === "REQUESTER" && ticket.requesterId !== req.user!.id)) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }
  try {
    const rows = await getPrisma().ticketStatusChange.findMany({
      where: { ticketId: id },
      include: { changedBy: { select: { name: true, role: true } } },
      orderBy: [{ changedAt: "asc" }, { id: "asc" }],
    });
    res.status(200).json({
      data: rows.map((r) => ({
        id: r.id,
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        changedByName: r.changedBy.name,
        changedByRole: r.changedBy.role,
        changedAt: r.changedAt,
      })),
    });
  } catch {
    res.status(500).json({ error: { message: "Unable to load the status history" } });
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
      data: { requesterResolutionIndicatedAt: new Date(), version: { increment: 1 } },
    });
    res.status(200).json({ data: { requesterResolutionIndicatedAt: updated.requesterResolutionIndicatedAt } });
  } catch {
    res.status(500).json({ error: { message: "Unable to record the resolution signal" } });
  }
});

// ---------------------------------------------------------------------------
// Issue 37 — Public Comments and Internal Notes. Two separate tables (not
// one with an isInternal flag), so this section structurally cannot leak a
// Note through the Comments routes — there's no column to leak from.
// ---------------------------------------------------------------------------
const MAX_COMMENT_LENGTH = 4000;

function validateCommentContent(raw: unknown): { error: string } | { content: string } {
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) return { error: "content is required" };
  if (content.length > MAX_COMMENT_LENGTH) {
    return { error: `content must be ${MAX_COMMENT_LENGTH} characters or fewer` };
  }
  return { content };
}

// Requester (own Ticket only), IT Staff or Administrator (any Ticket) —
// Lab 4's revised matrix gives the Administrator IT Staff behavior.
app.post("/api/tickets/:id/comments", requireAuth, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const ticket = Number.isInteger(id) ? await getPrisma().ticket.findUnique({ where: { id } }) : null;
  if (!ticket || (req.user!.role === "REQUESTER" && ticket.requesterId !== req.user!.id)) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }

  const result = validateCommentContent(req.body?.content);
  if ("error" in result) {
    res.status(400).json({ error: { message: result.error } });
    return;
  }

  try {
    const comment = await getPrisma().publicComment.create({
      data: { ticketId: id, authorId: req.user!.id, content: result.content },
      include: { author: { select: { name: true } } },
    });
    res.status(201).json({
      data: {
        id: comment.id,
        ticketId: comment.ticketId,
        authorId: comment.authorId,
        authorName: comment.author.name,
        content: comment.content,
        createdAt: comment.createdAt,
      },
    });
  } catch {
    res.status(500).json({ error: { message: "Unable to post comment" } });
  }
});

// Every role that can view a Ticket at all can view its comments — the only
// rejection is ownership (404, BR-16), never a role-based 403.
app.get("/api/tickets/:id/comments", requireAuth, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const ticket = Number.isInteger(id) ? await getPrisma().ticket.findUnique({ where: { id } }) : null;
  if (!ticket || (req.user!.role === "REQUESTER" && ticket.requesterId !== req.user!.id)) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }

  try {
    const comments = await getPrisma().publicComment.findMany({
      where: { ticketId: id },
      include: { author: { select: { name: true, role: true } } },
      orderBy: { id: "asc" },
    });
    res.status(200).json({
      data: comments.map((c) => ({
        id: c.id,
        authorName: c.author.name,
        authorRole: c.author.role,
        content: c.content,
        createdAt: c.createdAt,
      })),
    });
  } catch {
    res.status(500).json({ error: { message: "Unable to load comments" } });
  }
});

// IT Staff only — AC-04/AUTHZ-02: a Requester's direct call is rejected by
// requireStaffWrite before the handler ever runs, so no note content can
// leak regardless of what the handler itself does.
app.post("/api/tickets/:id/notes", ...requireStaffWrite, async (req: AuthedRequest, res: Response) => {
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

  const result = validateCommentContent(req.body?.content);
  if ("error" in result) {
    res.status(400).json({ error: { message: result.error } });
    return;
  }

  try {
    const note = await getPrisma().internalNote.create({
      data: { ticketId: id, authorId: req.user!.id, content: result.content },
      include: { author: { select: { name: true } } },
    });
    res.status(201).json({
      data: {
        id: note.id,
        ticketId: note.ticketId,
        authorId: note.authorId,
        authorName: note.author.name,
        content: note.content,
        createdAt: note.createdAt,
      },
    });
  } catch {
    res.status(500).json({ error: { message: "Unable to post note" } });
  }
});

app.get("/api/tickets/:id/notes", ...requireStaffRead, async (req: AuthedRequest, res: Response) => {
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

  try {
    const notes = await getPrisma().internalNote.findMany({
      where: { ticketId: id },
      include: { author: { select: { name: true } } },
      orderBy: { id: "asc" },
    });
    res.status(200).json({
      data: notes.map((n) => ({ id: n.id, authorName: n.author.name, content: n.content, createdAt: n.createdAt })),
    });
  } catch {
    res.status(500).json({ error: { message: "Unable to load notes" } });
  }
});

// Lab 4, Issue 23 — Actions Taken (docs/lab-04/api-spec.md).
registerActionsTakenRoutes(app);

// ---------------------------------------------------------------------------
// Issue 38 — Administrator user management.
// ---------------------------------------------------------------------------
const requireAdmin = [requireAuth, requireRole("ADMINISTRATOR")];
const ROLES = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const;

function sanitizeUser(user: {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
  };
}

// Control-flow errors thrown inside the PATCH transaction below (BR-30's
// last-Administrator check has to run inside that same transaction, so it
// can't just return a status code directly) — caught once, after the
// transaction, and mapped to their HTTP status there.
class NotFoundError extends Error {}
class SelfDeactivationError extends Error {}
class LastAdminError extends Error {}
class DuplicateEmailError extends Error {}

app.get("/api/admin/users", ...requireAdmin, async (req: Request, res: Response) => {
  const where: Prisma.UserWhereInput = {};

  const search = req.query.search;
  if (typeof search === "string" && search.trim()) {
    const term = search.trim();
    where.OR = [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }];
  }

  if (req.query.role !== undefined) {
    if (!ROLES.includes(req.query.role as (typeof ROLES)[number])) {
      res.status(400).json({ error: { message: `invalid role: '${req.query.role}'` } });
      return;
    }
    where.role = req.query.role as (typeof ROLES)[number];
  }

  try {
    const users = await getPrisma().user.findMany({ where, orderBy: { id: "asc" } });
    res.status(200).json({ data: users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive })) });
  } catch {
    res.status(500).json({ error: { message: "Unable to load users" } });
  }
});

app.post("/api/admin/users", ...requireAdmin, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role = body.role;
  const isActive = body.isActive;
  const initialPassword = typeof body.initialPassword === "string" ? body.initialPassword : "";

  const errors: string[] = [];
  if (!name) errors.push("name is required");
  if (!email) errors.push("email is required");
  if (!ROLES.includes(role)) errors.push("role must be REQUESTER, IT_STAFF, or ADMINISTRATOR");
  if (typeof isActive !== "boolean") errors.push("isActive must be a boolean");
  errors.push(...passwordRuleViolations(initialPassword));
  if (errors.length > 0) {
    res.status(400).json({ error: { message: errors.join("; ") } });
    return;
  }

  try {
    const passwordHash = await hashPassword(initialPassword);
    const created = await getPrisma().user.create({
      data: { name, email, role, isActive, passwordHash, mustChangePassword: true },
    });
    res.status(201).json({ data: sanitizeUser(created) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: { message: "email is already in use" } });
      return;
    }
    res.status(500).json({ error: { message: "Unable to create user" } });
  }
});

// BR-28/29/30 all have to be checked against the same consistent snapshot
// the update itself commits against, so every check plus the update runs
// inside one transaction. BR-30 additionally takes `FOR UPDATE` locks on
// every currently-active-Administrator row before counting them: two
// concurrent requests that would otherwise both read "2 active
// Administrators" and both proceed now serialize on that shared lock, and
// under Postgres's READ COMMITTED isolation the second request's locked
// re-read reflects the first request's already-committed change (Postgres
// re-evaluates a SELECT ... FOR UPDATE row's WHERE clause against the
// latest committed version once its lock is granted) — so the count it
// acts on is never stale.
app.patch("/api/admin/users/:id", ...requireAdmin, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: { message: "User not found" } });
    return;
  }

  const body = req.body ?? {};
  const data: Prisma.UserUpdateInput = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: { message: "name must not be empty" } });
      return;
    }
    data.name = name;
  }
  if (body.email !== undefined) {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) {
      res.status(400).json({ error: { message: "email must not be empty" } });
      return;
    }
    data.email = email;
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) {
      res.status(400).json({ error: { message: `invalid role: '${body.role}'` } });
      return;
    }
    data.role = body.role;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      res.status(400).json({ error: { message: "isActive must be a boolean" } });
      return;
    }
    data.isActive = body.isActive;
  }

  try {
    const updated = await getPrisma().$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError();

      if (data.isActive === false && existing.id === req.user!.id) {
        throw new SelfDeactivationError();
      }

      const wasActiveAdmin = existing.role === "ADMINISTRATOR" && existing.isActive;
      const staysActiveAdmin =
        (data.role !== undefined ? data.role === "ADMINISTRATOR" : existing.role === "ADMINISTRATOR") &&
        (data.isActive !== undefined ? data.isActive === true : existing.isActive);
      if (wasActiveAdmin && !staysActiveAdmin) {
        const activeAdmins = await tx.$queryRaw<
          { id: number }[]
        >`SELECT id FROM "User" WHERE role = 'ADMINISTRATOR' AND "isActive" = true FOR UPDATE`;
        if (activeAdmins.length <= 1) throw new LastAdminError();
      }

      if (data.email !== undefined) {
        const emailOwner = await tx.user.findUnique({ where: { email: data.email as string } });
        if (emailOwner && emailOwner.id !== id) throw new DuplicateEmailError();
      }

      return tx.user.update({ where: { id }, data });
    });
    res.status(200).json({ data: sanitizeUser(updated) });
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: { message: "User not found" } });
      return;
    }
    if (err instanceof SelfDeactivationError) {
      res.status(409).json({ error: { message: "You cannot deactivate your own account." } });
      return;
    }
    if (err instanceof LastAdminError) {
      res.status(409).json({ error: { message: "At least one active Administrator must remain." } });
      return;
    }
    if (err instanceof DuplicateEmailError) {
      res.status(409).json({ error: { message: "email is already in use" } });
      return;
    }
    res.status(500).json({ error: { message: "Unable to update user" } });
  }
});

app.patch("/api/admin/users/:id/password", ...requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: { message: "User not found" } });
    return;
  }
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  const violations = passwordRuleViolations(newPassword);
  if (violations.length > 0) {
    res.status(400).json({ error: { message: violations.join("; ") } });
    return;
  }

  const existing = await getPrisma().user.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: { message: "User not found" } });
    return;
  }

  try {
    const passwordHash = await hashPassword(newPassword);
    const updated = await getPrisma().user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });
    res.status(200).json({ data: { mustChangePassword: updated.mustChangePassword } });
  } catch {
    res.status(500).json({ error: { message: "Unable to set the new password" } });
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
