import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { formatTicketNumber } from "../../src/lib/ticket-number.js";
import { STATUS_VALUES, TRANSITIONS, TicketStatusValue } from "../../src/lib/transitions.js";
import { UPLOAD_DIR, storedFilePath } from "../../src/lib/attachments.js";
import { cleanUpSessions, cookie, prepareCookies } from "../helpers/session.js";
import { mkdir, rm, writeFile } from "node:fs/promises";

// API-52 … API-63 — docs/lab-03/tests.md §2.7.

const prisma = getPrisma();
const MARK = `ops${Date.now()}`;
const createdTicketIds: number[] = [];
const createdUserIds: number[] = [];

let staffId = 0;
let otherStaffId = 0;
let inactiveStaffId = 0;
let adminId = 0;
let requesterId = 0;
let categoryId = 0;
let relatedSystemId = 0;

async function makeTicket(options: { status?: TicketStatusValue; ownerId?: number | null } = {}) {
  const draft = await prisma.ticket.create({
    data: {
      ticketNumber: `PENDING-${MARK}-${Math.random()}`,
      requesterId,
      ownerId: options.ownerId ?? null,
      categoryId,
      relatedSystemId,
      summary: `${MARK} operational ticket`,
      description: `Seeded by the Lab 3 ticket operations suite (${MARK}).`,
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      status: options.status ?? "NEW",
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

const patchOwner = (id: number, body: object, userId = staffId) =>
  request(app).patch(`/api/staff/tickets/${id}/owner`).set("Cookie", cookie(userId)).send(body);

const patchTicket = (id: number, body: object, userId = staffId) =>
  request(app).patch(`/api/staff/tickets/${id}`).set("Cookie", cookie(userId)).send(body);

beforeAll(async () => {
  const [staff, otherStaff, admin, requester, category, relatedSystem] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { isActive: true, role: "IT_STAFF" }, orderBy: { id: "asc" } }),
    prisma.user.findFirstOrThrow({ where: { isActive: true, role: "IT_STAFF" }, orderBy: { id: "desc" } }),
    prisma.user.findFirstOrThrow({ where: { isActive: true, role: "ADMINISTRATOR" }, orderBy: { id: "asc" } }),
    prisma.user.findFirstOrThrow({
      where: { isActive: true, role: "REQUESTER", mustChangePassword: false },
      orderBy: { id: "asc" },
    }),
    prisma.category.findFirstOrThrow({ where: { isActive: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } }),
  ]);

  staffId = staff.id;
  otherStaffId = otherStaff.id;
  adminId = admin.id;
  requesterId = requester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  // A deactivated IT Staff user is needed for BR-26 and exists nowhere in the
  // seed, so the suite creates and removes its own.
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

  await prepareCookies(staffId, otherStaffId, adminId, requesterId);
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await cleanUpSessions();
});

describe("PATCH /api/staff/tickets/:id/owner", () => {
  // API-52 / AC-32
  it("lets IT Staff claim an unassigned ticket", async () => {
    const id = await makeTicket();
    const res = await patchOwner(id, { ownerId: staffId });

    expect(res.status).toBe(200);
    expect(res.body.owner).toEqual({ id: staffId, name: expect.any(String) });
  });

  // API-53 / AC-33
  it("reassigns to another active IT Staff user", async () => {
    const id = await makeTicket({ ownerId: staffId });
    const res = await patchOwner(id, { ownerId: otherStaffId });

    expect(res.status).toBe(200);
    expect(res.body.owner.id).toBe(otherStaffId);
  });

  // API-54 / AC-33
  it("releases ownership with ownerId null", async () => {
    const id = await makeTicket({ ownerId: staffId });
    const res = await patchOwner(id, { ownerId: null });

    expect(res.status).toBe(200);
    expect(res.body.owner).toBeNull();
  });

  // API-55 / AC-33
  it("refuses an inactive user, a Requester and an unknown id with a field message", async () => {
    const id = await makeTicket();

    for (const ownerId of [inactiveStaffId, requesterId, 99_999_999]) {
      const res = await patchOwner(id, { ownerId });
      expect(res.status, `ownerId ${ownerId}`).toBe(400);
      expect(res.body.fields).toEqual([{ field: "ownerId", message: "Select an active IT Staff user" }]);
    }

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
    expect(after.ownerId).toBeNull();
  });

  it("rejects a malformed ownerId and answers 404 for an unknown ticket", async () => {
    const id = await makeTicket();

    expect((await patchOwner(id, { ownerId: "seven" })).status).toBe(400);
    expect((await patchOwner(id, {})).status).toBe(400);
    expect((await patchOwner(99_999_999, { ownerId: staffId })).status).toBe(404);
  });

  it("is refused to an Administrator and to a Requester", async () => {
    const id = await makeTicket();

    expect((await patchOwner(id, { ownerId: staffId }, adminId)).status).toBe(403);
    expect((await patchOwner(id, { ownerId: staffId }, requesterId)).status).toBe(403);
  });
});

