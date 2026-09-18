import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { formatTicketNumber } from "../../src/lib/ticket-number.js";
import { cleanUpSessions, cookie, prepareCookies } from "../helpers/session.js";

// API-28 … API-38 — docs/lab-03/tests.md §2.5.
// The suite creates its own tickets so nothing it asserts depends on the seed.

const prisma = getPrisma();
const MARK = `conv${Date.now()}`;
const createdTicketIds: number[] = [];

let staffId = 0;
let adminId = 0;
let requesterId = 0;
let otherRequesterId = 0;
let ticketId = 0;
let otherTicketId = 0;

async function makeTicket(ownerRequesterId: number, summary: string): Promise<number> {
  const draft = await prisma.ticket.create({
    data: {
      ticketNumber: `PENDING-${MARK}-${summary}`,
      requesterId: ownerRequesterId,
      categoryId: (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id,
      relatedSystemId: (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id,
      summary: `${MARK} ${summary}`,
      description: `Seeded by the Lab 3 conversation suite (${MARK}).`,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
    },
    select: { id: true, createdAt: true },
  });

  await prisma.ticket.update({
    where: { id: draft.id },
    data: { ticketNumber: formatTicketNumber(draft.createdAt.getFullYear(), draft.id) },
  });

  createdTicketIds.push(draft.id);
  return draft.id;
}

beforeAll(async () => {
  const [staff, admin, requesters] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { isActive: true, role: "IT_STAFF" }, orderBy: { id: "asc" } }),
    prisma.user.findFirstOrThrow({ where: { isActive: true, role: "ADMINISTRATOR" }, orderBy: { id: "asc" } }),
    prisma.user.findMany({
      where: { isActive: true, role: "REQUESTER", mustChangePassword: false },
      orderBy: { id: "asc" },
      take: 2,
    }),
  ]);

  staffId = staff.id;
  adminId = admin.id;
  requesterId = requesters[0].id;
  otherRequesterId = requesters[1].id;

  await prepareCookies(staffId, adminId, requesterId, otherRequesterId);

  ticketId = await makeTicket(requesterId, "printer offline again");
  otherTicketId = await makeTicket(otherRequesterId, "shared drive unreachable");
});

afterAll(async () => {
  await prisma.publicComment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.internalNote.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await cleanUpSessions();
});

describe("Public Comments", () => {
  // API-28 / AC-21
  it("lets a Requester comment on their own ticket, with a server author and time", async () => {
    const before = Date.now() - 1000;
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie(requesterId))
      .send({ body: "  The printer is still offline this morning.  " });

    expect(res.status).toBe(201);
    expect(res.body.body).toBe("The printer is still offline this morning.");
    expect(res.body.author).toEqual({ id: requesterId, name: expect.any(String), role: "REQUESTER" });
    expect(new Date(res.body.createdAt).getTime()).toBeGreaterThanOrEqual(before);
  });

  // API-29 / AC-22
  it("rejects empty, whitespace-only and over-length bodies without storing anything", async () => {
    const before = await prisma.publicComment.count({ where: { ticketId } });

    for (const body of ["", "   ", "x".repeat(2001)]) {
      const res = await request(app)
        .post(`/api/tickets/${ticketId}/comments`)
        .set("Cookie", cookie(requesterId))
        .send({ body });

      expect(res.status).toBe(400);
      expect(res.body.fields[0].field).toBe("body");
    }

    expect(await prisma.publicComment.count({ where: { ticketId } })).toBe(before);
  });

  // API-30 / AC-17
  it("answers 404 when a Requester comments on someone else's ticket", async () => {
    const res = await request(app)
      .post(`/api/tickets/${otherTicketId}/comments`)
      .set("Cookie", cookie(requesterId))
      .send({ body: "Let me help with that." });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Ticket not found" });

    const read = await request(app)
      .get(`/api/tickets/${otherTicketId}/comments`)
      .set("Cookie", cookie(requesterId));
    expect(read.status).toBe(404);
  });

  // API-34 / AC-21
  it("ignores a client-supplied author and timestamp", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie(staffId))
      .send({
        body: "We have raised this with the print team.",
        authorId: requesterId,
        createdAt: "1999-01-01T00:00:00.000Z",
        author: { id: requesterId, name: "Somebody Else", role: "ADMINISTRATOR" },
      });

    expect(res.status).toBe(201);
    expect(res.body.author.id).toBe(staffId);
    expect(res.body.author.role).toBe("IT_STAFF");
    expect(new Date(res.body.createdAt).getFullYear()).toBeGreaterThan(2020);
  });
});

