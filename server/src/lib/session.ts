import { randomBytes } from "node:crypto";
import type { CookieOptions, Response } from "express";
import { getPrisma } from "../prisma.js";

// Server-side sessions — docs/lab-03/api-spec.md §1.1, decision D-01.
// Logout and deactivation must take effect immediately, which a stateless
// token cannot do without adding the very table it was meant to avoid.

export const SESSION_COOKIE = "toktickit_session";

/** 8 hours (BR-07). */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

export async function createSession(userId: number): Promise<string> {
  const id = randomBytes(32).toString("hex");
  await getPrisma().session.create({
    data: { id, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return id;
}

export function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE, sessionId, { ...cookieOptions(), maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

export async function deleteSession(sessionId: string): Promise<void> {
  await getPrisma().session.deleteMany({ where: { id: sessionId } });
}

/** Used when an Administrator sets a new initial password (decision C-06). */
export async function deleteSessionsForUser(userId: number): Promise<void> {
  await getPrisma().session.deleteMany({ where: { userId } });
}
