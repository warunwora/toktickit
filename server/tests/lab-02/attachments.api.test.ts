import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { readFile, rm } from "node:fs/promises";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { formatTicketNumber } from "../../src/lib/ticket-number.js";
import { MAX_FILE_BYTES, storedFilePath } from "../../src/lib/attachments.js";

// API-18 … API-28 — docs/lab-02/tests.md §2.2

const prisma = getPrisma();
const createdTicketIds: number[] = [];
const storedFilenames: string[] = [];

let ownerId = 0;
let otherId = 0;
let ownedTicketId = 0;
let foreignTicketId = 0;

// A one-pixel PNG is enough to prove the byte-for-byte round trip.
const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea735a3250000000049454e44ae426082",
  "hex"
);
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF", "utf8");

async function makeTicket(requesterId: number, summary: string) {
  const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { id: "asc" } });
  const relatedSystem = await prisma.relatedSystem.findFirst({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });

  const draft = await prisma.ticket.create({
    data: {
      ticketNumber: `PENDING-att-${Date.now()}-${Math.random()}`,
      requesterId,
      categoryId: category!.id,
      relatedSystemId: relatedSystem!.id,
      summary,
      description: "Seeded by the attachments API test suite to verify the attachment lifecycle.",
      requestedPriority: "LOW",
    },
    select: { id: true, createdAt: true },
  });

  const ticket = await prisma.ticket.update({
    where: { id: draft.id },
    data: { ticketNumber: formatTicketNumber(draft.createdAt.getFullYear(), draft.id) },
    select: { id: true },
  });

  createdTicketIds.push(ticket.id);
  return ticket.id;
}

function uploadTo(ticketId: number, requesterId: number, filename: string, bytes: Buffer, contentType: string) {
  return request(app)
    .post(`/api/tickets/${ticketId}/attachments`)
    .set("X-Requester-Id", String(requesterId))
    .attach("file", bytes, { filename, contentType });
}

async function trackStoredFilename(attachmentId: number) {
  const row = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { storedFilename: true },
  });
  if (row) storedFilenames.push(row.storedFilename);
  return row?.storedFilename ?? "";
}

beforeAll(async () => {
  const requesters = await prisma.requesterUser.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    take: 2,
  });
  ownerId = requesters[0].id;
  otherId = requesters[1].id;

  ownedTicketId = await makeTicket(ownerId, "Attachment test — owned ticket");
  foreignTicketId = await makeTicket(otherId, "Attachment test — other requester's ticket");
});

afterAll(async () => {
  await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  for (const stored of storedFilenames) {
    await rm(storedFilePath(stored), { force: true });
  }
});

describe("POST /api/tickets/:id/attachments", () => {
  // API-18 / AC-27, BR-34
  it("stores a permitted file with its metadata and returns 201", async () => {
    const res = await uploadTo(ownedTicketId, ownerId, "battery-report.pdf", PDF_BYTES, "application/pdf");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ticketId: ownedTicketId,
      originalFilename: "battery-report.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF_BYTES.length,
      state: "ACTIVE",
    });
    expect(res.body.uploadedBy.id).toBe(ownerId);
    expect(res.body.uploadedAt).toBeTruthy();

    const stored = await trackStoredFilename(res.body.id);
    expect(stored).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    await expect(readFile(storedFilePath(stored))).resolves.toBeTruthy();
  });

  // API-19 / AC-14, BR-31
  it("rejects an unsupported type with 415 and stores nothing", async () => {
    const before = await prisma.attachment.count({ where: { ticketId: ownedTicketId } });

    const res = await uploadTo(
      ownedTicketId,
      ownerId,
      "setup.exe",
      Buffer.from("MZ binary"),
      "application/x-msdownload"
    );

    expect(res.status).toBe(415);
    expect(res.body.error).toMatch(/JPG, PNG, WEBP and PDF/);
    expect(await prisma.attachment.count({ where: { ticketId: ownedTicketId } })).toBe(before);
  });

  it("rejects a file whose extension does not match its MIME type", async () => {
    const res = await uploadTo(ownedTicketId, ownerId, "payload.exe", PNG_BYTES, "image/png");

    expect(res.status).toBe(415);
  });

  // API-20 / AC-14, BR-32
  it("rejects a file larger than 5 MB with 413", async () => {
    const tooBig = Buffer.alloc(MAX_FILE_BYTES + 1, 0);
    const res = await uploadTo(ownedTicketId, ownerId, "huge.png", tooBig, "image/png");

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/5 MB or smaller/);
  });

  // API-21 / AC-28, BR-33
  it("refuses a sixth active attachment with 409", async () => {
    const ticketId = await makeTicket(ownerId, "Attachment test — limit ticket");

    for (let i = 0; i < 5; i++) {
      const res = await uploadTo(ticketId, ownerId, `evidence-${i}.png`, PNG_BYTES, "image/png");
      expect(res.status).toBe(201);
      await trackStoredFilename(res.body.id);
    }

    const sixth = await uploadTo(ticketId, ownerId, "evidence-5.png", PNG_BYTES, "image/png");
    expect(sixth.status).toBe(409);
    expect(sixth.body.error).toMatch(/at most 5 active attachments/);
    expect(await prisma.attachment.count({ where: { ticketId, removedAt: null } })).toBe(5);
  });

  // API-28 / BR-33 — a removed attachment frees its slot
  it("accepts a new upload after one of five is removed", async () => {
    const ticketId = await makeTicket(ownerId, "Attachment test — slot ticket");

    const uploaded = [];
    for (let i = 0; i < 5; i++) {
      const res = await uploadTo(ticketId, ownerId, `slot-${i}.png`, PNG_BYTES, "image/png");
      uploaded.push(res.body.id);
      await trackStoredFilename(res.body.id);
    }

    await request(app)
      .patch(`/api/attachments/${uploaded[0]}/remove`)
      .set("X-Requester-Id", String(ownerId))
      .send({ reason: "Uploaded the wrong screenshot" })
      .expect(200);

    const replacement = await uploadTo(ticketId, ownerId, "slot-replacement.png", PNG_BYTES, "image/png");
    expect(replacement.status).toBe(201);
    await trackStoredFilename(replacement.body.id);
  });

  it("answers 404 when the ticket belongs to another requester", async () => {
    const res = await uploadTo(foreignTicketId, ownerId, "sneaky.png", PNG_BYTES, "image/png");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Ticket not found" });
  });
});

