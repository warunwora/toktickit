import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { formatTicketNumber } from "../../src/lib/ticket-number.js";
import { cleanUpSessions, cookie, prepareCookies } from "../helpers/session.js";

// DS-01 … DS-08, PERF-02, PERF-03 — docs/lab-04/tests.md §2.5.
// The staff dashboard counts the whole service desk, so each number is checked
// against the documented SQL run on the same database, not against a constant.

const prisma = getPrisma();
const MARK = `dst${Date.now()}`;
const createdUserIds: number[] = [];
const createdTicketIds: number[] = [];

const ACTIVE = `('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')`;

let staffId = 0;
let idleStaffId = 0;
let adminId = 0;
let requesterId = 0;

const dashboard = (userId: number) => request(app).get("/api/dashboard/staff").set("Cookie", cookie(userId));

async function count(sql: string, ...params: unknown[]): Promise<number> {
  const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql, ...params);
  return Number(row.n);
}

beforeAll(async () => {
  const [staff, admin, requester, category, relatedSystem] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { isActive: true, role: "IT_STAFF" }, orderBy: { id: "asc" } }),
    prisma.user.findFirstOrThrow({ where: { isActive: true, role: "ADMINISTRATOR" } }),
    prisma.user.findFirstOrThrow({ where: { isActive: true, role: "REQUESTER", mustChangePassword: false } }),
    prisma.category.findFirstOrThrow({ where: { isActive: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } }),
  ]);
  staffId = staff.id;
  adminId = admin.id;
  requesterId = requester.id;

  // An IT Staff member with nothing at all, for the zero case (DS-05).
  const idle = await prisma.user.create({
    data: {
      name: `Idle Staff ${MARK}`,
      email: `idle.${MARK}@toktickit.test`,
      passwordHash: "not-a-real-hash",
      role: "IT_STAFF",
      mustChangePassword: false,
    },
    select: { id: true },
  });
  idleStaffId = idle.id;
  createdUserIds.push(idle.id);

  // Known work for the main staff user: an urgent owned ticket with six open
  // actions (more than the list holds) and one finished action.
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `PENDING-${MARK}`,
      requesterId,
      ownerId: staffId,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary: `${MARK} urgent owned ticket`,
      description: `Seeded by the Lab 4 staff dashboard suite (${MARK}).`,
      requestedPriority: "HIGH",
      itPriority: "URGENT",
      status: "IN_PROGRESS",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    select: { id: true, createdAt: true },
  });
  createdTicketIds.push(ticket.id);
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { ticketNumber: formatTicketNumber(ticket.createdAt.getFullYear(), ticket.id) },
  });
  for (let i = 0; i < 7; i += 1) {
    await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        actionAt: new Date(Date.now() - (60 - i) * 60 * 1000),
        description: `${MARK} step ${i}`,
        status: i === 6 ? "COMPLETED" : i % 2 === 0 ? "PLANNED" : "IN_PROGRESS",
        result: i === 6 ? "Done." : null,
        performedById: staffId,
        assigneeId: staffId,
      },
    });
  }

  await prepareCookies(staffId, idleStaffId, adminId, requesterId);
});

afterAll(async () => {
  await prisma.actionTaken.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await cleanUpSessions();
});

