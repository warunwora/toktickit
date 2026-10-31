import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { requireRole } from "../lib/auth.js";
import { parseStaffQueueQuery, staffQueueOrderBy, staffQueueWhere } from "../lib/staff-query.js";
import { serializeAttachment } from "./attachments.js";
import { FieldError, PRIORITIES, PriorityValue } from "../lib/validation.js";
import { parseVersion } from "../lib/action-rules.js";
import { resolutionBlockers } from "../lib/resolution-gate.js";
import {
  RESOLUTION_SUMMARY_MAX,
  TicketStatusValue,
  checkTransition,
  isStatus,
} from "../lib/transitions.js";

// IT Staff queue and ticket retrieval — docs/lab-03/api-spec.md §6.1, §6.2.
// Reading and writing are open to IT Staff and Administrators: Lab 4 BR-26
// (handout §4.3) replaces the Lab 3 rule that writes were IT Staff only.

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
        version: true,
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

// --- Ticket operations — api-spec.md §6.3-§6.5 ------------------------------
//
// Lab 4 BR-26 — Administrators perform IT Staff behaviour: they claim, own,
// prioritise and change status too. This replaces Lab 3 decision D-10.

const staffWrite = requireRole("IT_STAFF", "ADMINISTRATOR");

/**
 * The people a ticket or an action may be assigned to: active IT Staff and
 * Administrators (Lab 4 BR-04, BR-27). The Owner select needs this
 * list and the Administrator user endpoints are closed to IT Staff, so the
 * queue serves its own narrow, non-sensitive projection: id, name and role.
 */
staffRouter.get("/api/staff/assignable-users", staffRead, async (_req: Request, res: Response) => {
  try {
    const users = await getPrisma().user.findMany({
      where: { role: { in: ["IT_STAFF", "ADMINISTRATOR"] }, isActive: true },
      orderBy: { name: "asc" },
      // api-spec.md §4.2 — the role lets both selects tell an Administrator apart.
      select: { id: true, name: true, role: true },
    });
    res.status(200).json({ users });
  } catch {
    res.status(500).json({ error: "Unable to load the assignable users" });
  }
});

/** Everything the detail screen re-renders after a successful write. */
const operationSelect = {
  ...queueSelect,
  description: true,
  resolutionSummary: true,
  resolvedAt: true,
  closedAt: true,
  version: true,
  relatedSystem: { select: { id: true, name: true } },
} as const;

// --- Lab 4: stale updates and the resolution gate — api-spec.md §1.2, §4.1 ---
//
// Every ticket write carries the version the user last saw (BR-24, D-04). The
// write is one `UPDATE … WHERE id AND version` statement (DB-2), so the check
// and the change cannot be separated by another request.

const VERSION_ERROR: FieldError = { field: "version", message: "The version you last saw is required" };

async function staleTicket(res: Response, ticketId: number): Promise<void> {
  const current = await getPrisma().ticket.findUnique({ where: { id: ticketId }, select: operationSelect });
  res.status(409).json({
    error: "This ticket was changed by someone else. Reload to see the latest version.",
    code: "STALE_UPDATE",
    current,
  });
}

/** Writes `data` only if the version still matches; false means stale. */
async function writeIfCurrent(ticketId: number, version: number, data: Record<string, unknown>): Promise<boolean> {
  const { count } = await getPrisma().ticket.updateMany({
    where: { id: ticketId, version },
    data: { ...data, version: { increment: 1 } },
  });
  return count === 1;
}

staffRouter.patch("/api/staff/tickets/:id/owner", staffWrite, async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId)) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  const raw = (req.body ?? {}).ownerId;
  const releasing = raw === null;
  const version = parseVersion((req.body ?? {}).version);

  try {
    const prisma = getPrisma();

    // api-spec.md §4.1 order: ticket exists (404) → validation (400) → version (409).
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const fields: FieldError[] = [];
    if (!releasing && (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0)) {
      fields.push({ field: "ownerId", message: "Select an active IT Staff or Administrator user, or release the ticket" });
    }
    if (version === null) fields.push(VERSION_ERROR);
    if (fields.length > 0) {
      res.status(400).json({ error: "Validation failed", fields });
      return;
    }

    if (!releasing) {
      // BR-29 / BR-26 — an inactive user, a Requester and an unknown id are one
      // failure to the person assigning: this is not a valid owner.
      const owner = await prisma.user.findFirst({
        where: { id: raw as number, role: { in: ["IT_STAFF", "ADMINISTRATOR"] }, isActive: true },
        select: { id: true },
      });

      if (!owner) {
        res.status(400).json({
          error: "Validation failed",
          fields: [{ field: "ownerId", message: "Select an active IT Staff or Administrator user" }],
        });
        return;
      }
    }

    if (!(await writeIfCurrent(ticketId, version!, { ownerId: releasing ? null : (raw as number) }))) {
      await staleTicket(res, ticketId);
      return;
    }

    res.status(200).json(await prisma.ticket.findUnique({ where: { id: ticketId }, select: operationSelect }));
  } catch {
    res.status(500).json({ error: "Unable to update the ticket owner" });
  }
});

