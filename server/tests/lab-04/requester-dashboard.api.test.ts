import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { formatTicketNumber } from "../../src/lib/ticket-number.js";
import type { TicketStatusValue } from "../../src/lib/transitions.js";
import { cleanUpSessions, cookie, prepareCookies } from "../helpers/session.js";

// DR-01 … DR-07, PERF-01 — docs/lab-04/tests.md §2.4.
// Two throwaway Requesters with known tickets, so every number is exact.

const prisma = getPrisma();
const MARK = `drq${Date.now()}`;
const createdUserIds: number[] = [];
const createdTicketIds: number[] = [];
const DAY = 24 * 60 * 60 * 1000;

let meId = 0;
let otherId = 0;
let emptyId = 0;
let staffId = 0;
let adminId = 0;
let categoryId = 0;
let relatedSystemId = 0;

async function makeUser(label: string) {
  const user = await prisma.user.create({
    data: {
      name: `${label} ${MARK}`,
      email: `${label.toLowerCase()}.${MARK}@toktickit.test`,
      passwordHash: "not-a-real-hash",
      role: "REQUESTER",
      mustChangePassword: false,
    },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user.id;
}

async function makeTicket(
  requesterId: number,
  status: TicketStatusValue,
  options: { updatedDaysAgo?: number; resolvedDaysAgo?: number } = {}
) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `PENDING-${MARK}-${Math.random()}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: `${MARK} ${status}`,
      description: `Seeded by the Lab 4 Requester dashboard suite (${MARK}).`,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      status,
    },
    select: { id: true, createdAt: true },
  });
  createdTicketIds.push(ticket.id);
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { ticketNumber: formatTicketNumber(ticket.createdAt.getFullYear(), ticket.id) },
  });
  // @updatedAt would overwrite a Prisma value, so the timestamps go in raw.
  const updatedAt = new Date(Date.now() - (options.updatedDaysAgo ?? 0) * DAY);
  const resolvedAt = options.resolvedDaysAgo === undefined ? null : new Date(Date.now() - options.resolvedDaysAgo * DAY);
  await prisma.$executeRaw`UPDATE "Ticket" SET "updatedAt" = ${updatedAt}, "resolvedAt" = ${resolvedAt} WHERE id = ${ticket.id}`;
  return ticket.id;
}

const dashboard = (userId: number) =>
  request(app).get("/api/dashboard/requester").set("Cookie", cookie(userId));

beforeAll(async () => {
  const [staff, admin, category, relatedSystem] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { isActive: true, role: "IT_STAFF" } }),
    prisma.user.findFirstOrThrow({ where: { isActive: true, role: "ADMINISTRATOR" } }),
    prisma.category.findFirstOrThrow({ where: { isActive: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } }),
  ]);
  staffId = staff.id;
  adminId = admin.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  meId = await makeUser("Me");
  otherId = await makeUser("Other");
  emptyId = await makeUser("Empty");

  // Mine: 3 active (one waiting), 2 resolved (one 40 days ago), 1 closed, 1 cancelled.
  await makeTicket(meId, "NEW", { updatedDaysAgo: 1 });
  await makeTicket(meId, "IN_PROGRESS", { updatedDaysAgo: 3 });
  await makeTicket(meId, "WAITING_FOR_REQUESTER", { updatedDaysAgo: 8 });
  await makeTicket(meId, "RESOLVED", { updatedDaysAgo: 2, resolvedDaysAgo: 2 });
  await makeTicket(meId, "RESOLVED", { updatedDaysAgo: 40, resolvedDaysAgo: 40 });
  await makeTicket(meId, "CLOSED", { updatedDaysAgo: 10, resolvedDaysAgo: 12 });
  await makeTicket(meId, "CANCELLED", { updatedDaysAgo: 0.5 });
  // Someone else's, all recent: must never appear.
  for (const status of ["NEW", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED"] as const) {
    await makeTicket(otherId, status, { updatedDaysAgo: 0, resolvedDaysAgo: 0 });
  }

  await prepareCookies(meId, otherId, emptyId, staffId, adminId);
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await cleanUpSessions();
});

describe("GET /api/dashboard/requester", () => {
  // DR-01 / AC-24
  it("answers each metric exactly as its documented SQL does", async () => {
    const res = await dashboard(meId);
    const [sql] = await prisma.$queryRaw<{ open: bigint; waiting: bigint; resolved: bigint; closed: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')) AS open,
        COUNT(*) FILTER (WHERE status = 'WAITING_FOR_REQUESTER') AS waiting,
        COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved,
        COUNT(*) FILTER (WHERE status = 'CLOSED') AS closed
      FROM "Ticket" WHERE "requesterId" = ${meId}`;

    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual({
      open: Number(sql.open),
      waitingForMe: Number(sql.waiting),
      resolved: Number(sql.resolved),
      closed: Number(sql.closed),
    });
    expect(res.body.metrics).toEqual({ open: 3, waitingForMe: 1, resolved: 2, closed: 1 });
  });

  // DR-02 / AC-23
  it("never counts or lists another Requester's tickets", async () => {
    const res = await dashboard(meId);
    const ids = [...res.body.recentlyUpdated, ...res.body.recentlyResolved].map((t: { id: number }) => t.id);
    const mine = await prisma.ticket.findMany({ where: { requesterId: meId }, select: { id: true } });
    expect(ids.every((id: number) => mine.some((t) => t.id === id))).toBe(true);
  });

  // DR-03 / AC-24
  it("lists updated within 7 days and resolved within 30, newest first", async () => {
    const res = await dashboard(meId);
    const updated = res.body.recentlyUpdated.map((t: { summary: string }) => t.summary.replace(`${MARK} `, ""));
    const resolved = res.body.recentlyResolved.map((t: { summary: string }) => t.summary.replace(`${MARK} `, ""));

    expect(updated).toEqual(["CANCELLED", "NEW", "RESOLVED", "IN_PROGRESS"]);
    expect(resolved).toEqual(["RESOLVED", "CLOSED"]);
  });

  it("caps each list at five", async () => {
    const extra: number[] = [];
    for (let i = 0; i < 4; i += 1) extra.push(await makeTicket(meId, "OPEN", { updatedDaysAgo: 0.1 }));
    const res = await dashboard(meId);
    expect(res.body.recentlyUpdated).toHaveLength(5);
    await prisma.ticket.deleteMany({ where: { id: { in: extra } } });
  });

  // DR-04 / AC-27
  it("answers zeros and empty lists for a Requester with no tickets", async () => {
    const res = await dashboard(emptyId);
    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual({ open: 0, waitingForMe: 0, resolved: 0, closed: 0 });
    expect(res.body.recentlyUpdated).toEqual([]);
    expect(res.body.recentlyResolved).toEqual([]);
  });

  // DR-05 / AC-28
  it("drills Open down to exactly the tickets it counted", async () => {
    const res = await dashboard(meId);
    const list = await request(app)
      .get("/api/tickets?statusGroup=active&pageSize=50")
      .set("Cookie", cookie(meId));

    expect(list.status).toBe(200);
    expect(list.body.totalItems).toBe(res.body.metrics.open);
    expect(res.body.links.open).toBe("/tickets?statusGroup=active");
  });

  it("refuses statusGroup with status, and an unknown group", async () => {
    for (const query of ["statusGroup=active&status=NEW", "statusGroup=everything"]) {
      const res = await request(app).get(`/api/tickets?${query}`).set("Cookie", cookie(meId));
      expect(res.status, query).toBe(400);
      expect(res.body.fields[0].field).toBe("statusGroup");
    }
  });

  // DR-06 / AC-29
  it("is refused to IT Staff and Administrators, and needs a session", async () => {
    expect((await dashboard(staffId)).status).toBe(403);
    expect((await dashboard(adminId)).status).toBe(403);
    expect((await request(app).get("/api/dashboard/requester")).status).toBe(401);
  });

  // DR-07 / AC-30
  it("returns only the documented summary fields", async () => {
    const res = await dashboard(meId);
    expect(Object.keys(res.body).sort()).toEqual(["generatedAt", "links", "metrics", "recentlyResolved", "recentlyUpdated"]);
    expect(Object.keys(res.body.recentlyUpdated[0]).sort()).toEqual(["id", "status", "summary", "ticketNumber", "updatedAt"]);
    expect(Object.keys(res.body.recentlyResolved[0]).sort()).toEqual([
      "id",
      "resolvedAt",
      "status",
      "summary",
      "ticketNumber",
      "updatedAt",
    ]);
  });

  // PERF-01 / AC-31
  it("answers 20 sequential calls with a p95 under 300 ms", async () => {
    const seeded = await prisma.user.findFirstOrThrow({ where: { email: "napat.sri@kmutt.ac.th" } });
    await prepareCookies(seeded.id);
    const times: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const start = performance.now();
      const res = await dashboard(seeded.id);
      times.push(performance.now() - start);
      expect(res.status).toBe(200);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.ceil(0.95 * times.length) - 1]).toBeLessThan(300);
  });
});
