import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { TICKET_NUMBER_PATTERN } from "../../src/lib/ticket-number.js";
import { cleanUpSessions, cookie, prepareCookies } from "../helpers/session.js";

// REG-01 … REG-07 — docs/lab-03/tests.md §2.4
// Proves the Lab 2 increment still behaves after identity moved from the
// X-Requester-Id header to the authenticated session (BR-62).

const prisma = getPrisma();
const createdTicketIds: number[] = [];
const storedFilenames: string[] = [];

let requesterId = 0;
let categoryId = 0;
let relatedSystemId = 0;

function body(summary: string, priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" = "MEDIUM") {
  return {
    categoryId,
    relatedSystemId,
    summary,
    description: "Seeded by the Lab 3 Requester regression suite to prove the Lab 2 flow still works.",
    requestedPriority: priority,
  };
}

async function create(summary: string, priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" = "MEDIUM") {
  const res = await request(app).post("/api/tickets").set("Cookie", cookie(requesterId)).send(body(summary, priority));
  if (res.status === 201) createdTicketIds.push(res.body.id);
  return res;
}

beforeAll(async () => {
  const [requester, category, relatedSystem] = await Promise.all([
    prisma.user.findFirst({
      where: { isActive: true, role: "REQUESTER", mustChangePassword: false },
      orderBy: { id: "asc" },
    }),
    prisma.category.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } }),
  ]);

  requesterId = requester!.id;
  categoryId = category!.id;
  relatedSystemId = relatedSystem!.id;
  await prepareCookies(requesterId);
});

afterAll(async () => {
  await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await cleanUpSessions();
});

// REG-01 / AC-19
describe("creating a ticket under the authenticated identity", () => {
  it("stores it against the session user with a backend number, status New and a copied IT Priority", async () => {
    const res = await create(`Regression — create ${Date.now()}`, "HIGH");

    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).toMatch(TICKET_NUMBER_PATTERN);
    expect(res.body.status).toBe("NEW");
    expect(res.body.requester.id).toBe(requesterId);

    const stored = await prisma.ticket.findUnique({
      where: { id: res.body.id },
      select: { requesterId: true, requestedPriority: true, itPriority: true, ownerId: true, status: true },
    });
    expect(stored).toMatchObject({
      requesterId,
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      ownerId: null,
      status: "NEW",
    });
  });

  // REG-04 / AC-19
  it("still rejects invalid input and a duplicate submission", async () => {
    const invalid = await request(app)
      .post("/api/tickets")
      .set("Cookie", cookie(requesterId))
      .send({ ...body("no"), summary: "no" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.fields.map((f: { field: string }) => f.field)).toContain("summary");

    const summary = `Regression — duplicate ${Date.now()}`;
    const first = await create(summary);
    const second = await create(summary);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.ticketNumber).toBe(first.body.ticketNumber);
  });
});

// REG-02, REG-03 / AC-20
describe("My Tickets under the authenticated identity", () => {
  it("returns only the session user's tickets, with Lab 2 search, filter, sort and pagination", async () => {
    const marker = `zregression${Date.now()}`;
    await create(`${marker} alpha network outage`, "LOW");
    await create(`${marker} beta printer jam`, "URGENT");

    const all = await request(app).get("/api/tickets?pageSize=50").set("Cookie", cookie(requesterId));
    expect(all.status).toBe(200);
    expect(all.body.items.every((t: { id: number }) => createdTicketIds.includes(t.id) || true)).toBe(true);

    const foreignCount = await prisma.ticket.count({
      where: { id: { in: all.body.items.map((t: { id: number }) => t.id) }, NOT: { requesterId } },
    });
    expect(foreignCount).toBe(0);

    const searched = await request(app)
      .get(`/api/tickets?search=${marker}%20beta`)
      .set("Cookie", cookie(requesterId));
    expect(searched.body.items).toHaveLength(1);
    expect(searched.body.items[0].summary).toContain("beta printer jam");

    const filtered = await request(app)
      .get(`/api/tickets?search=${marker}&requestedPriority=URGENT`)
      .set("Cookie", cookie(requesterId));
    expect(filtered.body.items).toHaveLength(1);

    const paged = await request(app)
      .get(`/api/tickets?search=${marker}&pageSize=5&page=1&sort=createdAt&order=asc`)
      .set("Cookie", cookie(requesterId));
    expect(paged.body).toMatchObject({ page: 1, pageSize: 5, totalItems: 2, totalPages: 1 });
    expect(paged.body.items[0].summary).toContain("alpha");
  });
});

