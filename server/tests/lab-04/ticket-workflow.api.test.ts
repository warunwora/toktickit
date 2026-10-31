import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { formatTicketNumber } from "../../src/lib/ticket-number.js";
import { STATUS_VALUES, TRANSITIONS, TicketStatusValue } from "../../src/lib/transitions.js";
import { cleanUpSessions, cookie, prepareCookies } from "../helpers/session.js";

// WF-01 … WF-16 — docs/lab-04/tests.md §2.3.

const prisma = getPrisma();
const MARK = `wf${Date.now()}`;
const createdTicketIds: number[] = [];

let staffId = 0;
let otherStaffId = 0;
let adminId = 0;
let requesterId = 0;
let categoryId = 0;
let relatedSystemId = 0;

async function makeTicket(status: TicketStatusValue = "IN_PROGRESS", ownerId: number | null = null) {
  const draft = await prisma.ticket.create({
    data: {
      ticketNumber: `PENDING-${MARK}-${Math.random()}`,
      requesterId,
      ownerId,
      categoryId,
      relatedSystemId,
      summary: `${MARK} workflow ticket`,
      description: `Seeded by the Lab 4 workflow suite (${MARK}).`,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      status,
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
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

/** An action written straight to the table, so the gate is tested on its own. */
async function addAction(
  ticketId: number,
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  followUp: "none" | "open" | "cleared" = "none"
) {
  const action = await prisma.actionTaken.create({
    data: {
      ticketId,
      actionAt: new Date(Date.now() - 30 * 60 * 1000),
      description: `${MARK} ${status} ${followUp}`,
      status,
      result: status === "COMPLETED" ? "Done." : null,
      performedById: staffId,
      assigneeId: staffId,
      followUpRequired: followUp !== "none",
      followUpNote: followUp !== "none" ? "Check again later." : null,
      followUpClearedAt: followUp === "cleared" ? new Date() : null,
      followUpClearedById: followUp === "cleared" ? staffId : null,
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
    select: { id: true, version: true },
  });
  return action;
}

const version = async (id: number) =>
  (await prisma.ticket.findUniqueOrThrow({ where: { id }, select: { version: true } })).version;

const patchTicket = (id: number, body: object, userId = staffId) =>
  request(app).patch(`/api/staff/tickets/${id}`).set("Cookie", cookie(userId)).send(body);

const patchOwner = (id: number, body: object, userId = staffId) =>
  request(app).patch(`/api/staff/tickets/${id}/owner`).set("Cookie", cookie(userId)).send(body);

async function resolve(id: number, userId = staffId) {
  return patchTicket(id, { version: await version(id), status: "RESOLVED", resolutionSummary: "Fixed on site." }, userId);
}

const statusOf = async (id: number) =>
  (await prisma.ticket.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

beforeAll(async () => {
  const [staff, admin, requester, category, relatedSystem] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true, role: "IT_STAFF" }, orderBy: { id: "asc" }, take: 2 }),
    prisma.user.findFirstOrThrow({ where: { isActive: true, role: "ADMINISTRATOR" }, orderBy: { id: "asc" } }),
    prisma.user.findFirstOrThrow({
      where: { isActive: true, role: "REQUESTER", mustChangePassword: false },
      orderBy: { id: "asc" },
    }),
    prisma.category.findFirstOrThrow({ where: { isActive: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } }),
  ]);
  [staffId, otherStaffId] = staff.map((user) => user.id);
  adminId = admin.id;
  requesterId = requester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
  await prepareCookies(staffId, otherStaffId, adminId, requesterId);
});

afterAll(async () => {
  await prisma.actionTaken.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await cleanUpSessions();
});

describe("resolution gate", () => {
  // WF-01 / AC-14
  it("refuses Resolved with a Planned action, listing it, and leaves the status", async () => {
    const id = await makeTicket();
    const planned = await addAction(id, "PLANNED");
    await addAction(id, "COMPLETED");

    const res = await resolve(id);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "RESOLUTION_BLOCKED", error: "This ticket still has incomplete Actions Taken." });
    expect(res.body.blockingActions).toEqual([
      { id: planned.id, description: `${MARK} PLANNED none`, status: "PLANNED", reason: "INCOMPLETE" },
    ]);
    expect(await statusOf(id)).toBe("IN_PROGRESS");
  });

  // WF-02 / AC-14
  it("refuses Resolved with an In Progress action", async () => {
    const id = await makeTicket("WAITING_FOR_REQUESTER");
    await addAction(id, "IN_PROGRESS");

    expect((await resolve(id)).status).toBe(409);
    expect(await statusOf(id)).toBe("WAITING_FOR_REQUESTER");
  });

  // WF-03 / AC-15
  it("refuses while a follow-up is open, then resolves once it is cleared", async () => {
    const id = await makeTicket();
    const action = await addAction(id, "COMPLETED", "open");

    const blocked = await resolve(id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.blockingActions[0].reason).toBe("FOLLOW_UP_OPEN");

    const cleared = await request(app)
      .patch(`/api/actions/${action.id}/follow-up`)
      .set("Cookie", cookie(staffId))
      .send({ version: action.version });
    expect(cleared.status).toBe(200);

    const res = await resolve(id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("RESOLVED");
  });

  // WF-04 / AC-16
  it("resolves a legacy ticket with no actions, and one whose actions are all finished", async () => {
    const legacy = await makeTicket("OPEN");
    expect((await resolve(legacy)).status).toBe(200);

    const finished = await makeTicket();
    await addAction(finished, "COMPLETED", "cleared");
    await addAction(finished, "CANCELLED");
    expect((await resolve(finished)).status).toBe(200);
  });

  // WF-05 / AC-14
  it("applies from Reopened too", async () => {
    const id = await makeTicket("REOPENED");
    await addAction(id, "PLANNED");
    expect((await resolve(id)).status).toBe(409);
  });

  it("still requires the resolution summary before the gate (BR-21)", async () => {
    const id = await makeTicket();
    const res = await patchTicket(id, { version: await version(id), status: "RESOLVED" });
    expect(res.status).toBe(400);
    expect(res.body.fields[0].field).toBe("resolutionSummary");
  });
});

