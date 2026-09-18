import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { formatTicketNumber } from "../../src/lib/ticket-number.js";
import { cleanUpSessions, cookie, prepareCookies } from "../helpers/session.js";

// API-39 … API-51 — docs/lab-03/tests.md §2.6
// The suite creates its own marked tickets so the assertions are exact and the
// seeded demonstration data is never changed.

const prisma = getPrisma();
const MARK = `queue${Date.now()}`;
const createdTicketIds: number[] = [];

let staffId = 0;
let adminId = 0;
let requesterId = 0;
let otherStaffId = 0;
let categoryA = 0;
let categoryB = 0;
let relatedSystemId = 0;

type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type Status = "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";

async function makeTicket(options: {
  summary: string;
  status?: Status;
  itPriority?: Priority;
  ownerId?: number | null;
  categoryId?: number;
  createdAt?: Date;
}) {
  const draft = await prisma.ticket.create({
    data: {
      ticketNumber: `PENDING-${MARK}-${options.summary}`,
      requesterId,
      ownerId: options.ownerId ?? null,
      categoryId: options.categoryId ?? categoryA,
      relatedSystemId,
      summary: options.summary,
      description: `Seeded by the Lab 3 staff queue suite (${MARK}).`,
      requestedPriority: "MEDIUM",
      itPriority: options.itPriority ?? "MEDIUM",
      status: options.status ?? "NEW",
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    },
    select: { id: true, createdAt: true },
  });

  const ticket = await prisma.ticket.update({
    where: { id: draft.id },
    data: { ticketNumber: formatTicketNumber(draft.createdAt.getFullYear(), draft.id) },
    select: { id: true, ticketNumber: true },
  });

  createdTicketIds.push(ticket.id);
  return ticket;
}

function queue(query: string, userId = staffId) {
  return request(app).get(`/api/staff/tickets${query}`).set("Cookie", cookie(userId));
}

/** Only this suite's own tickets, so counts stay exact next to the seed data. */
function mine(body: { tickets: { summary: string }[] }) {
  return body.tickets.filter((t) => t.summary.startsWith(MARK));
}

beforeAll(async () => {
  const [staff, otherStaff, admin, requester, categories, relatedSystem] = await Promise.all([
    prisma.user.findFirst({ where: { isActive: true, role: "IT_STAFF" }, orderBy: { id: "asc" } }),
    prisma.user.findFirst({ where: { isActive: true, role: "IT_STAFF" }, orderBy: { id: "desc" } }),
    prisma.user.findFirst({ where: { isActive: true, role: "ADMINISTRATOR" }, orderBy: { id: "asc" } }),
    prisma.user.findFirst({
      where: { isActive: true, role: "REQUESTER", mustChangePassword: false },
      orderBy: { id: "asc" },
    }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { id: "asc" }, take: 2 }),
    prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } }),
  ]);

  staffId = staff!.id;
  otherStaffId = otherStaff!.id;
  adminId = admin!.id;
  requesterId = requester!.id;
  categoryA = categories[0].id;
  categoryB = categories[1].id;
  relatedSystemId = relatedSystem!.id;

  await prepareCookies(staffId, adminId, requesterId);

  const base = new Date("2026-04-01T00:00:00.000Z");
  await makeTicket({ summary: `${MARK} vpn drops at night`, status: "NEW", itPriority: "URGENT", createdAt: new Date(base.getTime() + 1000) });
  await makeTicket({ summary: `${MARK} printer jams on duplex`, status: "OPEN", itPriority: "LOW", ownerId: staffId, createdAt: new Date(base.getTime() + 2000) });
  await makeTicket({ summary: `${MARK} mailbox permissions gone`, status: "IN_PROGRESS", itPriority: "HIGH", ownerId: staffId, categoryId: categoryB, createdAt: new Date(base.getTime() + 3000) });
  await makeTicket({ summary: `${MARK} laptop battery drains`, status: "RESOLVED", itPriority: "MEDIUM", ownerId: otherStaffId, createdAt: new Date(base.getTime() + 4000) });
  await makeTicket({ summary: `${MARK} wifi drops in lecture room`, status: "WAITING_FOR_REQUESTER", itPriority: "HIGH", createdAt: new Date(base.getTime() + 5000) });
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await cleanUpSessions();
});

