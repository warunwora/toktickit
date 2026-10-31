import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { formatTicketNumber } from "../../src/lib/ticket-number.js";
import type { TicketStatusValue } from "../../src/lib/transitions.js";
import { cleanUpSessions, cookie, prepareCookies } from "../helpers/session.js";

// API-01 … API-20 — docs/lab-04/tests.md §2.2.
// The suite creates its own tickets and users, so nothing it asserts depends on
// the seed and nothing it leaves behind changes the demonstration data.

const prisma = getPrisma();
const MARK = `act${Date.now()}`;
const createdTicketIds: number[] = [];
const createdUserIds: number[] = [];

let staffId = 0;
let otherStaffId = 0;
let thirdStaffId = 0;
let inactiveStaffId = 0;
let adminId = 0;
let requesterId = 0;
let otherRequesterId = 0;
let categoryId = 0;
let relatedSystemId = 0;

async function makeTicket(options: { status?: TicketStatusValue; ownerId?: number | null; requester?: number } = {}) {
  const draft = await prisma.ticket.create({
    data: {
      ticketNumber: `PENDING-${MARK}-${Math.random()}`,
      requesterId: options.requester ?? requesterId,
      ownerId: options.ownerId ?? null,
      categoryId,
      relatedSystemId,
      summary: `${MARK} action ticket`,
      description: `Seeded by the Lab 4 Actions Taken suite (${MARK}).`,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      status: options.status ?? "IN_PROGRESS",
      // An hour in the past, so an action "now" is after the ticket (BR-05).
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

let tick = 0;
/** A distinct, valid Action Date/Time per call, so BR-39 never fires by accident. */
function at(): string {
  tick += 1;
  return new Date(Date.now() - 30 * 60 * 1000 + tick * 1000).toISOString();
}

const list = (ticketId: number, userId = staffId) =>
  request(app).get(`/api/tickets/${ticketId}/actions`).set("Cookie", cookie(userId));

const create = (ticketId: number, body: object, userId = staffId) =>
  request(app).post(`/api/tickets/${ticketId}/actions`).set("Cookie", cookie(userId)).send(body);

const patch = (actionId: number, body: object, userId = staffId) =>
  request(app).patch(`/api/actions/${actionId}`).set("Cookie", cookie(userId)).send(body);

const clearFollowUp = (actionId: number, version: number, userId = staffId) =>
  request(app).patch(`/api/actions/${actionId}/follow-up`).set("Cookie", cookie(userId)).send({ version });

async function newAction(ticketId: number, body: object = {}, userId = staffId) {
  const res = await create(ticketId, { actionAt: at(), description: `${MARK} step ${tick}`, ...body }, userId);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: number; version: number };
}

const countActions = (ticketId: number) => prisma.actionTaken.count({ where: { ticketId } });
const ticketVersion = async (id: number) =>
  prisma.ticket.findUniqueOrThrow({ where: { id }, select: { version: true, updatedAt: true } });

beforeAll(async () => {
  const [staff, admin, requesters, category, relatedSystem] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true, role: "IT_STAFF" }, orderBy: { id: "asc" }, take: 3 }),
    prisma.user.findFirstOrThrow({ where: { isActive: true, role: "ADMINISTRATOR" }, orderBy: { id: "asc" } }),
    prisma.user.findMany({
      where: { isActive: true, role: "REQUESTER", mustChangePassword: false },
      orderBy: { id: "asc" },
      take: 2,
    }),
    prisma.category.findFirstOrThrow({ where: { isActive: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } }),
  ]);

  [staffId, otherStaffId, thirdStaffId] = staff.map((user) => user.id);
  adminId = admin.id;
  [requesterId, otherRequesterId] = requesters.map((user) => user.id);
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  const inactive = await prisma.user.create({
    data: {
      name: `Inactive Staff ${MARK}`,
      email: `inactive.${MARK}@toktickit.test`,
      passwordHash: "not-a-real-hash",
      role: "IT_STAFF",
      isActive: false,
    },
    select: { id: true },
  });
  inactiveStaffId = inactive.id;
  createdUserIds.push(inactive.id);

  await prepareCookies(staffId, otherStaffId, thirdStaffId, adminId, requesterId, otherRequesterId);
});

