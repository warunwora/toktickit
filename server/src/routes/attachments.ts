import { Router, Request, Response } from "express";
import multer from "multer";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { getPrisma } from "../prisma.js";
import { resolveRequester, RequesterError } from "../lib/requester.js";
import { validateRemovalReason } from "../lib/validation.js";
import {
  ALLOWED_LABEL,
  MAX_ACTIVE_ATTACHMENTS,
  MAX_FILE_BYTES,
  UPLOAD_DIR,
  buildStoredFilename,
  isAllowedType,
  storedFilePath,
} from "../lib/attachments.js";

// Attachment routes — contract: docs/lab-02/api-spec.md §4.

export const attachmentsRouter = Router();

// Kept in memory so the file is only written once it has passed every rule.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });

const attachmentSelect = {
  id: true,
  ticketId: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  uploadedAt: true,
  removedAt: true,
  removalReason: true,
  uploadedBy: { select: { id: true, name: true } },
  removedBy: { select: { id: true, name: true } },
} as const;

type AttachmentRow = {
  id: number;
  ticketId: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  removedAt: Date | null;
  removalReason: string | null;
  uploadedBy: { id: number; name: string };
  removedBy: { id: number; name: string } | null;
};

/** Removed attachments stay visible as metadata (BR-39). */
export function serializeAttachment(row: AttachmentRow) {
  const base = {
    id: row.id,
    ticketId: row.ticketId,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedAt: row.uploadedAt,
    uploadedBy: row.uploadedBy,
  };

  if (!row.removedAt) return { ...base, state: "ACTIVE" as const };

  return {
    ...base,
    state: "REMOVED" as const,
    removedAt: row.removedAt,
    removalReason: row.removalReason,
    removedBy: row.removedBy,
  };
}

function handleRequesterError(error: unknown, res: Response, fallback: string): boolean {
  if (error instanceof RequesterError) {
    res
      .status(error.status)
      .json(error.field ? { error: error.message, field: error.field } : { error: error.message });
    return true;
  }
  res.status(500).json({ error: fallback });
  return true;
}

/** BR-13 — a ticket owned by someone else is indistinguishable from a missing one. */
async function findOwnedTicket(ticketId: number, requesterId: number) {
  return getPrisma().ticket.findFirst({ where: { id: ticketId, requesterId }, select: { id: true } });
}

attachmentsRouter.get("/api/tickets/:id/attachments", async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId)) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  let requesterId: number;
  try {
    requesterId = (await resolveRequester(req)).id;
  } catch (error) {
    handleRequesterError(error, res, "Unable to load attachments");
    return;
  }

  try {
    const ticket = await findOwnedTicket(ticketId, requesterId);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const attachments = await getPrisma().attachment.findMany({
      where: { ticketId },
      orderBy: { id: "asc" },
      select: attachmentSelect,
    });

    res.status(200).json(attachments.map(serializeAttachment));
  } catch {
    res.status(500).json({ error: "Unable to load attachments" });
  }
});

attachmentsRouter.post(
  "/api/tickets/:id/attachments",
  (req: Request, res: Response, next) => {
    upload.single("file")(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "Each file must be 5 MB or smaller" });
          return;
        }
        res.status(400).json({ error: "A file is required" });
        return;
      }
      if (error) {
        res.status(500).json({ error: "Unable to store the attachment" });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const prisma = getPrisma();
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId)) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    let requesterId: number;
    try {
      requesterId = (await resolveRequester(req)).id;
    } catch (error) {
      handleRequesterError(error, res, "Unable to store the attachment");
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "A file is required" });
      return;
    }

    if (!isAllowedType(file.mimetype, file.originalname)) {
      res.status(415).json({ error: ALLOWED_LABEL });
      return;
    }

    let storedFilename: string | null = null;
    try {
      const ticket = await findOwnedTicket(ticketId, requesterId);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      // BR-33 — removed attachments do not count toward the limit.
      const activeCount = await prisma.attachment.count({ where: { ticketId, removedAt: null } });
      if (activeCount >= MAX_ACTIVE_ATTACHMENTS) {
        res
          .status(409)
          .json({ error: `A ticket can have at most ${MAX_ACTIVE_ATTACHMENTS} active attachments` });
        return;
      }

      storedFilename = buildStoredFilename(file.mimetype, file.originalname);
      await mkdir(UPLOAD_DIR, { recursive: true });
      await writeFile(storedFilePath(storedFilename), file.buffer);

      const attachment = await prisma.attachment.create({
        data: {
          ticketId,
          originalFilename: file.originalname,
          storedFilename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedByRequesterId: requesterId,
        },
        select: attachmentSelect,
      });

      res.status(201).json(serializeAttachment(attachment));
    } catch {
      // BR-42 — never leave a file on disk without its metadata row.
      if (storedFilename) {
        await unlink(storedFilePath(storedFilename)).catch(() => undefined);
      }
      res.status(500).json({ error: "Unable to store the attachment" });
    }
  }
);

attachmentsRouter.get("/api/attachments/:id/download", async (req: Request, res: Response) => {
  const attachmentId = Number(req.params.id);
  if (!Number.isInteger(attachmentId)) {
    res.status(400).json({ error: "Invalid attachment id" });
    return;
  }

  let requesterId: number;
  try {
    requesterId = (await resolveRequester(req)).id;
  } catch (error) {
    handleRequesterError(error, res, "Unable to read the attachment");
    return;
  }

  try {
    // BR-38 — ownership is checked through the parent ticket.
    const attachment = await getPrisma().attachment.findFirst({
      where: { id: attachmentId, ticket: { requesterId } },
      select: {
        originalFilename: true,
        storedFilename: true,
        mimeType: true,
        removedAt: true,
      },
    });

    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    // BR-39 — a removed attachment is intentionally gone, not missing.
    if (attachment.removedAt) {
      res.status(410).json({ error: "This attachment has been removed" });
      return;
    }

    const content = await readFile(storedFilePath(attachment.storedFilename));
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.originalFilename.replace(/"/g, "")}"`
    );
    res.status(200).send(content);
  } catch {
    res.status(500).json({ error: "Unable to read the attachment" });
  }
});

attachmentsRouter.patch("/api/attachments/:id/remove", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const attachmentId = Number(req.params.id);
  if (!Number.isInteger(attachmentId)) {
    res.status(400).json({ error: "Invalid attachment id" });
    return;
  }

  let requesterId: number;
  try {
    requesterId = (await resolveRequester(req)).id;
  } catch (error) {
    handleRequesterError(error, res, "Unable to remove the attachment");
    return;
  }

  const { errors, value: reason } = validateRemovalReason((req.body ?? {}).reason);
  if (!reason) {
    res.status(400).json({ error: "Validation failed", fields: errors });
    return;
  }

  try {
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, ticket: { requesterId } },
      select: { id: true, removedAt: true },
    });

    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    if (attachment.removedAt) {
      res.status(409).json({ error: "This attachment has already been removed" });
      return;
    }

    // BR-36 — soft removal only: the row and the metadata are kept.
    const removed = await prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        removedAt: new Date(),
        removalReason: reason,
        removedByRequesterId: requesterId,
      },
      select: attachmentSelect,
    });

    res.status(200).json(serializeAttachment(removed));
  } catch {
    res.status(500).json({ error: "Unable to remove the attachment" });
  }
});
