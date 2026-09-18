import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import {
  hashPassword,
  validatePasswordChange,
  verifyPassword,
  type FieldError,
} from "../lib/password.js";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  deleteSession,
  setSessionCookie,
} from "../lib/session.js";
import { currentUser, requireAuth, type AuthUser } from "../lib/auth.js";

// Authentication — contract: docs/lab-03/api-spec.md §3.

export const authRouter = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One message for a wrong password and for an unknown email (BR-04). */
const INVALID_CREDENTIALS = "Invalid email or password. Please try again.";

function publicUser(user: AuthUser & { lastLoginAt?: Date | null }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    ...(user.lastLoginAt !== undefined ? { lastLoginAt: user.lastLoginAt } : {}),
  };
}

authRouter.post("/api/auth/login", async (req: Request, res: Response) => {
  const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  const errors: FieldError[] = [];
  if (!rawEmail) errors.push({ field: "email", message: "Enter your email address" });
  else if (!EMAIL_PATTERN.test(rawEmail)) errors.push({ field: "email", message: "Enter a valid email address" });
  if (!password) errors.push({ field: "password", message: "Enter your password" });
  else if (password.length > 128) errors.push({ field: "password", message: "Enter your password" });

  if (errors.length > 0) {
    res.status(400).json({ error: "Validation failed", fields: errors });
    return;
  }

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { email: rawEmail },
      select: {
        id: true, name: true, email: true, role: true,
        isActive: true, mustChangePassword: true, passwordHash: true,
      },
    });

    // The password is verified even when the account is inactive, so the
    // "not active" answer cannot be used to discover accounts (BR-05).
    const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordMatches) {
      res.status(401).json({ error: INVALID_CREDENTIALS });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: "This account is not active. Please contact an administrator." });
      return;
    }

    const sessionId = await createSession(user.id);
    setSessionCookie(res, sessionId);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    res.status(200).json({ user: publicUser(user) });
  } catch {
    res.status(500).json({ error: "Unable to sign in right now. Please try again." });
  }
});

// Logging out without a session is still a success, so a client can log out
// defensively (docs/lab-03/api-spec.md §3.2).
authRouter.post("/api/auth/logout", async (req: Request, res: Response) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  try {
    if (typeof sessionId === "string" && sessionId.length > 0) await deleteSession(sessionId);
    clearSessionCookie(res);
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Unable to sign out" });
  }
});

// Reachable while mustChangePassword is true (BR-02).
authRouter.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await getPrisma().user.findUnique({
      where: { id: currentUser(req).id },
      select: { id: true, name: true, email: true, role: true, mustChangePassword: true, lastLoginAt: true },
    });

    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    res.status(200).json({ user: publicUser(user) });
  } catch {
    res.status(500).json({ error: "Unable to load your account" });
  }
});

authRouter.post("/api/auth/password", requireAuth, async (req: Request, res: Response) => {
  const errors = validatePasswordChange(req.body ?? {});
  if (errors.length > 0) {
    res.status(400).json({ error: "Validation failed", fields: errors });
    return;
  }

  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

  try {
    const prisma = getPrisma();
    const id = currentUser(req).id;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { passwordHash: true },
    });

    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      res.status(400).json({
        error: "Validation failed",
        fields: [{ field: "currentPassword", message: "Your current password is not correct" }],
      });
      return;
    }

    // The current session stays valid, so the user continues straight into the
    // application instead of signing in twice (BR-15).
    const updated = await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
      select: { id: true, name: true, email: true, role: true, mustChangePassword: true, lastLoginAt: true },
    });

    res.status(200).json({ user: publicUser(updated) });
  } catch {
    res.status(500).json({ error: "Unable to change your password" });
  }
});
