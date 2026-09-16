import { NextFunction, Request, Response } from "express";
import { getPrisma } from "./prisma.js";

export interface RequesterRequest extends Request {
  requesterId?: number;
}

// BR-06/BR-07 — every requester-scoped route requires X-Dev-Requester-Id and
// validates it against an active Requester. This is a Lab 2 testing
// mechanism, not authentication (BR-03) — replaced by a real session in
// Issue 34. The `role: "REQUESTER"` check below is required as of Lab 3's
// User migration (Issue 32): the table this looks up now also holds IT
// Staff and Administrator rows, so without it, an IT Staff or Administrator
// id passed through this legacy header would be silently treated as a
// Requester, letting them create/see Tickets under that identity.
export async function requireActiveRequester(req: RequesterRequest, res: Response, next: NextFunction) {
  const header = req.header("X-Dev-Requester-Id");
  const id = header ? Number(header) : NaN;
  if (!header || Number.isNaN(id)) {
    res.status(400).json({ error: { message: "X-Dev-Requester-Id header is required" } });
    return;
  }

  const requester = await getPrisma().user.findUnique({ where: { id } });
  if (!requester || !requester.isActive || requester.role !== "REQUESTER") {
    res.status(400).json({ error: { message: "X-Dev-Requester-Id does not match an active Requester" } });
    return;
  }

  req.requesterId = id;
  next();
}
