import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { formatTicketNumber } from "../../src/lib/ticket-number.js";

// API-07 … API-14 — docs/lab-02/tests.md §2.2
// Requires a migrated, seeded database.

const prisma = getPrisma();

let ownerId = 0;
let otherId = 0;
let emptyRequesterId = 0;
let categoryA = 0;
let categoryB = 0;
let relatedSystemId = 0;

const MARK = `lab2list${Date.now()}`;
const createdIds: number[] = [];

async function makeTicket(options: {
  requesterId: number;
  summary: string;
  categoryId?: number;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  createdAt?: Date;
}) {
  const draft = await prisma.ticket.create({
    data: {
      ticketNumber: `PENDING-${MARK}-${options.summary}`,
      requesterId: options.requesterId,
      categoryId: options.categoryId ?? categoryA,
      relatedSystemId,
      summary: options.summary,
      description: `Seeded by the my-tickets API test suite (${MARK}).`,
      requestedPriority: options.priority ?? "MEDIUM",
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    },
    select: { id: true, createdAt: true },
  });

  const ticket = await prisma.ticket.update({
    where: { id: draft.id },
    data: { ticketNumber: formatTicketNumber(draft.createdAt.getFullYear(), draft.id) },
    select: { id: true, ticketNumber: true },
  });

  createdIds.push(ticket.id);
  return ticket;
}

function list(query: string, requesterId: number | null = ownerId) {
  const req = request(app).get(`/api/tickets${query}`);
  if (requesterId !== null) req.set("X-Requester-Id", String(requesterId));
  return req;
}

beforeAll(async () => {
  const requesters = await prisma.requesterUser.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    take: 3,
  });
  const categories = await prisma.category.findMany({ where: { isActive: true }, orderBy: { id: "asc" }, take: 2 });
  const relatedSystem = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } });

  ownerId = requesters[0].id;
  otherId = requesters[1].id;
  emptyRequesterId = requesters[2].id;
  categoryA = categories[0].id;
  categoryB = categories[1].id;
  relatedSystemId = relatedSystem!.id;

  // The owner keeps a clean slate so counts in this suite are exact.
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [ownerId, emptyRequesterId] } } });

  const base = new Date("2026-03-01T00:00:00.000Z");
  for (let i = 0; i < 12; i++) {
    await makeTicket({
      requesterId: ownerId,
      summary: `${MARK} owner ticket ${String(i).padStart(2, "0")}`,
      categoryId: i % 2 === 0 ? categoryA : categoryB,
      priority: i % 3 === 0 ? "HIGH" : "LOW",
      createdAt: new Date(base.getTime() + i * 60_000),
    });
  }

  await makeTicket({ requesterId: ownerId, summary: `${MARK} printer keeps jamming badly` });
  await makeTicket({ requesterId: otherId, summary: `${MARK} other requester ticket` });
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: createdIds } } });
});