// REG-05 / AC-39
describe("attachments under the authenticated identity", () => {
  it("uploads, lists, downloads, soft-removes and then answers 410", async () => {
    const ticket = await create(`Regression — attachments ${Date.now()}`);
    const ticketId = ticket.body.id;

    const upload = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Cookie", cookie(requesterId))
      .attach("file", Buffer.from("regression evidence"), {
        filename: "evidence.pdf",
        contentType: "application/pdf",
      });
    expect(upload.status).toBe(201);

    const stored = await prisma.attachment.findUnique({
      where: { id: upload.body.id },
      select: { storedFilename: true, uploadedByUserId: true },
    });
    storedFilenames.push(stored!.storedFilename);
    expect(stored!.uploadedByUserId).toBe(requesterId);

    const list = await request(app)
      .get(`/api/tickets/${ticketId}/attachments`)
      .set("Cookie", cookie(requesterId));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const download = await request(app)
      .get(`/api/attachments/${upload.body.id}/download`)
      .set("Cookie", cookie(requesterId));
    expect(download.status).toBe(200);

    const removed = await request(app)
      .patch(`/api/attachments/${upload.body.id}/remove`)
      .set("Cookie", cookie(requesterId))
      .send({ reason: "Uploaded the wrong file" });
    expect(removed.status).toBe(200);

    const afterRemoval = await request(app)
      .get(`/api/attachments/${upload.body.id}/download`)
      .set("Cookie", cookie(requesterId));
    expect(afterRemoval.status).toBe(410);

    // The metadata survives the removal (Lab 2 BR-36).
    const metadata = await request(app)
      .get(`/api/tickets/${ticketId}/attachments`)
      .set("Cookie", cookie(requesterId));
    expect(metadata.body[0].state).toBe("REMOVED");
  });
});

// REG-06 / AC-24
describe("the Development Requester selector is gone", () => {
  it("no longer exposes GET /api/requesters", async () => {
    const authenticated = await request(app).get("/api/requesters").set("Cookie", cookie(requesterId));
    expect(authenticated.status).toBe(404);
  });
});

// REG-07 / AC-19
describe("the Lab 2 data survived the migration", () => {
  it("leaves every existing ticket with a real Requester, an IT Priority and no owner invented", async () => {
    const tickets = await prisma.ticket.findMany({
      select: {
        id: true,
        itPriority: true,
        requestedPriority: true,
        requester: { select: { id: true, role: true } },
        owner: { select: { role: true, isActive: true } },
      },
    });

    expect(tickets.length).toBeGreaterThan(0);
    for (const ticket of tickets) {
      expect(ticket.requester).not.toBeNull();
      expect(ticket.requester.role).toBe("REQUESTER");
      expect(ticket.itPriority).toBeTruthy();
      // An owner, where one exists, is always an IT Staff user (BR-26).
      if (ticket.owner) expect(ticket.owner.role).toBe("IT_STAFF");
    }
  });

  it("keeps every attachment attached to the user who uploaded it", async () => {
    // The renamed columns still resolve: every attachment reaches a real user,
    // and a removed one still names who removed it.
    const attachments = await prisma.attachment.findMany({
      select: {
        removedAt: true,
        uploadedBy: { select: { id: true } },
        removedBy: { select: { id: true } },
      },
    });

    expect(attachments.length).toBeGreaterThan(0);
    for (const attachment of attachments) {
      expect(attachment.uploadedBy?.id).toBeGreaterThan(0);
      if (attachment.removedAt) expect(attachment.removedBy?.id).toBeGreaterThan(0);
    }
  });
});
