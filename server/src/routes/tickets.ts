import { Router, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { getPrisma } from "../prisma.js";
import { resolveRequester, RequesterError } from "../lib/requester.js";
import { validateCreateTicket } from "../lib/validation.js";
import { formatTicketNumber } from "../lib/ticket-number.js";

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
