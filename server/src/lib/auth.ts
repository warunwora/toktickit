import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { RoleName } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { SESSION_COOKIE, clearSessionCookie, deleteSession } from "./session.js";

// The ONLY place that answers "who is asking" (replaces the Lab 2
// resolveRequester header helper). Contract: docs/lab-03/api-spec.md §1.2.

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: RoleName;
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function unauthenticated(res: Response): void {
  res.status(401).json({ error: "Authentication required" });
}

/**
 * Loads the session, rejects a missing, unknown, expired or deactivated one.
 * A session belonging to a deactivated user is deleted on sight (BR-10).
 */
export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];

  if (typeof sessionId !== "string" || sessionId.length === 0) {
    unauthenticated(res);
    return;
  }

  try {
    const session = await getPrisma().session.findUnique({
      where: { id: sessionId },
      select: {
        expiresAt: true,
        user: {
          select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true },
        },
      },
    });

    if (!session) {
      clearSessionCookie(res);
      unauthenticated(res);
      return;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await deleteSession(sessionId);
      clearSessionCookie(res);
      unauthenticated(res);
      return;
    }

    if (!session.user.isActive) {
      await deleteSession(sessionId);
      clearSessionCookie(res);
      unauthenticated(res);
      return;
    }

    const { isActive: _isActive, ...user } = session.user;
    req.user = user;
    next();
  } catch {
    res.status(500).json({ error: "Unable to verify your session" });
  }
};

/**
 * Blocks the application while an initial password is still in place (BR-02).
 * Only /api/auth/me, /api/auth/password and /api/auth/logout stay reachable,
 * which is why this is a middleware rather than a check repeated per route
 * (decision C-02).
 */
export const requirePasswordChanged: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.mustChangePassword) {
    res.status(403).json({ error: "Password change required", code: "PASSWORD_CHANGE_REQUIRED" });
    return;
  }
  next();
};

/** Role gate (BR-21). Hiding a control is feedback; this is the authorization. */
export function requireRole(...roles: RoleName[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      unauthenticated(res);
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "You do not have access to this resource" });
      return;
    }
    next();
  };
}

/** Never called before requireAuth, so the cast is safe. */
export function currentUser(req: Request): AuthUser {
  return req.user as AuthUser;
}