afterAll(async () => {
  // Actions Taken are Restrict on purpose (BR-14), so they go first.
  await prisma.actionTaken.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await cleanUpSessions();
});

describe("POST /api/tickets/:id/actions", () => {
  // API-01 / AC-01
  it("stores a valid action under the ticket with the session user as performer and the chosen assignee", async () => {
    const ticketId = await makeTicket({ ownerId: staffId });
    const res = await create(ticketId, {
      actionAt: at(),
      description: "  Replaced the print head.  ",
      result: "Test label printed correctly.",
      status: "COMPLETED",
      assigneeId: otherStaffId,
      followUpRequired: true,
      followUpNote: "Order a spare print head.",
      attachmentNotes: "See evidence.png.",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ticketId,
      description: "Replaced the print head.",
      status: "COMPLETED",
      performedBy: { id: staffId },
      assignee: { id: otherStaffId },
      followUpRequired: true,
      followUpNote: "Order a spare print head.",
      followUpClearedAt: null,
      followUpClearedBy: null,
      version: 1,
    });
    expect(res.body.completedAt).not.toBeNull();
    expect(res.body).not.toHaveProperty("performedById");
  });

  // API-02 / AC-01
  it("defaults the assignee to the performer", async () => {
    const ticketId = await makeTicket();
    const action = await newAction(ticketId);
    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } });

    expect(stored.assigneeId).toBe(staffId);
    expect(stored.status).toBe("PLANNED");
  });

  // API-03 / AC-05
  it("ignores a client-supplied performer", async () => {
    const ticketId = await makeTicket();
    const action = await newAction(ticketId, { performedById: otherStaffId, performedBy: { id: otherStaffId } });
    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } });

    expect(stored.performedById).toBe(staffId);
  });

  // API-07 / AC-04
  it("rejects an inactive, Requester or unknown assignee with a field message and stores nothing", async () => {
    const ticketId = await makeTicket();

    for (const assigneeId of [inactiveStaffId, requesterId, 99_999_999, "seven"]) {
      const res = await create(ticketId, { actionAt: at(), description: "Check the cable.", assigneeId });
      expect(res.status, `assigneeId ${assigneeId}`).toBe(400);
      expect(res.body.fields).toEqual([
        { field: "assigneeId", message: "Select an active IT Staff or Administrator user" },
      ]);
    }

    expect(await countActions(ticketId)).toBe(0);
  });

  it("accepts an Administrator as the assignee (BR-04)", async () => {
    const ticketId = await makeTicket();
    const res = await create(ticketId, { actionAt: at(), description: "Approve the purchase.", assigneeId: adminId });

    expect(res.status).toBe(201);
    expect(res.body.assignee).toMatchObject({ id: adminId, role: "ADMINISTRATOR" });
  });

  // API-09 / AC-06
  it("rejects each invalid field with the field named and stores nothing", async () => {
    const ticketId = await makeTicket();
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { createdAt: true } });
    const cases: [object, string][] = [
      [{ actionAt: at(), description: "   " }, "description"],
      [{ actionAt: at(), description: "x".repeat(2001) }, "description"],
      [{ actionAt: new Date(Date.now() + 6 * 60_000).toISOString(), description: "Future." }, "actionAt"],
      [{ actionAt: new Date(ticket.createdAt.getTime() - 1000).toISOString(), description: "Too early." }, "actionAt"],
      [{ description: "No time." }, "actionAt"],
      [{ actionAt: at(), description: "Needs a note.", followUpRequired: true }, "followUpNote"],
      [{ actionAt: at(), description: "Done.", status: "COMPLETED" }, "result"],
      [{ actionAt: at(), description: "Long notes.", attachmentNotes: "a".repeat(501) }, "attachmentNotes"],
      [{ actionAt: at(), description: "Cancelled at birth.", status: "CANCELLED", cancelReason: "Nope" }, "status"],
    ];

    for (const [body, field] of cases) {
      const res = await create(ticketId, body);
      expect(res.status, field).toBe(400);
      expect(res.body.fields.map((f: { field: string }) => f.field), JSON.stringify(body)).toContain(field);
    }

    expect(await countActions(ticketId)).toBe(0);
  });

  // API-19 / AC-36
  it("refuses the same submission twice within 60 seconds and keeps one row", async () => {
    const ticketId = await makeTicket();
    const body = { actionAt: at(), description: "Restarted the print spooler." };

    const first = await create(ticketId, body);
    const second = await create(ticketId, body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ code: "DUPLICATE_SUBMISSION", actionId: first.body.id });
    expect(await countActions(ticketId)).toBe(1);

    // A different person doing the same thing is a different action.
    expect((await create(ticketId, body, otherStaffId)).status).toBe(201);
  });

  it("answers 404 for an unknown ticket", async () => {
    expect((await create(99_999_999, { actionAt: at(), description: "Nowhere." })).status).toBe(404);
  });
});