describe("PATCH /api/staff/tickets/:id", () => {
  // API-56 / AC-34
  it("changes IT Priority and never the Requested Priority", async () => {
    const id = await makeTicket();
    const res = await patchTicket(id, { itPriority: "LOW" });

    expect(res.status).toBe(200);
    expect(res.body.itPriority).toBe("LOW");
    expect(res.body.requestedPriority).toBe("HIGH");
  });

  it("rejects an unknown IT Priority", async () => {
    const id = await makeTicket();
    const res = await patchTicket(id, { itPriority: "CRITICAL" });

    expect(res.status).toBe(400);
    expect(res.body.fields[0].field).toBe("itPriority");
  });

  // API-57 / AC-35
  it("accepts one permitted transition out of every non-terminal status", async () => {
    for (const from of STATUS_VALUES) {
      const permitted = TRANSITIONS[from];
      if (permitted.length === 0) continue;

      const to = permitted.find((status) => status !== "RESOLVED") ?? "RESOLVED";
      const id = await makeTicket({ status: from });
      const res = await patchTicket(id, {
        status: to,
        ...(to === "RESOLVED" ? { resolutionSummary: "Done." } : {}),
      });

      expect(res.status, `${from} → ${to}`).toBe(200);
      expect(res.body.status).toBe(to);
    }
  });

  // API-58 / AC-35
  it("rejects one forbidden transition out of every status and leaves the ticket unchanged", async () => {
    for (const from of STATUS_VALUES) {
      const forbidden = STATUS_VALUES.find(
        (status) => status !== from && !TRANSITIONS[from].includes(status)
      ) as TicketStatusValue;

      const id = await makeTicket({ status: from });
      const res = await patchTicket(id, { status: forbidden, itPriority: "URGENT" });

      expect(res.status, `${from} → ${forbidden}`).toBe(400);
      expect(res.body.code).toBe("INVALID_TRANSITION");
      expect(res.body.fields[0].message).toContain("This ticket is");

      // Nothing in the request is applied, not even the valid priority.
      const after = await prisma.ticket.findUniqueOrThrow({
        where: { id },
        select: { status: true, itPriority: true },
      });
      expect(after.status).toBe(from);
      expect(after.itPriority).toBe("HIGH");
    }
  });

  it("refuses to move a Closed or Cancelled ticket anywhere", async () => {
    for (const terminal of ["CLOSED", "CANCELLED"] as TicketStatusValue[]) {
      const id = await makeTicket({ status: terminal });

      for (const target of STATUS_VALUES) {
        if (target === terminal) continue;
        const res = await patchTicket(id, { status: target });
        expect(res.status, `${terminal} → ${target}`).toBe(400);
      }
    }
  });

  // API-59 / AC-36
  it("rejects Resolved without a resolution summary", async () => {
    const id = await makeTicket({ status: "IN_PROGRESS" });
    const res = await patchTicket(id, { status: "RESOLVED" });

    expect(res.status).toBe(400);
    expect(res.body.fields[0].field).toBe("resolutionSummary");

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id }, select: { status: true } });
    expect(after.status).toBe("IN_PROGRESS");
  });

  // API-60 / AC-36
  it("accepts Resolved with a summary and stamps resolvedAt", async () => {
    const id = await makeTicket({ status: "IN_PROGRESS" });
    const res = await patchTicket(id, { status: "RESOLVED", resolutionSummary: "Replaced the switch port." });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("RESOLVED");
    expect(res.body.resolutionSummary).toBe("Replaced the switch port.");
    expect(res.body.resolvedAt).not.toBeNull();
  });

  // API-61 / AC-35
  it("stamps closedAt on Closed and clears resolvedAt on Reopened", async () => {
    const closing = await makeTicket({ status: "RESOLVED" });
    const closed = await patchTicket(closing, { status: "CLOSED" });

    expect(closed.status).toBe(200);
    expect(closed.body.closedAt).not.toBeNull();

    const reopening = await makeTicket({ status: "IN_PROGRESS" });
    await patchTicket(reopening, { status: "RESOLVED", resolutionSummary: "Looked fixed." });
    const reopened = await patchTicket(reopening, { status: "REOPENED" });

    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe("REOPENED");
    expect(reopened.body.resolvedAt).toBeNull();
  });

  // API-62 / AC-35
  it("rejects an empty body", async () => {
    const id = await makeTicket();
    const res = await patchTicket(id, {});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Nothing to update");
  });

  it("answers 404 for an unknown ticket and 403 for the other two roles", async () => {
    const id = await makeTicket();

    expect((await patchTicket(99_999_999, { itPriority: "LOW" })).status).toBe(404);
    expect((await patchTicket(id, { itPriority: "LOW" }, adminId)).status).toBe(403);
    expect((await patchTicket(id, { itPriority: "LOW" }, requesterId)).status).toBe(403);
  });
});

