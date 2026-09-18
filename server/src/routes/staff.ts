import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { requireRole } from "../lib/auth.js";
import { parseStaffQueueQuery, staffQueueOrderBy, staffQueueWhere } from "../lib/staff-query.js";
import { serializeAttachment } from "./attachments.js";

// IT Staff queue and ticket retrieval — docs/lab-03/api-spec.md §6.1, §6.2.
// Reading is open to IT Staff and Administrators; the write operations that
// arrive with Issue 6 are IT Staff only (decision D-10).

export const staffRouter = Router();

const staffRead = requireRole("IT_STAFF", "ADMINISTRATOR");

const queueSelect = {
  id: true,
  ticketNumber: true,
  summary: true,
  status: true,
  requestedPriority: true,
  itPriority: true,
  requesterResolvedAt: true,
  createdAt: true,
  updatedAt: true,
  requester: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
} as const;

const authorSelect = { select: { id: true, name: true, role: true } } as const;

staffRouter.get("/api/staff/tickets", staffRead, async (req: Request, res: Response) => {
  const { errors, value: query } = parseStaffQueueQuery(req.query as Record<string, unknown>);
  if (!query) {
    res.status(400).json({ error: "Invalid query parameters", fields: errors });
    return;
  }

  try {
    const prisma = getPrisma();
    const where = staffQueueWhere(query);

    const [totalItems, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        orderBy: staffQueueOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: queueSelect,
      }),
    ]);

    res.status(200).json({
      tickets,
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
    });
  } catch {
    res.status(500).json({ error: "Unable to load the ticket queue" });
  }
});

staffRouter.get("/api/staff/tickets/:id", staffRead, async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId)) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  try {
    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      select: {
        ...queueSelect,
        description: true,
        resolutionSummary: true,
        resolvedAt: true,
        closedAt: true,
        relatedSystem: { select: { id: true, name: true } },
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
        publicComments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, body: true, createdAt: true, author: authorSelect },
        },
        internalNotes: {
          orderBy: { createdAt: "asc" },
          select: { id: true, body: true, createdAt: true, author: authorSelect },
        },
      },
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const { attachments, publicComments, internalNotes, ...rest } = ticket;
    res.status(200).json({
      ...rest,
      attachments: attachments.map(serializeAttachment),
      comments: publicComments,
      notes: internalNotes,
    });
  } catch {
    res.status(500).json({ error: "Unable to load the ticket" });
  }
});