describe("stale updates", () => {
  // WF-06 / AC-17
  it("answers the second of two saves from the same version with STALE_UPDATE and writes nothing of it", async () => {
    const id = await makeTicket();
    const seen = await version(id);

    const first = await patchTicket(id, { version: seen, itPriority: "HIGH" });
    const second = await patchTicket(id, { version: seen, itPriority: "LOW", status: "WAITING_FOR_REQUESTER" }, otherStaffId);

    expect(first.status).toBe(200);
    expect(first.body.version).toBe(seen + 1);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("STALE_UPDATE");
    expect(second.body.current).toMatchObject({ id, itPriority: "HIGH", status: "IN_PROGRESS", version: seen + 1 });

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(stored.itPriority).toBe("HIGH");
    expect(stored.status).toBe("IN_PROGRESS");
  });

  // WF-07 / AC-17
  it("refuses an owner change from a stale version", async () => {
    const id = await makeTicket();
    const seen = await version(id);
    expect((await patchOwner(id, { version: seen, ownerId: staffId })).status).toBe(200);

    const stale = await patchOwner(id, { version: seen, ownerId: otherStaffId }, otherStaffId);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("STALE_UPDATE");
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).ownerId).toBe(staffId);
  });

  // WF-08 / AC-17
  it("requires the version on both writes", async () => {
    const id = await makeTicket();
    for (const body of [{ itPriority: "LOW" }, { itPriority: "LOW", version: "3" }, { itPriority: "LOW", version: 0 }]) {
      const res = await patchTicket(id, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.fields).toContainEqual({ field: "version", message: "The version you last saw is required" });
    }
    const owner = await patchOwner(id, { ownerId: staffId });
    expect(owner.status).toBe(400);
    expect(owner.body.fields).toContainEqual({ field: "version", message: "The version you last saw is required" });
  });

  // WF-09 / AC-19
  it("refuses a status change from a version taken before an action was completed", async () => {
    const id = await makeTicket();
    const seenBefore = await version(id);

    const created = await request(app)
      .post(`/api/tickets/${id}/actions`)
      .set("Cookie", cookie(otherStaffId))
      .send({ actionAt: new Date(Date.now() - 60_000).toISOString(), description: "Swapped the toner.", status: "COMPLETED", result: "Prints again." });
    expect(created.status).toBe(201);

    const res = await patchTicket(id, { version: seenBefore, status: "WAITING_FOR_REQUESTER" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STALE_UPDATE");
  });

  it("checks the version before the gate (api-spec.md §4.1)", async () => {
    const id = await makeTicket();
    await addAction(id, "PLANNED");
    const res = await patchTicket(id, { version: 999, status: "RESOLVED", resolutionSummary: "x" });
    expect(res.body.code).toBe("STALE_UPDATE");
  });
});

