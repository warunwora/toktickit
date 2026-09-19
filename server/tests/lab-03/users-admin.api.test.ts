import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE } from "../../src/lib/session.js";
import { cleanUpSessions, cookie, createSessionCookie, prepareCookies } from "../helpers/session.js";

// API-64 … API-82 — docs/lab-03/tests.md §2.8.
// Every user this suite touches is one it created, so the seeded demonstration
// accounts are never renamed, demoted or deactivated by a test run.

const prisma = getPrisma();
const MARK = `adm${Date.now()}`;
const createdUserIds: number[] = [];
/** Accounts this suite suspended to test the last-Administrator rule (BR-53). */
const suspendedUserIds = new Set<number>();

const PASSWORD = "Start#2026";
const NEW_PASSWORD = "Reset#2026";

let adminId = 0;
let secondAdminId = 0;

function email(local: string): string {
  return `${local}.${MARK}@toktickit.test`;
}

/** `local` is the email local part, so a test can look the account up again. */
async function makeUser(
  local: string,
  options: {
    name: string;
    role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
    isActive?: boolean;
    password?: string;
  }
): Promise<number> {
  const bcrypt = (await import("bcryptjs")).default;
  const user = await prisma.user.create({
    data: {
      name: options.name,
      email: email(local),
      role: options.role,
      isActive: options.isActive ?? true,
      mustChangePassword: false,
      passwordHash: await bcrypt.hash(options.password ?? PASSWORD, 10),
    },
    select: { id: true },
  });

  createdUserIds.push(user.id);
  return user.id;
}

const list = (query = "", userId = adminId) =>
  request(app).get(`/api/admin/users${query}`).set("Cookie", cookie(userId));

const create = (body: object, userId = adminId) =>
  request(app).post("/api/admin/users").set("Cookie", cookie(userId)).send(body);

const patch = (id: number, body: object, userId = adminId) =>
  request(app).patch(`/api/admin/users/${id}`).set("Cookie", cookie(userId)).send(body);

const setPassword = (id: number, body: object, userId = adminId) =>
  request(app).post(`/api/admin/users/${id}/password`).set("Cookie", cookie(userId)).send(body);

