import express, { Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
import { requireActiveRequester, RequesterRequest } from "./requesterAuth.js";
import { nextTicketNumber, withUniqueTicketNumber } from "./ticketNumber.js";

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
// Issue 8 — Create Ticket. Attachments are Issue 11's scope (Attachment
// lifecycle), so this endpoint only accepts the non-file fields for now.
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

app.post("/api/tickets", requireActiveRequester, async (req: RequesterRequest, res: Response) => {
  const result = await validateTicketInput(req.body);
  if ("errors" in result) {
    res.status(400).json({ error: { message: result.errors.join("; ") } });
    return;
  }

  try {
    const year = new Date().getFullYear();
    const ticket = await withUniqueTicketNumber(
      () => nextTicketNumber(year),
      (ticketNumber) =>
        getPrisma().ticket.create({
          data: { ticketNumber, requesterId: req.requesterId!, ...result.data },
        })
    );
    res.status(201).json({ data: ticket });
  } catch {
    res.status(500).json({ error: { message: "Unable to create ticket" } });
  }
});

export default app;