staffRouter.patch("/api/staff/tickets/:id", staffWrite, async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId)) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const wantsPriority = body.itPriority !== undefined;
  const wantsStatus = body.status !== undefined;
  const wantsSummary = body.resolutionSummary !== undefined;
  const version = parseVersion(body.version);

  try {
    const prisma = getPrisma();
    const current = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true, version: true },
    });

    // api-spec.md §4.1 order: 404 → validation 400 → version 409 → transition
    // 400 → resolution gate 409.
    if (!current) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (!wantsPriority && !wantsStatus && !wantsSummary) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const errors: FieldError[] = [];

    if (wantsPriority && !PRIORITIES.includes(body.itPriority as PriorityValue)) {
      errors.push({ field: "itPriority", message: `IT Priority must be one of ${PRIORITIES.join(", ")}` });
    }

    if (wantsStatus && !isStatus(body.status)) {
      errors.push({ field: "status", message: "Status is not a known ticket status" });
    }

    if (version === null) errors.push(VERSION_ERROR);

    if (errors.length > 0) {
      res.status(400).json({ error: "Validation failed", fields: errors });
      return;
    }

    // The version is checked before any decision about the ticket's state, so
    // nobody sees a gate verdict made against data they have not seen.
    if (current.version !== version) {
      await staleTicket(res, ticketId);
      return;
    }

    // BR-30 — the Requested Priority is the Requester's and is never touched.
    const data: Record<string, unknown> = {};
    if (wantsPriority) data.itPriority = body.itPriority;

    if (wantsStatus) {
      const target = body.status as TicketStatusValue;
      const check = checkTransition(current.status as TicketStatusValue, target, body.resolutionSummary);

      if (check.errors.length > 0) {
        // BR-36 — a rejected transition leaves the ticket exactly as it was,
        // including any priority sent in the same request.
        res.status(400).json({ error: "Validation failed", code: "INVALID_TRANSITION", fields: check.errors });
        return;
      }

      // BR-19 — enforced here on every request, whatever the client sent.
      if (target === "RESOLVED") {
        const blockingActions = resolutionBlockers(
          await prisma.actionTaken.findMany({
            where: { ticketId },
            orderBy: [{ actionAt: "asc" }, { id: "asc" }],
            select: { id: true, description: true, status: true, followUpRequired: true, followUpClearedAt: true },
          })
        );
        if (blockingActions.length > 0) {
          res.status(409).json({
            error: "This ticket still has incomplete Actions Taken.",
            code: "RESOLUTION_BLOCKED",
            blockingActions,
          });
          return;
        }
      }

      data.status = target;
      if (check.resolutionSummary !== undefined) data.resolutionSummary = check.resolutionSummary;

      // The timestamps that make the lifecycle auditable (api-spec.md §6.4).
      if (target === "RESOLVED") data.resolvedAt = new Date();
      if (target === "CLOSED") data.closedAt = new Date();
      if (target === "REOPENED") data.resolvedAt = null;
    } else if (wantsSummary) {
      // A summary on its own edits the text of an existing resolution.
      const summary = typeof body.resolutionSummary === "string" ? body.resolutionSummary.trim() : "";
      if (summary.length > RESOLUTION_SUMMARY_MAX) {
        res.status(400).json({
          error: "Validation failed",
          fields: [
            {
              field: "resolutionSummary",
              message: `Resolution Summary must be ${RESOLUTION_SUMMARY_MAX} characters or fewer`,
            },
          ],
        });
        return;
      }
      data.resolutionSummary = summary === "" ? null : summary;
    }

    // An action added or completed since the gate read bumps the version
    // (BR-25), so this write then fails as stale instead of slipping past it.
    if (!(await writeIfCurrent(ticketId, version!, data))) {
      await staleTicket(res, ticketId);
      return;
    }

    res.status(200).json(await prisma.ticket.findUnique({ where: { id: ticketId }, select: operationSelect }));
  } catch {
    res.status(500).json({ error: "Unable to update the ticket" });
  }
});