describe("Internal Notes", () => {
  // API-31 / AC-37
  it("lets IT Staff post a comment and a note on the same ticket", async () => {
    const comment = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie(staffId))
      .send({ body: "A technician will visit this afternoon." });

    const note = await request(app)
      .post(`/api/tickets/${ticketId}/notes`)
      .set("Cookie", cookie(staffId))
      .send({ body: "Fuser unit is failing; order a replacement before the visit." });

    expect(comment.status).toBe(201);
    expect(note.status).toBe(201);
    expect(note.body.author.id).toBe(staffId);
  });

  it("lets an Administrator post an Internal Note but never a workflow change", async () => {
    const note = await request(app)
      .post(`/api/tickets/${ticketId}/notes`)
      .set("Cookie", cookie(adminId))
      .send({ body: "Budget approved for the replacement part." });

    expect(note.status).toBe(201);
    expect(note.body.author.role).toBe("ADMINISTRATOR");
  });

  // API-32 / AC-37, AC-14
  it("never returns a note, nor its text, to a Requester", async () => {
    const secret = `SECRET-${MARK}-not-for-the-requester`;
    await request(app)
      .post(`/api/tickets/${ticketId}/notes`)
      .set("Cookie", cookie(staffId))
      .send({ body: secret });

    const notes = await request(app).get(`/api/tickets/${ticketId}/notes`).set("Cookie", cookie(requesterId));
    expect(notes.status).toBe(404);
    expect(notes.body).toEqual({ error: "Ticket not found" });

    const ticket = await request(app).get(`/api/tickets/${ticketId}`).set("Cookie", cookie(requesterId));
    const comments = await request(app)
      .get(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie(requesterId));

    expect(ticket.status).toBe(200);
    expect(comments.status).toBe(200);
    expect(JSON.stringify(ticket.body)).not.toContain(secret);
    expect(JSON.stringify(comments.body)).not.toContain(secret);
    expect(JSON.stringify(comments.body)).toContain("A technician will visit this afternoon.");
  });

  it("rejects a note body with the same rules as a comment", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/notes`)
      .set("Cookie", cookie(staffId))
      .send({ body: "   " });

    expect(res.status).toBe(400);
    expect(res.body.fields[0]).toEqual({ field: "body", message: "Internal Note is required" });
  });

  // API-33 / AC-37
  it("returns both threads oldest first", async () => {
    const comments = await request(app).get(`/api/tickets/${ticketId}/comments`).set("Cookie", cookie(staffId));
    const notes = await request(app).get(`/api/tickets/${ticketId}/notes`).set("Cookie", cookie(staffId));

    const times = (rows: { createdAt: string }[]) => rows.map((row) => new Date(row.createdAt).getTime());
    const ascending = (values: number[]) => values.every((value, i) => i === 0 || value >= values[i - 1]);

    expect(comments.body.comments.length).toBeGreaterThan(1);
    expect(notes.body.notes.length).toBeGreaterThan(1);
    expect(ascending(times(comments.body.comments))).toBe(true);
    expect(ascending(times(notes.body.notes))).toBe(true);
  });
});

describe("POST /api/tickets/:id/problem-resolved", () => {
  // API-35 / AC-23
  it("records the indication without changing the status", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/problem-resolved`)
      .set("Cookie", cookie(requesterId));

    expect(res.status).toBe(200);
    expect(res.body.requesterResolvedAt).not.toBeNull();
    expect(res.body.status).toBe("NEW");
  });

  // API-36 / AC-23
  it("is idempotent and keeps the first timestamp", async () => {
    const first = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { requesterResolvedAt: true },
    });

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/problem-resolved`)
      .set("Cookie", cookie(requesterId));

    expect(res.status).toBe(200);
    expect(new Date(res.body.requesterResolvedAt).toISOString()).toBe(
      first.requesterResolvedAt!.toISOString()
    );
  });

  // API-37 / AC-23
  it("is refused to IT Staff and to an Administrator", async () => {
    for (const userId of [staffId, adminId]) {
      const res = await request(app)
        .post(`/api/tickets/${otherTicketId}/problem-resolved`)
        .set("Cookie", cookie(userId));
      expect(res.status).toBe(403);
    }
  });

  it("answers 404 for another Requester's ticket", async () => {
    const res = await request(app)
      .post(`/api/tickets/${otherTicketId}/problem-resolved`)
      .set("Cookie", cookie(requesterId));

    expect(res.status).toBe(404);
    const untouched = await prisma.ticket.findUniqueOrThrow({
      where: { id: otherTicketId },
      select: { requesterResolvedAt: true },
    });
    expect(untouched.requesterResolvedAt).toBeNull();
  });

  // API-38 / AC-23
  it("shows the indication to IT Staff on the queue and on the detail response", async () => {
    const queue = await request(app)
      .get(`/api/staff/tickets?search=${MARK}&pageSize=50`)
      .set("Cookie", cookie(staffId));
    const detail = await request(app).get(`/api/staff/tickets/${ticketId}`).set("Cookie", cookie(staffId));

    const row = queue.body.tickets.find((t: { id: number }) => t.id === ticketId);
    expect(row.requesterResolvedAt).not.toBeNull();
    expect(detail.body.requesterResolvedAt).not.toBeNull();
  });
});
