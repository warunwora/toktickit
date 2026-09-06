import { Router, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { getPrisma } from "../prisma.js";
import { resolveRequester, RequesterError } from "../lib/requester.js";
import { validateCreateTicket } from "../lib/validation.js";
import { formatTicketNumber } from "../lib/ticket-number.js";
import { parseTicketListQuery } from "../lib/query.js";
import { serializeAttachment } from "./attachments.js";

// Ticket routes — contract: docs/lab-02/api-spec.md §3.

export const ticketsRouter = Router();

/** Seconds within which an identical submission counts as a duplicate (BR-19). */
const DUPLICATE_WINDOW_MS = 60_000;

const ticketDetailSelect = {
  id: true,
  ticketNumber: true,
  status: true,
  requestedPriority: true,
  summary: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  requester: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
} as const;

function handleRequesterError(error: unknown, res: Response): boolean {
  if (error instanceof RequesterError) {
    res.status(error.status).json(
      error.field ? { error: error.message, field: error.field } : { error: error.message }
    );
    return true;
  }
  return false;
}

ticketsRouter.post("/api/tickets", async (req: Request, res: Response) => {
  const prisma = getPrisma();

  let requesterId: number;
  try {
    requesterId = (await resolveRequester(req)).id;
  } catch (error) {
    if (handleRequesterError(error, res)) return;
    res.status(500).json({ error: "Unable to create the ticket" });
    return;
  }

  const { errors, value } = validateCreateTicket(req.body);
  if (!value) {
    res.status(400).json({ error: "Validation failed", fields: errors });
    return;
  }

  try {
    // Reference data must exist and still be active (BR-16).
    const [category, relatedSystem] = await Promise.all([
      prisma.category.findFirst({ where: { id: value.categoryId, isActive: true }, select: { id: true } }),
      prisma.relatedSystem.findFirst({
        where: { id: value.relatedSystemId, isActive: true },
        select: { id: true },
      }),
    ]);

    const referenceErrors = [];
    if (!category) referenceErrors.push({ field: "categoryId", message: "Category is not available" });
    if (!relatedSystem) {
      referenceErrors.push({ field: "relatedSystemId", message: "Related System is not available" });
    }
    if (referenceErrors.length > 0) {
      res.status(400).json({ error: "Validation failed", fields: referenceErrors });
      return;
    }

    // BR-19 — the same summary and description from the same requester within
    // the duplicate window is an accidental double submission, not a new ticket.
    const duplicate = await prisma.ticket.findFirst({
      where: {
        requesterId,
        summary: value.summary,
        description: value.description,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      select: { ticketNumber: true },
    });

    if (duplicate) {
      res.status(409).json({
        error: "This ticket looks like a duplicate submission",
        ticketNumber: duplicate.ticketNumber,
      });
      return;
    }

    // BR-01 / D-03 — the number is derived from the row's own id inside the
    // creating transaction, so it cannot collide. The placeholder only exists
    // between the insert and the update, and is unique by construction.
    const ticket = await prisma.$transaction(async (tx) => {
      const draft = await tx.ticket.create({
        data: {
          ticketNumber: `PENDING-${randomUUID()}`,
          requesterId,
          categoryId: value.categoryId,
          relatedSystemId: value.relatedSystemId,
          summary: value.summary,
          description: value.description,
          requestedPriority: value.requestedPriority,
        },
        select: { id: true, createdAt: true },
      });

      return tx.ticket.update({
        where: { id: draft.id },
        data: { ticketNumber: formatTicketNumber(draft.createdAt.getFullYear(), draft.id) },
        select: ticketDetailSelect,
      });
    });

    res.status(201).json({ ...ticket, attachments: [] });
  } catch {
    res.status(500).json({ error: "Unable to create the ticket" });
  }
});

ticketsRouter.get("/api/tickets", async (req: Request, res: Response) => {
  const prisma = getPrisma();

  let requesterId: number;
  try {
    requesterId = (await resolveRequester(req)).id;
  } catch (error) {
    if (handleRequesterError(error, res)) return;
    res.status(500).json({ error: "Unable to load tickets" });
    return;
  }

  const { errors, value: query } = parseTicketListQuery(req.query as Record<string, unknown>);
  if (!query) {
    res.status(400).json({ error: "Invalid query parameters", fields: errors });
    return;
  }

  // BR-14 — ownership is applied server-side; no query parameter can widen it.
  const where = {
    requesterId,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.relatedSystemId ? { relatedSystemId: query.relatedSystemId } : {}),
    ...(query.requestedPriority ? { requestedPriority: query.requestedPriority } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { ticketNumber: { contains: query.search, mode: "insensitive" as const } },
            { summary: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  try {
    const [totalItems, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        // BR-23 — the requested sort, then id desc so ties are deterministic.
        orderBy: [{ [query.sort]: query.order }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          requestedPriority: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
          // Active attachments only (BR-33, BR-39).
          attachments: { where: { removedAt: null }, select: { id: true } },
        },
      }),
    ]);

    res.status(200).json({
      items: tickets.map(({ attachments, ...ticket }) => ({
        ...ticket,
        attachmentCount: attachments.length,
      })),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      // BR-27 — a page past the end is an empty page, not an error.
      totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
    });
  } catch {
    res.status(500).json({ error: "Unable to load tickets" });
  }
});

ticketsRouter.get("/api/tickets/:id", async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId)) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  let requesterId: number;
  try {
    requesterId = (await resolveRequester(req)).id;
  } catch (error) {
    if (handleRequesterError(error, res)) return;
    res.status(500).json({ error: "Unable to load the ticket" });
    return;
  }

  try {
    // BR-13 — another requester's ticket answers exactly like a missing one.
    const ticket = await getPrisma().ticket.findFirst({
      where: { id: ticketId, requesterId },
      select: {
        ...ticketDetailSelect,
        attachments: {
          orderBy: { id: "asc" },
          select: {
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
          },
        },
      },
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const { attachments, ...rest } = ticket;
    res.status(200).json({ ...rest, attachments: attachments.map(serializeAttachment) });
  } catch {
    res.status(500).json({ error: "Unable to load the ticket" });
  }
});
