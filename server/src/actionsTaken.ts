import type { Express, Response } from "express";
import type { ActionStatus, Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { AuthedRequest, requireAuth, requireRole } from "./session.js";
import { idempotent } from "./idempotency.js";
import {
  ACTION_STATUSES,
  ACTIVE_TICKET_STATUSES,
  allowedActionTransitions,
  isAllowedActionTransition,
  isTerminalActionStatus,
} from "./actionStatus.js";

const MAX_TEXT = 4000;
const requireStaffActions = [requireAuth, requireRole("IT_STAFF", "ADMINISTRATOR")];

const ACTION_INCLUDE = {
  performedBy: { select: { name: true } },
  assignee: { select: { name: true, isActive: true } },
} satisfies Prisma.ActionTakenInclude;

type ActionWithPeople = Prisma.ActionTakenGetPayload<{ include: typeof ACTION_INCLUDE }>;

export function serializeAction(a: ActionWithPeople) {
  const { performedBy, assignee, ...rest } = a;
  return {
    ...rest,
    performedByName: performedBy.name,
    assigneeName: assignee?.name ?? null,
    assigneeActive: assignee ? assignee.isActive : null,
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error: { message: string; code?: string; [k: string]: unknown } }
  ) {
    super(body.error.message);
  }
}

const badRequest = (message: string) => new HttpError(400, { error: { message } });
const conflict = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  new HttpError(409, { error: { message, code, ...extra } });

interface ActionFields {
  description?: string;
  result?: string | null;
  followUpNote?: string | null;
  attachmentNotes?: string | null;
  actionAt?: Date;
  status?: ActionStatus;
  followUpRequired?: boolean;
  assigneeId?: number | null;
}

function optionalText(body: Record<string, unknown>, key: string, out: Record<string, unknown>) {
  if (!(key in body)) return;
  const raw = body[key];
  if (raw === null || raw === undefined) {
    out[key] = null;
    return;
  }
  if (typeof raw !== "string") throw badRequest(`${key} must be a string`);
  const value = raw.trim();
  if (value.length > MAX_TEXT) throw badRequest(`${key} must be ${MAX_TEXT} characters or fewer`);
  out[key] = value === "" ? null : value;
}

// Field-level validation only — rules that depend on the resulting record
// (follow-up note, result to complete) run in validateResultingRecord.
async function parseActionFields(body: Record<string, unknown>, requireDescription: boolean): Promise<ActionFields> {
  const out: Record<string, unknown> = {};

  if (requireDescription || "description" in body) {
    const raw = body.description;
    const description = typeof raw === "string" ? raw.trim() : "";
    if (!description) throw badRequest("description is required");
    if (description.length > MAX_TEXT) throw badRequest(`description must be ${MAX_TEXT} characters or fewer`);
    out.description = description;
  }

  optionalText(body, "result", out);
  optionalText(body, "followUpNote", out);
  optionalText(body, "attachmentNotes", out);

  if ("actionAt" in body && body.actionAt !== undefined) {
    const at = typeof body.actionAt === "string" ? new Date(body.actionAt) : new Date(NaN);
    if (Number.isNaN(at.getTime())) throw badRequest("actionAt must be a valid ISO date-time");
    out.actionAt = at;
  }

  if ("status" in body && body.status !== undefined) {
    if (!ACTION_STATUSES.includes(body.status as ActionStatus)) {
      throw badRequest(`invalid status: '${String(body.status)}'`);
    }
    out.status = body.status;
  }

  if ("followUpRequired" in body && body.followUpRequired !== undefined) {
    if (typeof body.followUpRequired !== "boolean") throw badRequest("followUpRequired must be true or false");
    out.followUpRequired = body.followUpRequired;
  }

  if ("assigneeId" in body && body.assigneeId !== undefined) {
    if (body.assigneeId === null) {
      out.assigneeId = null;
    } else {
      const assigneeId = Number(body.assigneeId);
      if (!Number.isInteger(assigneeId)) throw badRequest("assigneeId must be an integer or null");
      // BR-04 — checked at assignment time only.
      const assignee = await getPrisma().user.findUnique({ where: { id: assigneeId } });
      if (!assignee || !assignee.isActive || (assignee.role !== "IT_STAFF" && assignee.role !== "ADMINISTRATOR")) {
        throw badRequest("assigneeId must be an active IT Staff or Administrator user");
      }
      out.assigneeId = assigneeId;
    }
  }

  return out as ActionFields;
}

// BR-05 and BR-08, applied to the record as it would be after the write.
function validateResultingRecord(record: {
  status: ActionStatus;
  result: string | null;
  followUpRequired: boolean;
  followUpNote: string | null;
}) {
  if (record.followUpRequired && !record.followUpNote) {
    throw badRequest("followUpNote is required when followUpRequired is true");
  }
  if (record.status === "COMPLETED" && !record.result) {
    throw badRequest("result is required to complete an action");
  }
}

// Locks the Ticket row for the rest of the transaction. The status change
// route takes the same lock before its resolution-gate check (BR-15), so an
// action cannot be added between that check and the RESOLVED update.
async function lockActiveTicket(tx: Prisma.TransactionClient, ticketId: number) {
  await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
  const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { status: true } });
  if (!ACTIVE_TICKET_STATUSES.includes(ticket.status)) {
    throw conflict("TICKET_NOT_ACTIVE", `Actions Taken cannot be recorded on a ${ticket.status} ticket. Reopen it first.`);
  }
}

