import { randomBytes } from "node:crypto";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE, SESSION_TTL_MS } from "../../src/lib/session.js";

// Lab 3 replaced the X-Requester-Id header with a session cookie, so every API
// test needs a real session. Creating the row directly keeps the suites fast
// and lets a test use an identity whose password it does not know.

const cookies = new Map<number, string>();
const createdSessionIds: string[] = [];

export async function createSessionCookie(
  userId: number,
  options: { expiresAt?: Date } = {}
): Promise<string> {
  const id = randomBytes(32).toString("hex");
  await getPrisma().session.create({
    data: { id, userId, expiresAt: options.expiresAt ?? new Date(Date.now() + SESSION_TTL_MS) },
  });
  createdSessionIds.push(id);
  return `${SESSION_COOKIE}=${id}`;
}

/** Creates and caches one session per user id, for use inside a request chain. */
export async function prepareCookies(...userIds: number[]): Promise<void> {
  for (const userId of userIds) {
    if (!cookies.has(userId)) cookies.set(userId, await createSessionCookie(userId));
  }
}

export function cookie(userId: number): string {
  const value = cookies.get(userId);
  if (!value) throw new Error(`No prepared session for user ${userId}; call prepareCookies first`);
  return value;
}

export function forgetCookie(userId: number): void {
  cookies.delete(userId);
}

export async function cleanUpSessions(): Promise<void> {
  if (createdSessionIds.length === 0) return;
  await getPrisma().session.deleteMany({ where: { id: { in: createdSessionIds } } });
  createdSessionIds.length = 0;
  cookies.clear();
}
