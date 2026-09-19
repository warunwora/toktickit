import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/lib/password.js";
import { SESSION_COOKIE } from "../../src/lib/session.js";
import { cleanUpSessions, createSessionCookie } from "../helpers/session.js";

// API-01 … API-17 — docs/lab-03/tests.md §2.2
// The suite owns four throwaway accounts, because several cases change a
// password or deactivate an account and must never touch the seeded users.

const prisma = getPrisma();

const PASSWORD = "Kmutt#2026x";
const NEW_PASSWORD = "Kmutt#2026y";
const MARK = "lab3-auth";

const emails = {
  active: `${MARK}-active@tests.toktickit.local`,
  inactive: `${MARK}-inactive@tests.toktickit.local`,
  mustChange: `${MARK}-must-change@tests.toktickit.local`,
  changer: `${MARK}-changer@tests.toktickit.local`,
};

const ids: Record<keyof typeof emails, number> = { active: 0, inactive: 0, mustChange: 0, changer: 0 };

function sessionIdFrom(res: request.Response): string | null {
  const raw = res.headers["set-cookie"];
  const header = Array.isArray(raw) ? raw.find((c) => c.startsWith(`${SESSION_COOKIE}=`)) : undefined;
  if (!header) return null;
  const value = header.split(";")[0].split("=")[1];
  return value.length > 0 ? value : null;
}

function cookieFrom(res: request.Response): string {
  return `${SESSION_COOKIE}=${sessionIdFrom(res)}`;
}

function login(email: string, password: string) {
  return request(app).post("/api/auth/login").send({ email, password });
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  const rows: [keyof typeof emails, boolean, boolean][] = [
    ["active", true, false],
    ["inactive", false, false],
    ["mustChange", true, true],
    ["changer", true, false],
  ];

  for (const [key, isActive, mustChangePassword] of rows) {
    const user = await prisma.user.upsert({
      where: { email: emails[key] },
      update: { passwordHash, isActive, mustChangePassword, role: "REQUESTER" },
      create: {
        name: `Lab 3 auth ${key}`,
        email: emails[key],
        passwordHash,
        role: "REQUESTER",
        isActive,
        mustChangePassword,
      },
      select: { id: true },
    });
    ids[key] = user.id;
  }
});

