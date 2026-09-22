import crypto from "crypto";
import "dotenv/config";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";

// Explicit, not incidental: relying on @prisma/client's own bundled dotenv
// side effect meant this module only saw JWT_SECRET if something imported
// prisma.ts first — true through app.ts's own import order, false the
// moment a test imports session.ts directly (as authorization.api.test.ts
// does, to exercise requireRole without a real business route yet).
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8h (specification.md §11)
export const SESSION_COOKIE = "token";

export interface SessionPayload {
  id: number;
  role: Role;
  mustChangePassword: boolean;
}

interface TokenClaims extends SessionPayload {
  jti: string;
}

export interface AuthedRequest extends Request {
  user?: TokenClaims;
}

// api-spec.md requires that a session, once logged out, can never
// successfully replay ("a subsequent protected request with the old cookie
// returns 401") — a plain stateless JWT can't do that on its own, since
// clearing the cookie only tells the browser to forget it; the signed token
// itself is still valid until it expires. This in-memory jti deny-list is
// the minimal fix: logout revokes only that one token's jti, everything
// else about the JWT stays stateless. A Map (not a Set) so entries can be
// pruned once their token would have expired naturally anyway, bounding
// memory. Sufficient for this lab's single dev-server process; a real
// multi-instance deployment would need a shared store (Redis/DB) instead.
const revokedJti = new Map<string, number>();

function pruneExpiredRevocations() {
  const now = Date.now();
  for (const [jti, expiresAt] of revokedJti) {
    if (expiresAt <= now) revokedJti.delete(jti);
  }
}

export function signSession(payload: SessionPayload): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, JWT_SECRET as string, { expiresIn: TOKEN_TTL_SECONDS });
}

export function revokeSession(req: AuthedRequest) {
  if (req.user?.jti) {
    revokedJti.set(req.user.jti, Date.now() + TOKEN_TTL_SECONDS * 1000);
  }
}

// httpOnly so an XSS payload can't read the token via document.cookie;
// sameSite: 'lax' blocks it on cross-site POSTs (CSRF) while still sending it
// on the same-site top-level navigation Lax requires — localhost:5173 and
// localhost:3000 are same-site for cookie purposes since the port isn't part
// of the site. secure:false is correct only because dev never leaves HTTP;
// this must flip to true before this ever runs behind HTTPS.
export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: false });
}

// Parses the session cookie if present; never blocks the request — routes
// that require a session use requireAuth below. Mounted globally (app.ts) so
// requirePasswordChanged can see req.user on every request without every
// route needing its own JWT parsing.
export function attachSession(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") {
    try {
      const claims = jwt.verify(token, JWT_SECRET as string) as TokenClaims;
      pruneExpiredRevocations();
      if (!revokedJti.has(claims.jti)) {
        req.user = claims;
      }
    } catch {
      // Tampered, expired, or malformed token (BR-14) — treated as no
      // session, not an error; requireAuth below will 401 it.
    }
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: { message: "Authentication required" } });
    return;
  }
  next();
}

// FR-06 — the approved authorization matrix (specification.md), enforced
// server-side regardless of what the frontend renders. Precedence matches
// the rest of the API: no session -> 401, wrong role -> 403.
export function requireRole(...allowedRoles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: { message: "Authentication required" } });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: { message: "Forbidden for this role" } });
      return;
    }
    next();
  };
}

// BR-02/BR-04 (briefing) — every route other than these three is blocked
// while a password change is pending, regardless of role.
const PASSWORD_GATE_EXEMPT_PATHS = new Set<string>([
  "/api/auth/login",
  "/api/auth/me",
  "/api/auth/change-password",
  "/api/auth/logout",
]);

export function requirePasswordChanged(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword && !PASSWORD_GATE_EXEMPT_PATHS.has(req.path)) {
    res.status(403).json({
      error: { message: "Password change required.", code: "PASSWORD_CHANGE_REQUIRED" },
    });
    return;
  }
  next();
}