describe("GET /api/staff/assignable-users", () => {
  it("lists active IT Staff by name and hides everyone else", async () => {
    const res = await request(app).get("/api/staff/assignable-users").set("Cookie", cookie(staffId));

    expect(res.status).toBe(200);
    const ids = res.body.users.map((user: { id: number }) => user.id);
    expect(ids).toContain(staffId);
    expect(ids).not.toContain(inactiveStaffId);
    expect(ids).not.toContain(requesterId);
    expect(ids).not.toContain(adminId);

    const names = res.body.users.map((user: { name: string }) => user.name);
    expect([...names].sort()).toEqual(names);
    expect(Object.keys(res.body.users[0]).sort()).toEqual(["id", "name"]);
  });

  it("is refused to a Requester", async () => {
    const res = await request(app).get("/api/staff/assignable-users").set("Cookie", cookie(requesterId));
    expect(res.status).toBe(403);
  });
});

describe("Attachment access for IT Staff", () => {
  // API-63 / AC-39
  it("downloads an active attachment and answers 410 for a removed one", async () => {
    const id = await makeTicket();

    const [active, removed] = await Promise.all([
      prisma.attachment.create({
        data: {
          ticketId: id,
          originalFilename: "screenshot.png",
          storedFilename: `${MARK}-active.png`,
          mimeType: "image/png",
          sizeBytes: 12,
          uploadedByUserId: requesterId,
        },
        select: { id: true },
      }),
      prisma.attachment.create({
        data: {
          ticketId: id,
          originalFilename: "old.png",
          storedFilename: `${MARK}-removed.png`,
          mimeType: "image/png",
          sizeBytes: 12,
          uploadedByUserId: requesterId,
          removedAt: new Date(),
          removalReason: "Uploaded by mistake",
          removedByUserId: requesterId,
        },
        select: { id: true },
      }),
    ]);

    // The download streams the stored file, so the suite writes one.
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(storedFilePath(`${MARK}-active.png`), Buffer.from("fake-png-bytes"));

    const activeRes = await request(app)
      .get(`/api/attachments/${active.id}/download`)
      .set("Cookie", cookie(staffId));
    expect(activeRes.status).toBe(200);

    const removedRes = await request(app)
      .get(`/api/attachments/${removed.id}/download`)
      .set("Cookie", cookie(staffId));
    expect(removedRes.status).toBe(410);

    await rm(storedFilePath(`${MARK}-active.png`), { force: true });
  });
});
