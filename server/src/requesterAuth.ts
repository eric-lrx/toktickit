import { NextFunction, Request, Response } from "express";
import { getPrisma } from "./prisma.js";

export interface RequesterRequest extends Request {
  requesterId?: number;
}

// BR-06/BR-07 — every requester-scoped route requires X-Dev-Requester-Id and
// validates it against an active RequesterUser. This is a Lab 2 testing
// mechanism, not authentication (BR-03).
export async function requireActiveRequester(req: RequesterRequest, res: Response, next: NextFunction) {
  const header = req.header("X-Dev-Requester-Id");
  const id = header ? Number(header) : NaN;
  if (!header || Number.isNaN(id)) {
    res.status(400).json({ error: { message: "X-Dev-Requester-Id header is required" } });
    return;
  }

  const requester = await getPrisma().requesterUser.findUnique({ where: { id } });
  if (!requester || !requester.isActive) {
    res.status(400).json({ error: { message: "X-Dev-Requester-Id does not match an active Requester" } });
    return;
  }

  req.requesterId = id;
  next();
}
