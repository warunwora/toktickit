import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { formatTicketNumber } from "../../src/lib/ticket-number.js";

// API-15, API-16, API-17 — docs/lab-02/tests.md §2.2

const prisma = getPrisma();
const createdIds: number[] = [];

let ownerId = 0;
let otherId = 0;
let ownedTicketId = 0;
let foreignTicketId = 0;

async function makeTicket(requesterId: number, summary: string) {
  const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } });
  const relatedSystem = await prisma.relatedSystem.findFirst({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });

  const draft = await prisma.ticket.create({
    data: {
      ticketNumber: `PENDING-detail-${Date.now()}-${Math.random()}`,
      requesterId,
      categoryId: category!.id,
      relatedSystemId: relatedSystem!.id,
      summary,
      description: "Seeded by the ticket-detail API test suite to verify ownership behaviour.",
      requestedPriority: "MEDIUM",
    },
    select: { id: true, createdAt: true },
  });

  const ticket = await prisma.ticket.update({
    where: { id: draft.id },
    data: { ticketNumber: formatTicketNumber(draft.createdAt.getFullYear(), draft.id) },
    select: { id: true },
  });

  createdIds.push(ticket.id);
  return ticket.id;
}

beforeAll(async () => {
  const requesters = await prisma.requesterUser.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    take: 2,
  });
  ownerId = requesters[0].id;
  otherId = requesters[1].id;

  ownedTicketId = await makeTicket(ownerId, "Detail test — owned ticket");
  foreignTicketId = await makeTicket(otherId, "Detail test — another requester's ticket");
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: createdIds } } });
});

describe("GET /api/tickets/:id", () => {
  // API-15 / AC-25
  it("returns the full ticket for its owner", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ownedTicketId}`)
      .set("X-Requester-Id", String(ownerId));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ownedTicketId);
    expect(res.body.summary).toBe("Detail test — owned ticket");
    expect(res.body.status).toBe("NEW");
    expect(res.body.requester.id).toBe(ownerId);
    expect(res.body.category).toHaveProperty("name");
    expect(res.body.relatedSystem).toHaveProperty("name");
    expect(res.body.attachments).toEqual([]);
  });

  // API-16 / AC-26, BR-13
  it("answers 404 for a ticket that belongs to another requester and leaks nothing", async () => {
    const res = await request(app)
      .get(`/api/tickets/${foreignTicketId}`)
      .set("X-Requester-Id", String(ownerId));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Ticket not found" });
  });

  it("answers 404 the same way for a ticket that does not exist", async () => {
    const missing = await request(app).get("/api/tickets/99999999").set("X-Requester-Id", String(ownerId));
    const foreign = await request(app)
      .get(`/api/tickets/${foreignTicketId}`)
      .set("X-Requester-Id", String(ownerId));

    expect(missing.status).toBe(foreign.status);
    expect(missing.body).toEqual(foreign.body);
  });

  // API-17 / api-spec §3.3
  it("rejects a non-integer id with 400", async () => {
    const res = await request(app).get("/api/tickets/abc").set("X-Requester-Id", String(ownerId));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid ticket id" });
  });

  it("requires a Development Requester header", async () => {
    const res = await request(app).get(`/api/tickets/${ownedTicketId}`);

    expect(res.status).toBe(400);
    expect(res.body.field).toBe("X-Requester-Id");
  });
});