afterAll(async () => {
  await cleanUpSessions();
  await prisma.session.deleteMany({ where: { userId: { in: Object.values(ids) } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
});

describe("POST /api/auth/login", () => {
  // API-01 / AC-01
  it("signs in an active user and returns the safe identity with a session cookie", async () => {
    const res = await login(emails.active, PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: ids.active,
      email: emails.active,
      role: "REQUESTER",
      mustChangePassword: false,
    });
    expect(sessionIdFrom(res)).toBeTruthy();

    const cookieHeader = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith(`${SESSION_COOKIE}=`)
    )!;
    expect(cookieHeader).toMatch(/HttpOnly/i);
    expect(cookieHeader).toMatch(/SameSite=Lax/i);

    const stored = await prisma.session.findUnique({ where: { id: sessionIdFrom(res)! } });
    expect(stored?.userId).toBe(ids.active);
    expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  // API-05 / AC-01
  it("never returns password material", async () => {
    const res = await login(emails.active, PASSWORD);

    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });

  it("records the login time", async () => {
    await login(emails.active, PASSWORD);
    const user = await prisma.user.findUnique({ where: { id: ids.active }, select: { lastLoginAt: true } });
    expect(user?.lastLoginAt).toBeInstanceOf(Date);
  });

  it("accepts the email address in any letter case and with surrounding spaces", async () => {
    const res = await login(`  ${emails.active.toUpperCase()} `, PASSWORD);
    expect(res.status).toBe(200);
  });

  // API-02, API-03 / AC-03, AC-04 — the two answers must be indistinguishable
  it("answers a wrong password and an unknown email identically", async () => {
    const wrongPassword = await login(emails.active, "Wrong#2026x");
    const unknownEmail = await login(`${MARK}-nobody@tests.toktickit.local`, PASSWORD);

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error).toBe("Invalid email or password. Please try again.");
    expect(sessionIdFrom(wrongPassword)).toBeNull();
  });

  // API-04 / AC-05
  it("rejects an inactive account with a distinct message and creates no session", async () => {
    const before = await prisma.session.count({ where: { userId: ids.inactive } });
    const res = await login(emails.inactive, PASSWORD);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not active/i);
    expect(await prisma.session.count({ where: { userId: ids.inactive } })).toBe(before);
  });

  it("does not reveal an inactive account to someone guessing the password", async () => {
    const res = await login(emails.inactive, "Wrong#2026x");
    expect(res.status).toBe(401);
  });

  // API-17 / AC-03
  it("validates the request body", async () => {
    const missingBoth = await request(app).post("/api/auth/login").send({});
    const malformed = await login("not-an-email", PASSWORD);

    expect(missingBoth.status).toBe(400);
    expect(missingBoth.body.fields.map((f: { field: string }) => f.field).sort()).toEqual(["email", "password"]);
    expect(malformed.status).toBe(400);
    expect(malformed.body.fields[0].field).toBe("email");
  });
});

describe("GET /api/auth/me", () => {
  // API-06 / AC-06
  it("returns the current user for a valid session", async () => {
    const res = await request(app).get("/api/auth/me").set("Cookie", cookieFrom(await login(emails.active, PASSWORD)));

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: ids.active, email: emails.active, role: "REQUESTER" });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  // API-07 / AC-12
  it("returns 401 with no cookie and with an unknown cookie", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE}=nope`)).status
    ).toBe(401);
  });

  // API-09 / AC-08
  it("rejects an expired session", async () => {
    const expired = await createSessionCookie(ids.active, { expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app).get("/api/auth/me").set("Cookie", expired);

    expect(res.status).toBe(401);
    // The dead row is removed rather than left to accumulate.
    expect(await prisma.session.findUnique({ where: { id: expired.split("=")[1] } })).toBeNull();
  });

  // API-10 / AC-11
  it("rejects a session whose user was deactivated while signed in", async () => {
    const sessionCookie = cookieFrom(await login(emails.changer, PASSWORD));
    expect((await request(app).get("/api/auth/me").set("Cookie", sessionCookie)).status).toBe(200);

    await prisma.user.update({ where: { id: ids.changer }, data: { isActive: false } });
    const res = await request(app).get("/api/auth/me").set("Cookie", sessionCookie);
    await prisma.user.update({ where: { id: ids.changer }, data: { isActive: true } });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  // API-08 / AC-07
  it("destroys the session so the same cookie cannot be replayed", async () => {
    const res = await login(emails.active, PASSWORD);
    const sessionId = sessionIdFrom(res)!;
    const sessionCookie = `${SESSION_COOKIE}=${sessionId}`;

    const logout = await request(app).post("/api/auth/logout").set("Cookie", sessionCookie);
    expect(logout.status).toBe(204);
    expect(await prisma.session.findUnique({ where: { id: sessionId } })).toBeNull();

    const replay = await request(app).get("/api/auth/me").set("Cookie", sessionCookie);
    expect(replay.status).toBe(401);
  });

  it("succeeds without a session, so a client can log out defensively", async () => {
    expect((await request(app).post("/api/auth/logout")).status).toBe(204);
  });
});

describe("forced password change (BR-02)", () => {
  // API-11 / AC-02
  it("blocks the application while an initial password is in place", async () => {
    const sessionCookie = cookieFrom(await login(emails.mustChange, PASSWORD));

    const tickets = await request(app).get("/api/tickets").set("Cookie", sessionCookie);
    const categories = await request(app).get("/api/categories").set("Cookie", sessionCookie);

    expect(tickets.status).toBe(403);
    expect(tickets.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect(categories.status).toBe(403);
  });

  // API-12 / AC-02
  it("still allows me, password and logout", async () => {
    const sessionCookie = cookieFrom(await login(emails.mustChange, PASSWORD));

    const me = await request(app).get("/api/auth/me").set("Cookie", sessionCookie);
    expect(me.status).toBe(200);
    expect(me.body.user.mustChangePassword).toBe(true);

    const badChange = await request(app)
      .post("/api/auth/password")
      .set("Cookie", sessionCookie)
      .send({ currentPassword: PASSWORD, newPassword: "weak", confirmPassword: "weak" });
    expect(badChange.status).toBe(400);

    expect((await request(app).post("/api/auth/logout").set("Cookie", sessionCookie)).status).toBe(204);
  });
});

describe("POST /api/auth/password", () => {
  // API-15 / AC-09
  it("rejects a new password that breaks the rules", async () => {
    const sessionCookie = cookieFrom(await login(emails.changer, PASSWORD));
    const res = await request(app)
      .post("/api/auth/password")
      .set("Cookie", sessionCookie)
      .send({ currentPassword: PASSWORD, newPassword: "abcdefgh", confirmPassword: "abcdefgh" });

    expect(res.status).toBe(400);
    expect(res.body.fields.map((f: { field: string }) => f.field)).toContain("newPassword");
    expect((await login(emails.changer, PASSWORD)).status).toBe(200);
  });

  // API-14 / AC-09
  it("rejects a wrong current password and leaves the old one working", async () => {
    const sessionCookie = cookieFrom(await login(emails.changer, PASSWORD));
    const res = await request(app)
      .post("/api/auth/password")
      .set("Cookie", sessionCookie)
      .send({ currentPassword: "Wrong#2026x", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.fields[0].field).toBe("currentPassword");
    expect((await login(emails.changer, PASSWORD)).status).toBe(200);
  });

  it("requires a session", async () => {
    const res = await request(app)
      .post("/api/auth/password")
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
  });

  // API-13, API-16 / AC-10 — this case changes the password, so it runs last
  it("changes the password, clears the flag, keeps the session and invalidates the old password", async () => {
    await prisma.user.update({ where: { id: ids.changer }, data: { mustChangePassword: true } });
    const sessionCookie = cookieFrom(await login(emails.changer, PASSWORD));

    // Blocked before the change …
    expect((await request(app).get("/api/tickets").set("Cookie", sessionCookie)).status).toBe(403);

    const res = await request(app)
      .post("/api/auth/password")
      .set("Cookie", sessionCookie)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(false);

    // … and through immediately afterwards, on the same session (BR-15).
    expect((await request(app).get("/api/tickets").set("Cookie", sessionCookie)).status).toBe(200);

    expect((await login(emails.changer, NEW_PASSWORD)).status).toBe(200);
    expect((await login(emails.changer, PASSWORD)).status).toBe(401);
  });
});
