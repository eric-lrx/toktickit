import type { NextFunction, Response } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import type { AuthedRequest } from "./session.js";

const MAX_KEY_LENGTH = 200;

// BR-28 — duplicate protection for create routes, behind the client's
// disabled-while-sending buttons. The key is reserved *before* the handler
// runs (a row with responseStatus 0, unique on userId + key), so:
// - a second request with the same key while the first is in flight gets a
//   409 instead of creating a second record (the double click the disabled
//   button missed);
// - a repeat after the first finished gets the stored response replayed;
// - a failed first attempt releases its key, so the user can fix and resend.
// Without the header the request is processed normally (Lab 2/3 clients).
export function idempotent(route: string) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const key = req.get("Idempotency-Key");
    if (!key || !req.user) return next();
    if (key.length > MAX_KEY_LENGTH) {
      res.status(400).json({ error: { message: "Idempotency-Key is too long" } });
      return;
    }
    const userId = req.user.id;
    const prisma = getPrisma();

    try {
      await prisma.idempotencyKey.create({ data: { key, userId, route, responseStatus: 0, responseBody: {} } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
        res.status(500).json({ error: { message: "Unable to process the request" } });
        return;
      }
      const existing = await prisma.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });
      if (!existing || existing.responseStatus === 0 || existing.route !== route) {
        res.status(409).json({
          error: { message: "This request is already being processed.", code: "IDEMPOTENCY_IN_PROGRESS" },
        });
        return;
      }
      res.status(existing.responseStatus).json(existing.responseBody);
      return;
    }

    const send = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      const settle =
        status >= 200 && status < 300
          ? prisma.idempotencyKey.update({
              where: { userId_key: { userId, key } },
              data: { responseStatus: status, responseBody: body as Prisma.InputJsonValue },
            })
          : prisma.idempotencyKey.delete({ where: { userId_key: { userId, key } } });
      settle.catch(() => undefined).finally(() => send(body));
      return res;
    };
    next();
  };
}