function sendError(res: Response, err: unknown, fallback: string) {
  if (err instanceof HttpError) {
    res.status(err.status).json(err.body);
    return;
  }
  res.status(500).json({ error: { message: fallback } });
}

export function registerActionsTakenRoutes(app: Express) {
  // FR-01 — Requester: own Ticket only (404 otherwise, BR-16 of Lab 3);
  // IT Staff and Administrator: any Ticket.
  app.get("/api/tickets/:id/actions", requireAuth, async (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const ticket = Number.isInteger(id) ? await getPrisma().ticket.findUnique({ where: { id } }) : null;
    if (!ticket || (req.user!.role === "REQUESTER" && ticket.requesterId !== req.user!.id)) {
      res.status(404).json({ error: { message: "Ticket not found" } });
      return;
    }
    try {
      const actions = await getPrisma().actionTaken.findMany({
        where: { ticketId: id },
        include: ACTION_INCLUDE,
        orderBy: [{ actionAt: "asc" }, { id: "asc" }],
      });
      res.status(200).json({ data: actions.map(serializeAction) });
    } catch (err) {
      sendError(res, err, "Unable to load actions");
    }
  });

  app.post("/api/tickets/:id/actions", ...requireStaffActions, idempotent("actions.create"), async (req: AuthedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    const ticket = Number.isInteger(ticketId) ? await getPrisma().ticket.findUnique({ where: { id: ticketId } }) : null;
    if (!ticket) {
      res.status(404).json({ error: { message: "Ticket not found" } });
      return;
    }

    try {
      const fields = await parseActionFields(req.body ?? {}, true);
      if (fields.status === "CANCELLED") throw badRequest("a new action cannot start as CANCELLED");
      const followUpRequired = fields.followUpRequired ?? false;
      const record = {
        status: fields.status ?? "PLANNED",
        result: fields.result ?? null,
        followUpRequired,
        followUpNote: followUpRequired ? fields.followUpNote ?? null : null,
      };
      validateResultingRecord(record);

      const created = await getPrisma().$transaction(async (tx) => {
        await lockActiveTicket(tx, ticketId);
        return tx.actionTaken.create({
          data: {
            ticketId,
            performedById: req.user!.id, // BR-03 — never from the request body
            assigneeId: fields.assigneeId ?? null,
            description: fields.description!,
            attachmentNotes: fields.attachmentNotes ?? null,
            ...(fields.actionAt ? { actionAt: fields.actionAt } : {}),
            ...record,
          },
          include: ACTION_INCLUDE,
        });
      });
      res.status(201).json({ data: serializeAction(created) });
    } catch (err) {
      sendError(res, err, "Unable to create the action");
    }
  });

  app.patch("/api/actions/:id", ...requireStaffActions, async (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await getPrisma().actionTaken.findUnique({ where: { id } }) : null;
    if (!existing) {
      res.status(404).json({ error: { message: "Action not found" } });
      return;
    }

    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (!Number.isInteger(body.version)) throw badRequest("version is required");
      const version = body.version as number;
      const fields = await parseActionFields(body, false);

      const updated = await getPrisma().$transaction(async (tx) => {
        await lockActiveTicket(tx, existing.ticketId);
        const current = await tx.actionTaken.findUniqueOrThrow({ where: { id }, include: ACTION_INCLUDE });

        if (isTerminalActionStatus(current.status)) {
          throw conflict("ACTION_TERMINAL", `A ${current.status} action can no longer be changed.`);
        }
        if (current.version !== version) {
          throw conflict("STALE_UPDATE", "This action was changed by someone else. Reload to see the latest version.", {
            current: serializeAction(current),
          });
        }
        if (fields.status && fields.status !== current.status && !isAllowedActionTransition(current.status, fields.status)) {
          const allowed = allowedActionTransitions(current.status);
          throw conflict(
            "INVALID_ACTION_TRANSITION",
            `Cannot move an action from ${current.status} to ${fields.status}. Allowed: ${allowed.join(", ")}.`
          );
        }

        const followUpRequired = fields.followUpRequired ?? current.followUpRequired;
        const record = {
          status: fields.status ?? current.status,
          result: fields.result !== undefined ? fields.result : current.result,
          followUpRequired,
          followUpNote: followUpRequired
            ? fields.followUpNote !== undefined
              ? fields.followUpNote
              : current.followUpNote
            : null,
        };
        validateResultingRecord(record);

        // BR-20 — the version predicate makes a concurrent write between the
        // read above and this update fail instead of being overwritten.
        const { count } = await tx.actionTaken.updateMany({
          where: { id, version },
          data: {
            ...record,
            ...(fields.description !== undefined ? { description: fields.description } : {}),
            ...(fields.attachmentNotes !== undefined ? { attachmentNotes: fields.attachmentNotes } : {}),
            ...(fields.actionAt ? { actionAt: fields.actionAt } : {}),
            ...(fields.assigneeId !== undefined ? { assigneeId: fields.assigneeId } : {}),
            version: { increment: 1 },
          },
        });
        if (count !== 1) {
          throw conflict("STALE_UPDATE", "This action was changed by someone else. Reload to see the latest version.", {
            current: serializeAction(await tx.actionTaken.findUniqueOrThrow({ where: { id }, include: ACTION_INCLUDE })),
          });
        }
        return tx.actionTaken.findUniqueOrThrow({ where: { id }, include: ACTION_INCLUDE });
      });
      res.status(200).json({ data: serializeAction(updated) });
    } catch (err) {
      sendError(res, err, "Unable to update the action");
    }
  });
}