describe("authorization", () => {
  // API-04 / AC-02
  it("lets an Administrator create and update an action exactly as IT Staff", async () => {
    const ticketId = await makeTicket();
    const created = await create(ticketId, { actionAt: at(), description: "Admin step." }, adminId);

    expect(created.status).toBe(201);
    expect(created.body.performedBy).toMatchObject({ id: adminId, role: "ADMINISTRATOR" });

    const updated = await patch(created.body.id, { version: 1, status: "IN_PROGRESS" }, adminId);
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe("IN_PROGRESS");
  });

  // API-05 / AC-03
  it("refuses a Requester on their own ticket with 403 and stores nothing", async () => {
    const ticketId = await makeTicket();
    const action = await newAction(ticketId);

    const created = await create(ticketId, { actionAt: at(), description: "Requester try." }, requesterId);
    const updated = await patch(action.id, { version: 1, description: "Changed by requester." }, requesterId);
    const cleared = await clearFollowUp(action.id, 1, requesterId);

    expect([created.status, updated.status, cleared.status]).toEqual([403, 403, 403]);
    expect(await countActions(ticketId)).toBe(1);
    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } });
    expect(stored.description).not.toBe("Changed by requester.");
  });

  // API-06 / AC-03
  it("answers 401 without a session on list, create and update", async () => {
    const ticketId = await makeTicket();
    const action = await newAction(ticketId);

    const responses = await Promise.all([
      request(app).get(`/api/tickets/${ticketId}/actions`),
      request(app).post(`/api/tickets/${ticketId}/actions`).send({ actionAt: at(), description: "x" }),
      request(app).patch(`/api/actions/${action.id}`).send({ version: 1, description: "x" }),
      request(app).patch(`/api/actions/${action.id}/follow-up`).send({ version: 1 }),
    ]);

    expect(responses.map((res) => res.status)).toEqual([401, 401, 401, 401]);
  });

  // API-17 / AC-13
  it("shows a Requester their own ticket's actions and answers 404 for anyone else's or a missing one", async () => {
    const own = await makeTicket();
    const foreign = await makeTicket({ requester: otherRequesterId });
    await newAction(own);
    await newAction(foreign);

    const mine = await list(own, requesterId);
    const theirs = await list(foreign, requesterId);
    const missing = await list(99_999_999, requesterId);

    expect(mine.status).toBe(200);
    expect(mine.body.actions).toHaveLength(1);
    expect(theirs.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(theirs.body).toEqual(missing.body);
  });
});