describe("GET /api/tickets", () => {
  // API-07 / AC-16, BR-14, BR-26
  it("returns only the selected requester's tickets with pagination metadata", async () => {
    const res = await list("?pageSize=50");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 50 });
    expect(res.body.totalItems).toBe(13);
    expect(res.body.items).toHaveLength(13);
    expect(res.body.items.every((t: { summary: string }) => t.summary.includes(MARK))).toBe(true);
    expect(
      res.body.items.some((t: { summary: string }) => t.summary.includes("other requester"))
    ).toBe(false);
    expect(res.body.items[0]).toHaveProperty("attachmentCount", 0);
  });

  it("never returns another requester's ticket even when both exist", async () => {
    const mine = await list("?pageSize=50");
    const theirs = await list("?pageSize=50", otherId);

    const myIds = mine.body.items.map((t: { id: number }) => t.id);
    const theirIds = theirs.body.items.map((t: { id: number }) => t.id);

    expect(myIds.some((id: number) => theirIds.includes(id))).toBe(false);
  });

  // API-08 / AC-17, BR-21
  it("searches summary and ticket number case-insensitively", async () => {
    const bySummary = await list("?search=PRINTER%20KEEPS");
    expect(bySummary.status).toBe(200);
    expect(bySummary.body.totalItems).toBe(1);
    expect(bySummary.body.items[0].summary).toMatch(/printer keeps jamming/i);

    const number = bySummary.body.items[0].ticketNumber as string;
    const byNumber = await list(`?search=${number.toLowerCase()}`);
    expect(byNumber.body.totalItems).toBe(1);
    expect(byNumber.body.items[0].ticketNumber).toBe(number);
  });

  // API-09 / AC-18, BR-22
  it("filters by category, priority, and status, and combines filters with AND", async () => {
    const byCategory = await list(`?categoryId=${categoryB}&pageSize=50`);
    expect(byCategory.body.items.every((t: { category: { id: number } }) => t.category.id === categoryB)).toBe(true);
    expect(byCategory.body.totalItems).toBe(6);

    const byPriority = await list("?requestedPriority=HIGH&pageSize=50");
    expect(byPriority.body.items.every((t: { requestedPriority: string }) => t.requestedPriority === "HIGH")).toBe(true);

    const byStatus = await list("?status=NEW&pageSize=50");
    expect(byStatus.body.totalItems).toBe(13);

    const combined = await list(`?categoryId=${categoryB}&requestedPriority=HIGH&pageSize=50`);
    expect(combined.body.totalItems).toBeLessThan(byCategory.body.totalItems);
    expect(
      combined.body.items.every(
        (t: { category: { id: number }; requestedPriority: string }) =>
          t.category.id === categoryB && t.requestedPriority === "HIGH"
      )
    ).toBe(true);
  });

  // API-10 / AC-19, BR-23
  it("sorts by the requested field and direction, newest first by default", async () => {
    const defaultOrder = await list("?pageSize=50");
    const dates = defaultOrder.body.items.map((t: { createdAt: string }) => new Date(t.createdAt).getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);

    const ascending = await list("?sort=createdAt&order=asc&pageSize=50");
    const ascDates = ascending.body.items.map((t: { createdAt: string }) => new Date(t.createdAt).getTime());
    expect([...ascDates].sort((a, b) => a - b)).toEqual(ascDates);
    expect(ascending.body.items[0].id).not.toBe(defaultOrder.body.items[0].id);

    const byNumber = await list("?sort=ticketNumber&order=asc&pageSize=50");
    const numbers = byNumber.body.items.map((t: { ticketNumber: string }) => t.ticketNumber);
    expect([...numbers].sort()).toEqual(numbers);
  });

  // API-11 / AC-20, BR-24
  it("pages through the result set without repeating items", async () => {
    const first = await list("?page=1&pageSize=5");
    const second = await list("?page=2&pageSize=5");

    expect(first.body.items).toHaveLength(5);
    expect(second.body.items).toHaveLength(5);
    expect(first.body.totalPages).toBe(3);
    expect(second.body.page).toBe(2);

    const firstIds = first.body.items.map((t: { id: number }) => t.id);
    const secondIds = second.body.items.map((t: { id: number }) => t.id);
    expect(firstIds.some((id: number) => secondIds.includes(id))).toBe(false);
  });

  // API-12 / AC-21, BR-25
  it("rejects an invalid page size and an unknown parameter with 400", async () => {
    const badSize = await list("?pageSize=7");
    expect(badSize.status).toBe(400);
    expect(badSize.body.fields[0].field).toBe("pageSize");

    const unknown = await list("?pagesize=10");
    expect(unknown.status).toBe(400);
    expect(unknown.body.fields[0].field).toBe("pagesize");
  });

  // API-13 / BR-27
  it("returns an empty page with correct metadata past the last page", async () => {
    const res = await list("?page=99&pageSize=5");

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.totalItems).toBe(13);
    expect(res.body.page).toBe(99);
  });

  // API-14 / AC-22
  it("returns an empty result set for a requester with no tickets", async () => {
    const res = await list("", emptyRequesterId);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.totalItems).toBe(0);
    expect(res.body.totalPages).toBe(1);
  });

  it("requires a Development Requester header", async () => {
    const res = await list("", null);

    expect(res.status).toBe(400);
    expect(res.body.field).toBe("X-Requester-Id");
  });
});