describe("GET /api/staff/tickets", () => {
  // API-39 / AC-25
  it("returns tickets from every requester with the documented fields", async () => {
    const res = await queue(`?search=${MARK}&pageSize=50`);

    expect(res.status).toBe(200);
    expect(mine(res.body)).toHaveLength(5);

    const ticket = mine(res.body)[0];
    expect(Object.keys(ticket).sort()).toEqual(
      [
        "category",
        "createdAt",
        "id",
        "itPriority",
        "owner",
        "requestedPriority",
        "requester",
        "requesterResolvedAt",
        "status",
        "summary",
        "ticketNumber",
        "updatedAt",
      ].sort()
    );
  });

  // API-39 / AC-31
  it("returns a null owner for an unassigned ticket", async () => {
    const res = await queue(`?search=${MARK} vpn`);
    expect(mine(res.body)[0].owner).toBeNull();
  });

  // API-40 / AC-26
  it("searches the ticket number and the summary, case-insensitively", async () => {
    const bySummary = await queue(`?search=${MARK} PRINTER`);
    expect(mine(bySummary.body)).toHaveLength(1);
    expect(mine(bySummary.body)[0].summary).toContain("printer jams");

    const target = mine((await queue(`?search=${MARK}&pageSize=50`)).body)[0] as { ticketNumber: string };
    const byNumber = await queue(`?search=${target.ticketNumber.toLowerCase()}`);
    expect(byNumber.body.tickets.some((t: { ticketNumber: string }) => t.ticketNumber === target.ticketNumber)).toBe(true);
  });

  // API-41 / AC-26
  it("returns an empty page with correct metadata when nothing matches", async () => {
    const res = await queue(`?search=${MARK}-nothing-matches-this`);

    expect(res.status).toBe(200);
    expect(res.body.tickets).toEqual([]);
    expect(res.body).toMatchObject({ page: 1, pageSize: 10, totalItems: 0, totalPages: 1 });
  });

  // API-42 / AC-27
  it("filters by one status and by several statuses", async () => {
    const one = await queue(`?search=${MARK}&status=OPEN`);
    expect(mine(one.body)).toHaveLength(1);

    const two = await queue(`?search=${MARK}&status=OPEN&status=IN_PROGRESS`);
    expect(mine(two.body)).toHaveLength(2);
  });

  // API-43 / AC-27
  it("filters by category and by IT Priority", async () => {
    const byCategory = await queue(`?search=${MARK}&categoryId=${categoryB}`);
    expect(mine(byCategory.body)).toHaveLength(1);

    const byPriority = await queue(`?search=${MARK}&itPriority=HIGH`);
    expect(mine(byPriority.body)).toHaveLength(2);
  });

  // API-44 / AC-27
  it("filters by owner and by unassigned", async () => {
    const byOwner = await queue(`?search=${MARK}&ownerId=${staffId}`);
    expect(mine(byOwner.body)).toHaveLength(2);

    const unassigned = await queue(`?search=${MARK}&ownerId=unassigned`);
    expect(mine(unassigned.body)).toHaveLength(2);
    expect(mine(unassigned.body).every((t: { owner: unknown }) => t.owner === null)).toBe(true);
  });

  // API-45 / AC-28
  it("sorts by creation time, ticket number and IT Priority severity", async () => {
    const oldest = await queue(`?search=${MARK}&sort=createdAt&order=asc`);
    expect(mine(oldest.body)[0].summary).toContain("vpn drops");

    const newest = await queue(`?search=${MARK}&sort=createdAt&order=desc`);
    expect(mine(newest.body)[0].summary).toContain("wifi drops");

    // Enum order is LOW, MEDIUM, HIGH, URGENT, so desc is most severe first.
    const severe = await queue(`?search=${MARK}&sort=itPriority&order=desc`);
    expect(mine(severe.body)[0].itPriority).toBe("URGENT");
    expect(mine(severe.body).at(-1)!.itPriority).toBe("LOW");

    const numbers = mine((await queue(`?search=${MARK}&sort=ticketNumber&order=asc`)).body).map(
      (t: { ticketNumber: string }) => t.ticketNumber
    );
    expect(numbers).toEqual([...numbers].sort());
  });

  // API-46 / AC-28
  it("falls back to the defaults for an unusable sort, order or page size", async () => {
    const res = await queue(`?search=${MARK}&sort=nonsense&order=sideways&page=x&pageSize=7`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 10 });
    expect(mine(res.body)[0].summary).toContain("wifi drops");
  });

  // API-47 / AC-27
  it("rejects an unusable filter with 400", async () => {
    for (const [name, query] of [
      ["status", "status=ALMOST_DONE"],
      ["itPriority", "itPriority=SOON"],
      ["categoryId", "categoryId=abc"],
      ["ownerId", "ownerId=nobody"],
    ] as const) {
      const res = await queue(`?${query}`);
      expect(res.status).toBe(400);
      expect(res.body.fields[0].field).toBe(name);
    }
  });

  // API-48 / AC-29
  it("paginates with correct metadata and no repeated row", async () => {
    const first = await queue(`?search=${MARK}&pageSize=10&page=1&sort=createdAt&order=asc`);
    expect(first.body).toMatchObject({ page: 1, pageSize: 10 });

    const twoPerPage = await queue(`?search=${MARK}&pageSize=10&page=1`);
    expect(twoPerPage.body.totalItems).toBeGreaterThanOrEqual(5);

    const pageOne = await queue(`?search=${MARK}&pageSize=10&page=1&sort=ticketNumber&order=asc`);
    const pageTwo = await queue(`?search=${MARK}&pageSize=10&page=2&sort=ticketNumber&order=asc`);
    const overlap = pageOne.body.tickets
      .map((t: { id: number }) => t.id)
      .filter((id: number) => pageTwo.body.tickets.some((t: { id: number }) => t.id === id));
    expect(overlap).toEqual([]);
    expect(pageOne.body.totalPages).toBe(Math.max(1, Math.ceil(pageOne.body.totalItems / 10)));
  });

  // API-49 / AC-29
  it("returns an empty list beyond the last page, with metadata intact", async () => {
    const res = await queue(`?search=${MARK}&page=99`);

    expect(res.status).toBe(200);
    expect(res.body.tickets).toEqual([]);
    expect(res.body.totalItems).toBe(5);
  });

  // API-19 / AC-15
  it("refuses a Requester with 403", async () => {
    const res = await queue("", requesterId);
    expect(res.status).toBe(403);
  });

  // API-27 / AC-25
  it("allows an Administrator to read the queue", async () => {
    const res = await queue(`?search=${MARK}`, adminId);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/staff/tickets/:id", () => {
  // API-50 / AC-25
  it("returns one ticket with its attachments, comments and notes", async () => {
    const ticketId = createdTicketIds[0];
    await prisma.publicComment.create({
      data: { ticketId, authorId: staffId, body: "We are looking into the VPN certificate." },
    });
    await prisma.internalNote.create({
      data: { ticketId, authorId: staffId, body: "Certificate profile expired on the gateway." },
    });

    const res = await request(app).get(`/api/staff/tickets/${ticketId}`).set("Cookie", cookie(staffId));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ticketId });
    expect(res.body.description).toBeTruthy();
    expect(res.body.attachments).toEqual([]);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.comments[0].author).toMatchObject({ id: staffId, role: "IT_STAFF" });
  });

  // API-51 / AC-25
  it("answers 404 for a ticket that does not exist", async () => {
    const res = await request(app).get("/api/staff/tickets/99999999").set("Cookie", cookie(staffId));
    expect(res.status).toBe(404);
  });

  // API-19 / AC-15
  it("refuses a Requester with 403", async () => {
    const res = await request(app)
      .get(`/api/staff/tickets/${createdTicketIds[0]}`)
      .set("Cookie", cookie(requesterId));
    expect(res.status).toBe(403);
  });
});