describe("attachment metadata, download, and soft removal", () => {
  let attachmentId = 0;
  let listTicketId = 0;

  beforeAll(async () => {
    listTicketId = await makeTicket(ownerId, "Attachment test — lifecycle ticket");
    const res = await uploadTo(listTicketId, ownerId, "screenshot.png", PNG_BYTES, "image/png");
    attachmentId = res.body.id;
    await trackStoredFilename(attachmentId);
  });

  // API-22 / AC-29
  it("downloads an active attachment with its original filename", async () => {
    const res = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set("X-Requester-Id", String(ownerId));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["content-disposition"]).toContain('filename="screenshot.png"');
    expect(Buffer.from(res.body)).toEqual(PNG_BYTES);
  });

  // API-27 / AC-33, BR-38
  it("answers 404 when another requester tries to download it", async () => {
    const res = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set("X-Requester-Id", String(otherId));

    expect(res.status).toBe(404);
  });

  // API-26 / AC-34, BR-37
  it("rejects removal without a usable reason and keeps the attachment active", async () => {
    const res = await request(app)
      .patch(`/api/attachments/${attachmentId}/remove`)
      .set("X-Requester-Id", String(ownerId))
      .send({ reason: "ab" });

    expect(res.status).toBe(400);
    expect(res.body.fields[0].field).toBe("reason");

    const row = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    expect(row!.removedAt).toBeNull();
  });

  // API-27 / AC-33 — removal is owner-only
  it("answers 404 when another requester tries to remove it", async () => {
    const res = await request(app)
      .patch(`/api/attachments/${attachmentId}/remove`)
      .set("X-Requester-Id", String(otherId))
      .send({ reason: "Not mine to remove" });

    expect(res.status).toBe(404);
    const row = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    expect(row!.removedAt).toBeNull();
  });

  // API-23 / AC-30, BR-36
  it("soft-removes the attachment, keeping the row and its metadata", async () => {
    const res = await request(app)
      .patch(`/api/attachments/${attachmentId}/remove`)
      .set("X-Requester-Id", String(ownerId))
      .send({ reason: "  Uploaded the wrong screenshot  " });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: attachmentId,
      state: "REMOVED",
      removalReason: "Uploaded the wrong screenshot",
    });
    expect(res.body.removedBy.id).toBe(ownerId);

    const row = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    expect(row).not.toBeNull();
    expect(row!.removedAt).not.toBeNull();
    expect(row!.originalFilename).toBe("screenshot.png");
  });

  // API-23 / BR-39 — the metadata stays visible in the list
  it("still lists the removed attachment with its reason", async () => {
    const res = await request(app)
      .get(`/api/tickets/${listTicketId}/attachments`)
      .set("X-Requester-Id", String(ownerId));

    expect(res.status).toBe(200);
    const removed = res.body.find((a: { id: number }) => a.id === attachmentId);
    expect(removed).toMatchObject({
      state: "REMOVED",
      originalFilename: "screenshot.png",
      removalReason: "Uploaded the wrong screenshot",
    });
  });

  // API-24 / AC-31, BR-39
  it("answers 410 and serves no content when a removed attachment is downloaded", async () => {
    const res = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set("X-Requester-Id", String(ownerId));

    expect(res.status).toBe(410);
    expect(res.body).toEqual({ error: "This attachment has been removed" });
  });

  // API-25 / AC-32, BR-40
  it("answers 409 when the same attachment is removed twice", async () => {
    const res = await request(app)
      .patch(`/api/attachments/${attachmentId}/remove`)
      .set("X-Requester-Id", String(ownerId))
      .send({ reason: "Trying again" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already been removed/);
  });

  it("returns the ticket detail with both active and removed attachments", async () => {
    const res = await request(app)
      .get(`/api/tickets/${listTicketId}`)
      .set("X-Requester-Id", String(ownerId));

    expect(res.status).toBe(200);
    expect(res.body.attachments.length).toBeGreaterThanOrEqual(1);
    expect(res.body.attachments.some((a: { state: string }) => a.state === "REMOVED")).toBe(true);
  });
});