describe("PATCH /api/actions/:id", () => {
  // API-10 / AC-07
  it("moves Planned → In Progress → Completed, setting completedAt and raising the version each time", async () => {
    const ticketId = await makeTicket();
    const action = await newAction(ticketId);

    const started = await patch(action.id, { version: 1, status: "IN_PROGRESS" });
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ status: "IN_PROGRESS", version: 2, completedAt: null });

    const done = await patch(action.id, { version: 2, status: "COMPLETED", result: "Works again." });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: "COMPLETED", version: 3, result: "Works again." });
    expect(done.body.completedAt).not.toBeNull();
  });

  it("edits the content of an open action", async () => {
    const ticketId = await makeTicket();
    const action = await newAction(ticketId);

    const res = await patch(action.id, {
      version: 1,
      description: "Check the cable and the port.",
      followUpRequired: true,
      followUpNote: "Swap the port if it fails again.",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ description: "Check the cable and the port.", followUpRequired: true, version: 2 });
  });

  // API-08 / AC-04
  it("rejects reassigning an open action to an inactive user and keeps the assignee", async () => {
    const ticketId = await makeTicket();
    const action = await newAction(ticketId);

    const res = await patch(action.id, { version: 1, assigneeId: inactiveStaffId });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual([{ field: "assigneeId", message: "Select an active IT Staff or Administrator user" }]);

    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } });
    expect(stored.assigneeId).toBe(staffId);
    expect(stored.version).toBe(1);
  });

  // API-11 / AC-08
  it("rejects Completed without a Result and Cancelled without a reason", async () => {
    const ticketId = await makeTicket();
    const action = await newAction(ticketId);

    const noResult = await patch(action.id, { version: 1, status: "COMPLETED" });
    const noReason = await patch(action.id, { version: 1, status: "CANCELLED" });
    const shortReason = await patch(action.id, { version: 1, status: "CANCELLED", cancelReason: "no" });

    expect(noResult.status).toBe(400);
    expect(noResult.body.fields).toEqual([{ field: "result", message: "Result is required to complete an action" }]);
    expect(noReason.status).toBe(400);
    expect(shortReason.status).toBe(400);
    expect(shortReason.body.fields[0].field).toBe("cancelReason");

    const cancelled = await patch(action.id, { version: 1, status: "CANCELLED", cancelReason: "Duplicate of step 1." });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.cancelledAt).not.toBeNull();
  });

  // API-12 / AC-09
  it("refuses to edit a Completed action or reopen a Cancelled one with ACTION_FINAL", async () => {
    const ticketId = await makeTicket();
    const completed = await newAction(ticketId, { status: "COMPLETED", result: "Done." });
    const cancelled = await newAction(ticketId);
    await patch(cancelled.id, { version: 1, status: "CANCELLED", cancelReason: "Not needed." });

    const edit = await patch(completed.id, { version: 1, description: "Rewritten history." });
    const reopen = await patch(cancelled.id, { version: 2, status: "PLANNED" });

    expect(edit.status).toBe(400);
    expect(edit.body.code).toBe("ACTION_FINAL");
    expect(reopen.status).toBe(400);
    expect(reopen.body.code).toBe("ACTION_FINAL");
  });

  it("rejects a transition outside the matrix with INVALID_ACTION_TRANSITION", async () => {
    const ticketId = await makeTicket();
    const action = await newAction(ticketId, { status: "IN_PROGRESS" });

    const res = await patch(action.id, { version: 1, status: "PLANNED" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ACTION_TRANSITION");
  });

  // API-18 / AC-18
  it("answers the second of two updates from the same version with STALE_UPDATE and the current action", async () => {
    const ticketId = await makeTicket();
    const action = await newAction(ticketId);

    const first = await patch(action.id, { version: 1, description: "First editor wins." });
    const second = await patch(action.id, { version: 1, description: "Second editor loses." }, otherStaffId);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("STALE_UPDATE");
    expect(second.body.current).toMatchObject({ id: action.id, description: "First editor wins.", version: 2 });
  });

  it("requires the version", async () => {
    const ticketId = await makeTicket();
    const action = await newAction(ticketId);

    for (const version of [undefined, "1", 1.5, 0]) {
      const res = await patch(action.id, { version, description: "No version." });
      expect(res.status, String(version)).toBe(400);
      expect(res.body.fields).toEqual([{ field: "version", message: "The version you last saw is required" }]);
    }
  });

  it("answers 404 for an unknown action", async () => {
    expect((await patch(99_999_999, { version: 1, description: "x" })).status).toBe(404);
  });
});

describe("PATCH /api/actions/:id/follow-up", () => {
  // API-13 / AC-09
  it("clears an open follow-up once, recording who and when; a second clear is 400", async () => {
    const ticketId = await makeTicket();
    const action = await newAction(ticketId, {
      status: "COMPLETED",
      result: "Replaced.",
      followUpRequired: true,
      followUpNote: "Order a spare.",
    });

    const cleared = await clearFollowUp(action.id, 1, otherStaffId);
    expect(cleared.status).toBe(200);
    expect(cleared.body.followUpClearedBy).toMatchObject({ id: otherStaffId });
    expect(cleared.body.followUpClearedAt).not.toBeNull();
    expect(cleared.body.version).toBe(2);

    expect((await clearFollowUp(action.id, 2)).status).toBe(400);
  });

  it("refuses an action that is not Completed or has no follow-up, and a stale version", async () => {
    const ticketId = await makeTicket();
    const open = await newAction(ticketId, { followUpRequired: true, followUpNote: "Later." });
    const noFollowUp = await newAction(ticketId, { status: "COMPLETED", result: "Done." });
    const withFollowUp = await newAction(ticketId, {
      status: "COMPLETED",
      result: "Done.",
      followUpRequired: true,
      followUpNote: "Check again.",
    });

    expect((await clearFollowUp(open.id, 1)).status).toBe(400);
    expect((await clearFollowUp(noFollowUp.id, 1)).status).toBe(400);

    const stale = await clearFollowUp(withFollowUp.id, 7);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("STALE_UPDATE");
  });
});

