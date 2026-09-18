import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { formatTicketNumber } from "../../src/lib/ticket-number.js";
import { cleanUpSessions, cookie, prepareCookies } from "../helpers/session.js";

// API-18 … API-27 — docs/lab-03/tests.md §2.3
// Endpoints that arrive in later Issues (the staff queue, the staff write
// operations and user administration) add their cases to this file as they land.

const prisma = getPrisma();
const createdTicketIds: number[] = [];

let requesterId = 0;
let otherRequesterId = 0;
let staffId = 0;
let adminId = 0;
let ownedTicketId = 0;
let foreignTicketId = 0;

async function makeTicket(ownerRequesterId: number, summary: string) {
  const [category, relatedSystem] = await Promise.all([
    prisma.category.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } }),
    prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } }),
  ]);

  const draft = await prisma.ticket.create({
    data: {
      ticketNumber: `PENDING-authz-${Date.now()}-${Math.random()}`,
      requesterId: ownerRequesterId,
      categoryId: category!.id,
      relatedSystemId: relatedSystem!.id,
      summary,
      description: "Seeded by the Lab 3 authorization suite to verify ownership and role rules.",
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
  const [requesters, staff, admin] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true, role: "REQUESTER", mustChangePassword: false }, orderBy: { id: "asc" }, take: 2 }),
    prisma.user.findFirst({ where: { isActive: true, role: "IT_STAFF" }, orderBy: { id: "asc" } }),
    prisma.user.findFirst({ where: { isActive: true, role: "ADMINISTRATOR" }, orderBy: { id: "asc" } }),
  ]);

  requesterId = requesters[0].id;
  otherRequesterId = requesters[1].id;
  staffId = staff!.id;
  adminId = admin!.id;
  await prepareCookies(requesterId, otherRequesterId, staffId, adminId);

  ownedTicketId = await makeTicket(requesterId, "Authorization test — my own ticket");
  foreignTicketId = await makeTicket(otherRequesterId, "Authorization test — another requester's ticket");
});

afterAll(async () => {
  await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await cleanUpSessions();
});

// API-18 / AC-12
describe("unauthenticated access", () => {
  const protectedRequests: [string, () => request.Test][] = [
    ["GET /api/auth/me", () => request(app).get("/api/auth/me")],
    ["GET /api/categories", () => request(app).get("/api/categories")],
    ["GET /api/related-systems", () => request(app).get("/api/related-systems")],
    ["GET /api/tickets", () => request(app).get("/api/tickets")],
    ["POST /api/tickets", () => request(app).post("/api/tickets").send({})],
    ["GET /api/tickets/:id", () => request(app).get("/api/tickets/1")],
    ["GET /api/tickets/:id/attachments", () => request(app).get("/api/tickets/1/attachments")],
    ["POST /api/tickets/:id/attachments", () => request(app).post("/api/tickets/1/attachments")],
    ["GET /api/attachments/:id/download", () => request(app).get("/api/attachments/1/download")],
    ["PATCH /api/attachments/:id/remove", () => request(app).patch("/api/attachments/1/remove").send({})],
  ];

  for (const [name, call] of protectedRequests) {
    it(`answers 401 for ${name} with no session`, async () => {
      const res = await call();
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Authentication required" });
    });
  }
});

// AC-15, AC-16 — the Requester endpoints belong to the Requester role
describe("role gates on the Requester endpoints", () => {
  it("refuses IT Staff and Administrators with 403, not 404", async () => {
    for (const id of [staffId, adminId]) {
      const list = await request(app).get("/api/tickets").set("Cookie", cookie(id));
      const detail = await request(app).get(`/api/tickets/${ownedTicketId}`).set("Cookie", cookie(id));
      const create = await request(app).post("/api/tickets").set("Cookie", cookie(id)).send({});

      expect(list.status).toBe(403);
      expect(detail.status).toBe(403);
      expect(create.status).toBe(403);
      expect(list.body).toEqual({ error: "You do not have access to this resource" });
    }
  });

  it("lets IT Staff and Administrators read reference data", async () => {
    for (const id of [staffId, adminId]) {
      expect((await request(app).get("/api/categories").set("Cookie", cookie(id))).status).toBe(200);
    }
  });
});

// API-23 / AC-13
describe("the authenticated identity wins over anything the client sends", () => {
  it("ignores a requesterId in the body when a ticket is created", async () => {
    const [category, relatedSystem] = await Promise.all([
      prisma.category.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } }),
      prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } }),
    ]);

    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", cookie(requesterId))
      .send({
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: `Authorization test — spoofed requester ${Date.now()}`,
        description: "The body claims another requester; the session must win over it.",
        requestedPriority: "LOW",
        requesterId: otherRequesterId,
      });

    expect(res.status).toBe(201);
    createdTicketIds.push(res.body.id);

    const stored = await prisma.ticket.findUnique({ where: { id: res.body.id }, select: { requesterId: true } });
    expect(stored?.requesterId).toBe(requesterId);
  });

  it("ignores the removed X-Requester-Id header when tickets are listed", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .set("Cookie", cookie(requesterId))
      .set("X-Requester-Id", String(otherRequesterId));

    expect(res.status).toBe(200);
    const ids = res.body.items.map((t: { id: number }) => t.id);
    expect(ids).toContain(ownedTicketId);
    expect(ids).not.toContain(foreignTicketId);
  });
});

// API-24, API-25 / AC-17
describe("ownership violations are indistinguishable from missing rows (BR-22)", () => {
  it("answers another requester's ticket exactly like a ticket that does not exist", async () => {
    const foreign = await request(app).get(`/api/tickets/${foreignTicketId}`).set("Cookie", cookie(requesterId));
    const missing = await request(app).get("/api/tickets/99999999").set("Cookie", cookie(requesterId));

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it("answers another requester's attachment metadata the same way", async () => {
    const foreign = await request(app)
      .get(`/api/tickets/${foreignTicketId}/attachments`)
      .set("Cookie", cookie(requesterId));
    const missing = await request(app).get("/api/tickets/99999999/attachments").set("Cookie", cookie(requesterId));

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });
});
