import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import path from "path";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { requireActiveRequester, RequesterRequest } from "./requesterAuth.js";
import { nextTicketNumber, withUniqueTicketNumber } from "./ticketNumber.js";
import { deleteFiles, MAX_ACTIVE_ATTACHMENTS, UnsupportedFileTypeError, uploadAttachments, UPLOAD_DIR } from "./attachmentStorage.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());

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

app.get("/api/requesters", async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().requesterUser.findMany({
      where: { isActive: true },
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
  requireActiveRequester,
  uploadAttachments.array("attachments", MAX_ACTIVE_ATTACHMENTS),
  async (req: RequesterRequest, res: Response) => {
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
              data: { ticketNumber, requesterId: req.requesterId!, ...result.data },
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

app.get("/api/tickets", requireActiveRequester, async (req: RequesterRequest, res: Response) => {
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

  const where: Prisma.TicketWhereInput = { requesterId: req.requesterId! };

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
app.get("/api/tickets/:id", requireActiveRequester, async (req: RequesterRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: { message: "Ticket not found" } });
    return;
  }

  try {
    const ticket = await getPrisma().ticket.findUnique({ where: { id } });
    if (!ticket || ticket.requesterId !== req.requesterId) {
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
  requireActiveRequester,
  uploadAttachments.array("attachments", MAX_ACTIVE_ATTACHMENTS),
  async (req: RequesterRequest, res: Response) => {
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
    if (!ticket || ticket.requesterId !== req.requesterId) {
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
app.get("/api/attachments/:id/download", requireActiveRequester, async (req: RequesterRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: { message: "Attachment not found" } });
    return;
  }

  const attachment = await getPrisma().attachment.findUnique({ where: { id }, include: { ticket: true } });
  if (!attachment || attachment.ticket.requesterId !== req.requesterId || attachment.removedAt) {
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
app.delete("/api/attachments/:id", requireActiveRequester, async (req: RequesterRequest, res: Response) => {
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
  if (!attachment || attachment.ticket.requesterId !== req.requesterId || attachment.removedAt) {
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