describe("GET /api/tickets/:id/actions", () => {
  // API-14 / AC-10
  it("lists by Action Date/Time then id, identically on repeated calls", async () => {
    const ticketId = await makeTicket();
    const early = new Date(Date.now() - 40 * 60_000).toISOString();
    const late = new Date(Date.now() - 20 * 60_000).toISOString();

    const a = await newAction(ticketId, { actionAt: late, description: "Late step." });
    const b = await newAction(ticketId, { actionAt: early, description: "Early step one." });
    const c = await newAction(ticketId, { actionAt: early, description: "Early step two." });

    const first = await list(ticketId);
    const second = await list(ticketId);
    const ids = first.body.actions.map((action: { id: number }) => action.id);

    expect(first.status).toBe(200);
    expect(ids).toEqual([b.id, c.id, a.id]);
    expect(second.body.actions.map((action: { id: number }) => action.id)).toEqual(ids);
  });

  // API-15 / AC-11
  it("keeps each action's own performer and assignee, independent of the ticket owner", async () => {
    const ticketId = await makeTicket({ ownerId: thirdStaffId });
    await newAction(ticketId, { assigneeId: otherStaffId }, staffId);
    await newAction(ticketId, { assigneeId: staffId }, otherStaffId);

    const res = await list(ticketId);
    const people = res.body.actions.map((action: { performedBy: { id: number }; assignee: { id: number } }) => [
      action.performedBy.id,
      action.assignee.id,
    ]);

    expect(people).toEqual([
      [staffId, otherStaffId],
      [otherStaffId, staffId],
    ]);
  });

  it("answers 404 for an unknown ticket to staff too", async () => {
    expect((await list(99_999_999)).status).toBe(404);
  });
});

describe("locked tickets and the parent version", () => {
  // API-16 / AC-12
  it("refuses to create or change an action on a Closed or a Cancelled ticket", async () => {
    for (const status of ["CLOSED", "CANCELLED"] as const) {
      const ticketId = await makeTicket();
      const action = await newAction(ticketId, {
        status: "COMPLETED",
        result: "Done.",
        followUpRequired: true,
        followUpNote: "Later.",
      });
      const open = await newAction(ticketId);
      await prisma.ticket.update({ where: { id: ticketId }, data: { status } });

      const created = await create(ticketId, { actionAt: at(), description: "Too late." });
      const updated = await patch(open.id, { version: 1, description: "Too late." });
      const cleared = await clearFollowUp(action.id, 1);

      for (const res of [created, updated, cleared]) {
        expect(res.status, status).toBe(400);
        expect(res.body.code).toBe("TICKET_LOCKED");
      }
    }
  });

  // API-20 / AC-19
  it("raises the parent ticket's version and updatedAt when an action is added, completed or its follow-up cleared", async () => {
    const ticketId = await makeTicket();
    const before = await ticketVersion(ticketId);

    const action = await newAction(ticketId, { followUpRequired: true, followUpNote: "Check later." });
    const afterCreate = await ticketVersion(ticketId);
    expect(afterCreate.version).toBe(before.version + 1);
    expect(afterCreate.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());

    // A content edit is not a lifecycle change, so the ticket version stays.
    await patch(action.id, { version: 1, description: "Check the logs later." });
    expect((await ticketVersion(ticketId)).version).toBe(afterCreate.version);

    await patch(action.id, { version: 2, status: "COMPLETED", result: "Fixed." });
    const afterComplete = await ticketVersion(ticketId);
    expect(afterComplete.version).toBe(afterCreate.version + 1);

    await clearFollowUp(action.id, 3);
    expect((await ticketVersion(ticketId)).version).toBe(afterComplete.version + 1);
  });
});