describe("GET /api/dashboard/staff", () => {
  // DS-01 / AC-25
  it("answers Unassigned, Owned by me and Urgent (active) exactly as their SQL", async () => {
    const res = await dashboard(staffId);

    expect(res.status).toBe(200);
    expect(res.body.metrics.unassigned).toBe(
      await count(`SELECT COUNT(*) AS n FROM "Ticket" WHERE "ownerId" IS NULL AND status IN ${ACTIVE}`)
    );
    expect(res.body.metrics.ownedByMe).toBe(
      await count(`SELECT COUNT(*) AS n FROM "Ticket" WHERE "ownerId" = $1 AND status IN ${ACTIVE}`, staffId)
    );
    expect(res.body.metrics.urgentActive).toBe(
      await count(`SELECT COUNT(*) AS n FROM "Ticket" WHERE "itPriority" = 'URGENT' AND status IN ${ACTIVE}`)
    );
    expect(res.body.metrics.urgentActive).toBeGreaterThan(0);
  });

  // DS-02 / AC-25
  it("counts my open actions as SQL does and lists at most five, oldest first, only Planned or In Progress", async () => {
    const res = await dashboard(staffId);
    const sql = await count(
      `SELECT COUNT(*) AS n FROM "ActionTaken" WHERE "assigneeId" = $1 AND status IN ('PLANNED','IN_PROGRESS')`,
      staffId
    );

    expect(res.body.metrics.myOpenActions).toBe(sql);
    expect(sql).toBeGreaterThanOrEqual(6);
    const list = res.body.myOpenActionsList as { status: string; actionAt: string; ticketNumber: string; link: string }[];
    expect(list).toHaveLength(5);
    expect(list.every((a) => a.status === "PLANNED" || a.status === "IN_PROGRESS")).toBe(true);
    expect(list.map((a) => a.actionAt)).toEqual([...list.map((a) => a.actionAt)].sort());
    expect(list[0].ticketNumber).toMatch(/^TKT-/);
    expect(list[0].link).toMatch(/^\/staff\/tickets\/\d+\?tab=actions$/);
  });

  // DS-03 / AC-25
  it("returns all eight statuses and all four IT priorities, each equal to SQL", async () => {
    const res = await dashboard(staffId);
    const statuses = await prisma.$queryRaw<{ status: string; n: bigint }[]>`
      SELECT status::text AS status, COUNT(*) AS n FROM "Ticket" GROUP BY status`;
    const priorities = await prisma.$queryRawUnsafe<{ p: string; n: bigint }[]>(
      `SELECT "itPriority"::text AS p, COUNT(*) AS n FROM "Ticket" WHERE status IN ${ACTIVE} GROUP BY "itPriority"`
    );

    expect(Object.keys(res.body.byStatus).sort()).toEqual(
      ["CANCELLED", "CLOSED", "IN_PROGRESS", "NEW", "OPEN", "REOPENED", "RESOLVED", "WAITING_FOR_REQUESTER"]
    );
    for (const [status, value] of Object.entries(res.body.byStatus)) {
      expect(value, status).toBe(Number(statuses.find((row) => row.status === status)?.n ?? 0));
    }
    expect(Object.keys(res.body.byItPriority).sort()).toEqual(["HIGH", "LOW", "MEDIUM", "URGENT"]);
    for (const [priority, value] of Object.entries(res.body.byItPriority)) {
      expect(value, priority).toBe(Number(priorities.find((row) => row.p === priority)?.n ?? 0));
    }
  });

  it("lists at most five recently updated tickets, newest first", async () => {
    const res = await dashboard(staffId);
    const times = res.body.recentlyUpdated.map((t: { updatedAt: string }) => t.updatedAt);
    expect(times.length).toBeLessThanOrEqual(5);
    expect(times).toEqual([...times].sort().reverse());
  });

  // DS-04 / AC-26
  it("adds user counts for an Administrator and omits the key for IT Staff", async () => {
    const admin = await dashboard(adminId);
    const staff = await dashboard(staffId);
    const rows = await prisma.$queryRaw<{ role: string; isActive: boolean; n: bigint }[]>`
      SELECT role::text AS role, "isActive", COUNT(*) AS n FROM "User" GROUP BY role, "isActive"`;

    expect(admin.status).toBe(200);
    for (const role of ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]) {
      const sql = (isActive: boolean) => Number(rows.find((r) => r.role === role && r.isActive === isActive)?.n ?? 0);
      expect(admin.body.users[role]).toEqual({ active: sql(true), inactive: sql(false), link: `/admin/users?role=${role}` });
    }
    expect(staff.body).not.toHaveProperty("users");
  });

  // DS-05 / AC-27
  it("answers zeros and empty lists for IT Staff with no tickets and no actions", async () => {
    const res = await dashboard(idleStaffId);
    expect(res.status).toBe(200);
    expect(res.body.metrics.ownedByMe).toBe(0);
    expect(res.body.metrics.myOpenActions).toBe(0);
    expect(res.body.myOpenActionsList).toEqual([]);
  });

  // DS-06 / AC-28
  it("drills Unassigned and Owned by me down to queues with the same totals", async () => {
    const res = await dashboard(staffId);
    const follow = (link: string) =>
      request(app)
        .get(link.replace("/staff/queue", "/api/staff/tickets"))
        .set("Cookie", cookie(staffId));

    const unassigned = await follow(res.body.links.unassigned);
    const mine = await follow(res.body.links.ownedByMe);
    const urgent = await follow(res.body.links.urgentActive);

    expect(unassigned.body.totalItems).toBe(res.body.metrics.unassigned);
    expect(mine.body.totalItems).toBe(res.body.metrics.ownedByMe);
    expect(urgent.body.totalItems).toBe(res.body.metrics.urgentActive);
    for (const [priority, link] of Object.entries(res.body.links.byItPriority as Record<string, string>)) {
      expect((await follow(link)).body.totalItems, priority).toBe(res.body.byItPriority[priority]);
    }
  });

  // DS-07 / AC-28
  it("refuses statusGroup with status, and an unknown statusGroup", async () => {
    for (const query of ["statusGroup=active&status=NEW", "statusGroup=open"]) {
      const res = await request(app).get(`/api/staff/tickets?${query}`).set("Cookie", cookie(staffId));
      expect(res.status, query).toBe(400);
      expect(res.body.fields[0].field).toBe("statusGroup");
    }
  });

  // DS-08 / AC-29
  it("is refused to a Requester and needs a session", async () => {
    expect((await dashboard(requesterId)).status).toBe(403);
    expect((await request(app).get("/api/dashboard/staff")).status).toBe(401);
  });

  // PERF-02 / AC-31
  it("answers 20 sequential calls with a p95 under 300 ms", async () => {
    const times: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const start = performance.now();
      expect((await dashboard(adminId)).status).toBe(200);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.ceil(0.95 * times.length) - 1]).toBeLessThan(300);
  });

  // PERF-03 / AC-31
  it("lists the Actions Taken of the busiest ticket with a p95 under 200 ms", async () => {
    const [busiest] = await prisma.$queryRaw<{ ticketId: number }[]>`
      SELECT "ticketId" FROM "ActionTaken" GROUP BY "ticketId" ORDER BY COUNT(*) DESC LIMIT 1`;
    const times: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const start = performance.now();
      const res = await request(app).get(`/api/tickets/${busiest.ticketId}/actions`).set("Cookie", cookie(staffId));
      times.push(performance.now() - start);
      expect(res.status).toBe(200);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.ceil(0.95 * times.length) - 1]).toBeLessThan(200);
  });
});
