import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { TICKET_NUMBER_PATTERN } from "../../src/lib/ticket-number.js";

// API-01 … API-06 — docs/lab-02/tests.md §2.2
// Requires a migrated, seeded database.

const prisma = getPrisma();
const createdTicketIds: number[] = [];

let requesterId = 0;
let inactiveRequesterId = 0;
let categoryId = 0;
let relatedSystemId = 0;

function uniqueSummary(label: string): string {
  return `API test ${label} ${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 120);
}

const DESCRIPTION = "Created by the Lab 2 create-ticket API test suite to verify the documented contract.";

function validBody(summary = uniqueSummary("valid")) {
  return {
    categoryId,
    relatedSystemId,
    summary,
    description: DESCRIPTION,
    requestedPriority: "MEDIUM",
  };
}

async function post(body: unknown, headerId: number | string | null = requesterId) {
  const req = request(app).post("/api/tickets");
  if (headerId !== null) req.set("X-Requester-Id", String(headerId));
  const res = await req.send(body as object);
  if (res.status === 201) createdTicketIds.push(res.body.id);
  return res;
}

beforeAll(async () => {
  const [active, inactive, category, relatedSystem] = await Promise.all([
    prisma.requesterUser.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } }),
    prisma.requesterUser.findFirst({ where: { isActive: false }, orderBy: { id: "asc" } }),
    prisma.category.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } }),
  ]);

  requesterId = active!.id;
  inactiveRequesterId = inactive!.id;
  categoryId = category!.id;
  relatedSystemId = relatedSystem!.id;
});

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
});

describe("POST /api/tickets", () => {
  // API-01 / AC-07, AC-08
  it("creates one ticket, returns 201 with a generated ticket number, and stores the owner", async () => {
    const body = validBody();
    const res = await post(body);

    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).toMatch(TICKET_NUMBER_PATTERN);
    expect(res.body.status).toBe("NEW");
    expect(res.body.requester.id).toBe(requesterId);
    expect(res.body.attachments).toEqual([]);

    const saved = await prisma.ticket.findUnique({ where: { id: res.body.id } });
    expect(saved).not.toBeNull();
    expect(saved!.requesterId).toBe(requesterId);
    expect(saved!.status).toBe("NEW");
    expect(saved!.summary).toBe(body.summary);
  });

  it("trims the submitted text before saving it", async () => {
    const summary = uniqueSummary("trim");
    const res = await post({ ...validBody(summary), summary: `   ${summary}   ` });

    expect(res.status).toBe(201);
    expect(res.body.summary).toBe(summary);
  });

  // API-02 / AC-10, BR-17
  it("rejects invalid fields with 400 and one message per offending field", async () => {
    const res = await post({
      categoryId,
      relatedSystemId,
      summary: "short",
      description: "too short",
      requestedPriority: "CRITICAL",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.fields.map((f: { field: string }) => f.field).sort()).toEqual([
      "description",
      "requestedPriority",
      "summary",
    ]);
  });

  it("saves nothing when validation fails", async () => {
    const summary = uniqueSummary("nosave");
    const res = await post({ ...validBody(summary), description: "too short" });

    expect(res.status).toBe(400);
    expect(await prisma.ticket.count({ where: { summary } })).toBe(0);
  });

  // API-03 / BR-16
  it("rejects an unknown category with a field error", async () => {
    const res = await post({ ...validBody(), categoryId: 99999 });

    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual([{ field: "categoryId", message: "Category is not available" }]);
  });

  // API-04 / AC-13, BR-19
  it("rejects an identical resubmission within the duplicate window with 409", async () => {
    const body = validBody(uniqueSummary("dup"));

    const first = await post(body);
    expect(first.status).toBe(201);

    const second = await post(body);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/duplicate/i);
    expect(second.body.ticketNumber).toBe(first.body.ticketNumber);

    expect(await prisma.ticket.count({ where: { summary: body.summary } })).toBe(1);
  });

  // API-05 / BR-01
  it("gives every ticket a distinct ticket number", async () => {
    const responses = [];
    for (let i = 0; i < 3; i++) {
      responses.push(await post(validBody(uniqueSummary(`unique-${i}`))));
    }

    const numbers = responses.map((r) => r.body.ticketNumber);
    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect(new Set(numbers).size).toBe(3);
    expect(numbers.every((n: string) => TICKET_NUMBER_PATTERN.test(n))).toBe(true);
  });

  // API-06 / api-spec §1.1
  it("rejects a request with no Development Requester header", async () => {
    const summary = uniqueSummary("noheader");
    const res = await post(validBody(summary), null);

    expect(res.status).toBe(400);
    expect(res.body.field).toBe("X-Requester-Id");
    expect(await prisma.ticket.count({ where: { summary } })).toBe(0);
  });

  it("rejects a non-numeric Development Requester header", async () => {
    const res = await post(validBody(), "abc");

    expect(res.status).toBe(400);
    expect(res.body.field).toBe("X-Requester-Id");
  });

  // BR-06 — an inactive requester cannot act, even if its id is guessed
  it("rejects an inactive Development Requester", async () => {
    const summary = uniqueSummary("inactive");
    const res = await post(validBody(summary), inactiveRequesterId);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no longer available/i);
    expect(await prisma.ticket.count({ where: { summary } })).toBe(0);
  });

  // BR-01, BR-02, BR-04 — server-owned fields cannot be set by the client
  it("ignores client-supplied ticket number, status, and requester id", async () => {
    const res = await post({
      ...validBody(),
      ticketNumber: "TKT-1999-000001",
      status: "NEW",
      requesterId: 99999,
    });

    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).not.toBe("TKT-1999-000001");
    expect(res.body.requester.id).toBe(requesterId);
  });
});