/**
 * Only this suite's own accounts, so counts stay exact next to the seed. The
 * row type stays `any` because the assertions read fields straight off a
 * Supertest JSON body, which has no compile-time shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mine(users: any[]): any[] {
  return users.filter((user) => String(user.email).includes(MARK));
}

beforeAll(async () => {
  adminId = await makeUser("adminone", { name: `Admin One ${MARK}`, role: "ADMINISTRATOR" });
  secondAdminId = await makeUser("admintwo", { name: `Admin Two ${MARK}`, role: "ADMINISTRATOR", isActive: false });
  await makeUser("staffperson", { name: `Staff Person ${MARK}`, role: "IT_STAFF" });
  await makeUser("requesterperson", { name: `Requester Person ${MARK}`, role: "REQUESTER" });

  await prepareCookies(adminId);
});

afterAll(async () => {
  // Restore anything the last-Administrator fixture suspended, even if a test
  // threw before its own finally ran. This suite must leave the seeded
  // demonstration accounts exactly as it found them.
  await prisma.user.updateMany({ where: { id: { in: [...suspendedUserIds] } }, data: { isActive: true } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await cleanUpSessions();
});

describe("GET /api/admin/users", () => {
  // API-64 / AC-40
  it("lists users sorted by name with no password material", async () => {
    const res = await list(`?search=${MARK}`);

    expect(res.status).toBe(200);
    const users = mine(res.body.users);
    expect(users.length).toBeGreaterThanOrEqual(4);

    expect(Object.keys(users[0]).sort()).toEqual(
      ["createdAt", "email", "id", "isActive", "mustChangePassword", "name", "role"].sort()
    );
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

    const names = users.map((user: { name: string }) => user.name);
    expect(names).toEqual([...names].sort());
  });

  // API-65 / AC-41
  it("searches by a name fragment and by an email fragment, case-insensitively", async () => {
    const byName = await list(`?search=STAFF PERSON ${MARK}`);
    expect(mine(byName.body.users).map((u: { name: string }) => u.name)).toEqual([`Staff Person ${MARK}`]);

    const byEmail = await list(`?search=requesterperson.${MARK}`);
    expect(mine(byEmail.body.users).map((u: { role: string }) => u.role)).toEqual(["REQUESTER"]);
  });

  it("returns an empty list for a search that matches nothing", async () => {
    const res = await list(`?search=no-such-person-${MARK}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });

  // API-66 / AC-41
  it("filters by each of the three roles", async () => {
    for (const role of ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]) {
      const res = await list(`?search=${MARK}&role=${role}`);
      expect(res.status).toBe(200);
      const roles = new Set(mine(res.body.users).map((user: { role: string }) => user.role));
      expect([...roles]).toEqual([role]);
    }
  });

  // API-67 / AC-41
  it("rejects an unknown role value", async () => {
    const res = await list(`?search=${MARK}&role=SUPERUSER`);
    expect(res.status).toBe(400);
    expect(res.body.fields[0].field).toBe("role");
  });

  it("is refused to a Requester and to IT Staff", async () => {
    const staffId = await makeUser("gatekeeperstaff", { name: `Gatekeeper Staff ${MARK}`, role: "IT_STAFF" });
    const requesterId = await makeUser("gatekeeperreq", { name: `Gatekeeper Req ${MARK}`, role: "REQUESTER" });
    await prepareCookies(staffId, requesterId);

    expect((await list("", staffId)).status).toBe(403);
    expect((await list("", requesterId)).status).toBe(403);
  });
});

describe("POST /api/admin/users", () => {
  // API-68 / AC-42
  it("creates a user who must change the password at first login", async () => {
    const res = await create({
      name: `Created Person ${MARK}`,
      email: email("createdperson"),
      role: "IT_STAFF",
      isActive: true,
      initialPassword: PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.body.mustChangePassword).toBe(true);
    expect(res.body.role).toBe("IT_STAFF");
    expect(res.body).not.toHaveProperty("passwordHash");
    createdUserIds.push(res.body.id);
  });

  // API-69 / AC-42
  it("lets the created user log in and then forces the password change", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: email("createdperson"), password: PASSWORD });

    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);

    const sessionCookie = (login.headers["set-cookie"] as unknown as string[])
      .find((value) => value.startsWith(SESSION_COOKIE))!
      .split(";")[0];

    // The application is unreachable until a new password is saved (BR-02).
    const blocked = await request(app).get("/api/staff/tickets").set("Cookie", sessionCookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  // API-70 / AC-43
  it("rejects an email already in use, whatever the letter case", async () => {
    const res = await create({
      name: `Duplicate Person ${MARK}`,
      email: email("createdperson").toUpperCase(),
      role: "REQUESTER",
      initialPassword: PASSWORD,
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_IN_USE");
  });

  // API-71 / AC-42
  it("rejects an invalid role, a short name and a weak initial password", async () => {
    const res = await create({ name: "A", email: email("weak"), role: "SUPERUSER", initialPassword: "weak" });

    expect(res.status).toBe(400);
    expect(new Set(res.body.fields.map((f: { field: string }) => f.field))).toEqual(
      new Set(["name", "role", "initialPassword"])
    );

    const stored = await prisma.user.findUnique({ where: { email: email("weak") } });
    expect(stored).toBeNull();
  });
});

describe("PATCH /api/admin/users/:id", () => {
  // API-72 / AC-44
  it("edits name, email, role and activation state", async () => {
    const id = await makeUser("editableperson", { name: `Editable Person ${MARK}`, role: "REQUESTER" });
    const res = await patch(id, {
      name: `Edited Person ${MARK}`,
      email: email("editedperson"),
      role: "IT_STAFF",
      isActive: false,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: `Edited Person ${MARK}`,
      email: email("editedperson"),
      role: "IT_STAFF",
      isActive: false,
    });
  });

  // API-73 / AC-44
  it("leaves the password untouched, so the old one still works", async () => {
    const id = await makeUser("passwordkeeper", { name: `Password Keeper ${MARK}`, role: "REQUESTER" });
    const address = email("passwordkeeper");

    await patch(id, { name: `Password Keeper Renamed ${MARK}` });

    const login = await request(app).post("/api/auth/login").send({ email: address, password: PASSWORD });
    expect(login.status).toBe(200);
  });

  // API-74 / AC-43
  it("rejects an email that another user already has", async () => {
    const id = await makeUser("clashperson", { name: `Clash Person ${MARK}`, role: "REQUESTER" });
    const res = await patch(id, { email: email("staffperson") });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_IN_USE");
  });

  it("accepts an unchanged email on the same user", async () => {
    const id = await makeUser("sameemail", { name: `Same Email ${MARK}`, role: "REQUESTER" });
    const res = await patch(id, { email: email("sameemail") });
    expect(res.status).toBe(200);
  });

  // API-75 / AC-45
  it("refuses an Administrator deactivating their own account", async () => {
    // A second active Administrator makes this purely the self-deactivation
    // rule; with only one left the last-Administrator rule answers instead.
    await prisma.user.update({ where: { id: secondAdminId }, data: { isActive: true } });

    const res = await patch(adminId, { isActive: false });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SELF_DEACTIVATION");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { isActive: true } });
    expect(after.isActive).toBe(true);
  });

  // API-76, API-77 / AC-46
  //
  // Both rules only fire when exactly one active Administrator is left, so the
  // suite suspends every other one for the duration and restores them after.
  async function asTheOnlyAdministrator(body: () => Promise<void>) {
    const others = await prisma.user.findMany({
      where: { role: "ADMINISTRATOR", isActive: true, id: { not: adminId } },
      select: { id: true },
    });
    const otherIds = others.map((admin) => admin.id);
    otherIds.forEach((id) => suspendedUserIds.add(id));

    await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { isActive: false } });
    try {
      await body();
    } finally {
      await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { isActive: true } });
      otherIds.forEach((id) => suspendedUserIds.delete(id));
    }
  }

  it("refuses to deactivate the last active Administrator", async () => {
    await asTheOnlyAdministrator(async () => {
      const res = await patch(adminId, { isActive: false });

      // The last-Administrator rule answers ahead of self-deactivation: the
      // account cannot be deactivated from anywhere, not just from itself.
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("LAST_ADMINISTRATOR");

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: adminId },
        select: { isActive: true },
      });
      expect(after.isActive).toBe(true);
    });
  });

  it("refuses to change the role of the last active Administrator", async () => {
    await asTheOnlyAdministrator(async () => {
      const res = await patch(adminId, { role: "IT_STAFF" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("LAST_ADMINISTRATOR");

      const after = await prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { role: true } });
      expect(after.role).toBe("ADMINISTRATOR");
    });
  });

  // API-78 / AC-46
  it("allows both operations once a second active Administrator exists", async () => {
    await prisma.user.update({ where: { id: secondAdminId }, data: { isActive: true } });
    const spare = await makeUser("spareadmin", { name: `Spare Admin ${MARK}`, role: "ADMINISTRATOR" });

    const demote = await patch(spare, { role: "IT_STAFF" });
    expect(demote.status).toBe(200);
    expect(demote.body.role).toBe("IT_STAFF");

    const deactivate = await patch(secondAdminId, { isActive: false });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.isActive).toBe(false);
  });

  it("ends the sessions of a user it deactivates", async () => {
    const id = await makeUser("signedinperson", { name: `Signed In Person ${MARK}`, role: "REQUESTER" });
    const theirCookie = await createSessionCookie(id);

    expect((await request(app).get("/api/auth/me").set("Cookie", theirCookie)).status).toBe(200);

    await patch(id, { isActive: false });

    expect((await request(app).get("/api/auth/me").set("Cookie", theirCookie)).status).toBe(401);
  });

  it("rejects an empty body", async () => {
    const id = await makeUser("emptybody", { name: `Empty Body ${MARK}`, role: "REQUESTER" });
    const res = await patch(id, {});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Nothing to update");
  });
});

describe("POST /api/admin/users/:id/password", () => {
  // API-79 / AC-47
  it("sets a new initial password, rejects the old one and forces a change", async () => {
    const id = await makeUser("resetperson", { name: `Reset Person ${MARK}`, role: "REQUESTER" });
    const address = email("resetperson");

    const res = await setPassword(id, { initialPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);

    const old = await request(app).post("/api/auth/login").send({ email: address, password: PASSWORD });
    expect(old.status).toBe(401);

    const fresh = await request(app).post("/api/auth/login").send({ email: address, password: NEW_PASSWORD });
    expect(fresh.status).toBe(200);
    expect(fresh.body.user.mustChangePassword).toBe(true);
  });

  // API-80 / AC-47
  it("ends that user's existing sessions", async () => {
    const id = await makeUser("sessionperson", { name: `Session Person ${MARK}`, role: "REQUESTER" });
    const theirCookie = await createSessionCookie(id);

    expect((await request(app).get("/api/auth/me").set("Cookie", theirCookie)).status).toBe(200);

    await setPassword(id, { initialPassword: NEW_PASSWORD });

    expect((await request(app).get("/api/auth/me").set("Cookie", theirCookie)).status).toBe(401);
  });

  it("applies the password rules", async () => {
    const id = await makeUser("weakreset", { name: `Weak Reset ${MARK}`, role: "REQUESTER" });
    const res = await setPassword(id, { initialPassword: "weak" });

    expect(res.status).toBe(400);
    expect(res.body.fields[0].field).toBe("initialPassword");
  });
});

describe("Deactivated accounts and unknown ids", () => {
  // API-81 / AC-42
  it("refuses a login from a deactivated account with the not-active message", async () => {
    const id = await makeUser("disabledperson", { name: `Disabled Person ${MARK}`, role: "REQUESTER" });
    await patch(id, { isActive: false });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: email("disabledperson"), password: PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not active/i);
  });

  // API-82 / AC-40
  it("answers 404 for an unknown user on edit and on password set", async () => {
    expect((await patch(99_999_999, { name: "Ghost Person" })).status).toBe(404);
    expect((await setPassword(99_999_999, { initialPassword: NEW_PASSWORD })).status).toBe(404);
  });
});