describe("transition matrix", () => {
  // WF-10 / AC-20
  it("allows every permitted transition with the gate satisfied", async () => {
    for (const from of STATUS_VALUES) {
      for (const to of TRANSITIONS[from]) {
        const id = await makeTicket(from);
        const res = await patchTicket(id, {
          version: await version(id),
          status: to,
          ...(to === "RESOLVED" ? { resolutionSummary: "Done." } : {}),
        });
        expect(res.status, `${from} → ${to}`).toBe(200);
      }
    }
  });

  // WF-11 / AC-20
  it("rejects one forbidden transition from every status, including Closed and Cancelled", async () => {
    for (const from of STATUS_VALUES) {
      const to = STATUS_VALUES.find((s) => s !== from && !TRANSITIONS[from].includes(s))!;
      const id = await makeTicket(from);
      const res = await patchTicket(id, { version: await version(id), status: to, resolutionSummary: "x" });
      expect(res.status, `${from} → ${to}`).toBe(400);
      expect(res.body.code).toBe("INVALID_TRANSITION");
      expect(await statusOf(id)).toBe(from);
    }
  });

  // WF-12 / AC-22
  it("keeps the Requester indication advisory: recorded, status unchanged, gate still applies", async () => {
    const id = await makeTicket("WAITING_FOR_REQUESTER");
    await addAction(id, "IN_PROGRESS");
    const before = await version(id);

    const said = await request(app).post(`/api/tickets/${id}/problem-resolved`).set("Cookie", cookie(requesterId));
    expect(said.status).toBe(200);
    expect(said.body.requesterResolvedAt).not.toBeNull();
    expect(await statusOf(id)).toBe("WAITING_FOR_REQUESTER");
    expect(await version(id)).toBe(before + 1);

    expect((await resolve(id)).status).toBe(409);
  });

  // WF-16 / AC-21
  it("returns the new status, badge data and the incremented version", async () => {
    const id = await makeTicket("NEW");
    const seen = await version(id);
    const res = await patchTicket(id, { version: seen, status: "OPEN", itPriority: "URGENT" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "OPEN", itPriority: "URGENT", requestedPriority: "MEDIUM", version: seen + 1 });
  });

  it("includes the version on both detail reads (api-spec.md §4.3)", async () => {
    const id = await makeTicket();
    const staff = await request(app).get(`/api/staff/tickets/${id}`).set("Cookie", cookie(staffId));
    const own = await request(app).get(`/api/tickets/${id}`).set("Cookie", cookie(requesterId));
    expect(staff.body.version).toBe(1);
    expect(own.body.version).toBe(1);
  });
});

describe("Administrator as IT Staff and Requester refusal", () => {
  // WF-13 / AC-33
  it("lets an Administrator claim, set IT Priority and change status", async () => {
    const id = await makeTicket("NEW");

    expect((await patchOwner(id, { version: await version(id), ownerId: adminId }, adminId)).status).toBe(200);
    expect((await patchTicket(id, { version: await version(id), itPriority: "HIGH" }, adminId)).status).toBe(200);
    const moved = await patchTicket(id, { version: await version(id), status: "IN_PROGRESS" }, adminId);
    expect(moved.status).toBe(200);
    expect(moved.body.owner.id).toBe(adminId);
  });

  // WF-14 / AC-33
  it("assigns to an Administrator and lists Administrators as assignable", async () => {
    const id = await makeTicket();
    expect((await patchOwner(id, { version: await version(id), ownerId: adminId })).status).toBe(200);

    const list = await request(app).get("/api/staff/assignable-users").set("Cookie", cookie(staffId));
    expect(list.body.users).toContainEqual({ id: adminId, name: expect.any(String), role: "ADMINISTRATOR" });
  });

  // WF-15 / AC-03
  it("refuses a Requester on every staff write", async () => {
    const id = await makeTicket();
    const v = await version(id);
    const responses = await Promise.all([
      patchTicket(id, { version: v, itPriority: "LOW" }, requesterId),
      patchOwner(id, { version: v, ownerId: staffId }, requesterId),
      request(app).post(`/api/tickets/${id}/actions`).set("Cookie", cookie(requesterId)).send({ description: "x" }),
    ]);
    expect(responses.map((res) => res.status)).toEqual([403, 403, 403]);
    expect(await version(id)).toBe(v);
  });
});
