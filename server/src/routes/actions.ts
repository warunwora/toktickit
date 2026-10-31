import { Router, Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { currentUser, requireRole } from "../lib/auth.js";
import { FieldError } from "../lib/validation.js";
import {
  ActionFields,
  ActionStatusValue,
  CREATE_STATUSES,
  DUPLICATE_WINDOW_MS,
  EMPTY_ACTION,
  actionTransitionMessage,
  canActionTransition,
  isActionStatus,
  isFinal,
  mergeActionFields,
  parseVersion,
  validateActionFields,
} from "../lib/action-rules.js";

// Actions Taken — docs/lab-04/api-spec.md §3. Reading follows the ticket's
// visibility (a Requester sees their own, BR-17, BR-28); writing is IT Staff
// and Administrator (BR-26), and the performer is always the session (BR-03).

export const actionsRouter = Router();

const actionWrite = requireRole("IT_STAFF", "ADMINISTRATOR");

const personSelect = { select: { id: true, name: true, role: true } } as const;

export const actionSelect = {
  id: true,
  ticketId: true,
  actionAt: true,
  description: true,
  result: true,
  status: true,
  performedBy: personSelect,
  assignee: personSelect,
  followUpRequired: true,
  followUpNote: true,
  followUpClearedAt: true,
  followUpClearedBy: personSelect,
  attachmentNotes: true,
  cancelReason: true,
  completedAt: true,
  cancelledAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** BR-15 — oldest first, then id, so equal times keep one order. */
const actionOrder: Prisma.ActionTakenOrderByWithRelationInput[] = [{ actionAt: "asc" }, { id: "asc" }];

const LOCKED_STATUSES = ["CLOSED", "CANCELLED"];

function lockedResponse(res: Response): void {
  res.status(400).json({
    error: "This ticket is closed or cancelled; its Actions Taken can no longer change.",
    code: "TICKET_LOCKED",
  });
}

function validationResponse(res: Response, fields: FieldError[]): void {
  res.status(400).json({ error: "Validation failed", fields });
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** BR-04 — an inactive user, a Requester and an unknown id are one failure. */
async function isAssignable(userId: unknown): Promise<boolean> {
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) return false;
  const user = await getPrisma().user.findFirst({
    where: { id: userId, isActive: true, role: { in: ["IT_STAFF", "ADMINISTRATOR"] } },
    select: { id: true },
  });
  return user !== null;
}

const ASSIGNEE_ERROR: FieldError = {
  field: "assigneeId",
  message: "Select an active IT Staff or Administrator user",
};

actionsRouter.get("/api/tickets/:id/actions", async (req: Request, res: Response) => {
  const ticketId = parseId(req.params.id);
  if (ticketId === null) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  const user = currentUser(req);

  try {
    const prisma = getPrisma();
    // A Requester asking about someone else's ticket gets exactly the 404 of a
    // missing one, so ticket ids cannot be probed (BR-28).
    const ticket = await prisma.ticket.findFirst({
      where: user.role === "REQUESTER" ? { id: ticketId, requesterId: user.id } : { id: ticketId },
      select: { id: true },
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const actions = await prisma.actionTaken.findMany({
      where: { ticketId },
      orderBy: actionOrder,
      select: actionSelect,
    });

    res.status(200).json({ actions });
  } catch {
    res.status(500).json({ error: "Unable to load the Actions Taken" });
  }
});

actionsRouter.post("/api/tickets/:id/actions", actionWrite, async (req: Request, res: Response) => {
  const ticketId = parseId(req.params.id);
  if (ticketId === null) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const user = currentUser(req);

  try {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true, createdAt: true },
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (LOCKED_STATUSES.includes(ticket.status)) {
      lockedResponse(res);
      return;
    }

    const errors: FieldError[] = [];

    if (body.status !== undefined && !(isActionStatus(body.status) && CREATE_STATUSES.includes(body.status))) {
      errors.push({ field: "status", message: "A new action is Planned, In Progress or Completed" });
    }

    const fields = mergeActionFields(EMPTY_ACTION, errors.length > 0 ? { ...body, status: undefined } : body);
    errors.push(...validateActionFields(fields, body, { now: new Date(), ticketCreatedAt: ticket.createdAt }));

    // BR-04 — omitted means the performer; anything sent must be a real assignee.
    const assigneeId = body.assigneeId === undefined || body.assigneeId === null ? user.id : body.assigneeId;
    if (!(await isAssignable(assigneeId))) errors.push(ASSIGNEE_ERROR);

    if (errors.length > 0) {
      validationResponse(res, errors);
      return;
    }

    // BR-39 — the same action from the same person inside the window is a
    // retry; answering with the original lets the client recover.
    const duplicate = await prisma.actionTaken.findFirst({
      where: {
        ticketId,
        performedById: user.id,
        description: fields.description,
        actionAt: fields.actionAt!,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      select: { id: true },
    });

    if (duplicate) {
      res.status(409).json({
        error: "This action was already recorded a moment ago.",
        code: "DUPLICATE_SUBMISSION",
        actionId: duplicate.id,
      });
      return;
    }

    const now = new Date();
    const created = await prisma.$transaction(async (tx) => {
      const action = await tx.actionTaken.create({
        data: {
          ticketId,
          actionAt: fields.actionAt!,
          description: fields.description,
          result: fields.result,
          status: fields.status,
          performedById: user.id,
          assigneeId: assigneeId as number,
          followUpRequired: fields.followUpRequired,
          followUpNote: fields.followUpNote,
          attachmentNotes: fields.attachmentNotes,
          completedAt: fields.status === "COMPLETED" ? now : null,
        },
        select: actionSelect,
      });
      // BR-25 — a Ticket screen open elsewhere must see that something changed.
      await tx.ticket.update({ where: { id: ticketId }, data: { version: { increment: 1 } } });
      return action;
    });

    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "Unable to record the action" });
  }
});

const EDITABLE_KEYS = [
  "actionAt",
  "description",
  "result",
  "assigneeId",
  "followUpRequired",
  "followUpNote",
  "attachmentNotes",
  "status",
  "cancelReason",
] as const;

/** Loads an action with what every write needs to know about it and its ticket. */
async function loadForWrite(actionId: number) {
  return getPrisma().actionTaken.findUnique({
    where: { id: actionId },
    select: {
      id: true,
      ticketId: true,
      actionAt: true,
      description: true,
      result: true,
      status: true,
      followUpRequired: true,
      followUpNote: true,
      followUpClearedAt: true,
      attachmentNotes: true,
      cancelReason: true,
      version: true,
      ticket: { select: { status: true, createdAt: true } },
    },
  });
}

/** api-spec.md §1.2 — nothing was written; hand back the record as it is now. */
async function staleResponse(res: Response, actionId: number): Promise<void> {
  const current = await getPrisma().actionTaken.findUnique({ where: { id: actionId }, select: actionSelect });
  res.status(409).json({
    error: "This action was changed by someone else. Reload to see the latest version.",
    code: "STALE_UPDATE",
    current,
  });
}

actionsRouter.patch("/api/actions/:id", actionWrite, async (req: Request, res: Response) => {
  const actionId = parseId(req.params.id);
  if (actionId === null) {
    res.status(400).json({ error: "Invalid action id" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const version = parseVersion(body.version);

  if (version === null) {
    validationResponse(res, [{ field: "version", message: "The version you last saw is required" }]);
    return;
  }

  if (!EDITABLE_KEYS.some((key) => body[key] !== undefined)) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  try {
    const prisma = getPrisma();
    const action = await loadForWrite(actionId);

    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }

    if (LOCKED_STATUSES.includes(action.ticket.status)) {
      lockedResponse(res);
      return;
    }

    const from = action.status as ActionStatusValue;

    // BR-11 — a final action keeps its record; only a follow-up can be cleared,
    // and that has its own endpoint.
    if (isFinal(from)) {
      res.status(400).json({
        error: `This action is ${from === "COMPLETED" ? "Completed" : "Cancelled"} and can no longer be changed.`,
        code: "ACTION_FINAL",
      });
      return;
    }

    if (body.status !== undefined && !isActionStatus(body.status)) {
      validationResponse(res, [{ field: "status", message: "Status is not a known action status" }]);
      return;
    }

    const to = (body.status ?? from) as ActionStatusValue;
    const statusChanges = to !== from;

    if (statusChanges && !canActionTransition(from, to)) {
      res.status(400).json({
        error: "Validation failed",
        code: "INVALID_ACTION_TRANSITION",
        fields: [{ field: "status", message: actionTransitionMessage(from) }],
      });
      return;
    }

    const currentFields: ActionFields = {
      actionAt: action.actionAt,
      description: action.description,
      result: action.result,
      status: from,
      followUpRequired: action.followUpRequired,
      followUpNote: action.followUpNote,
      attachmentNotes: action.attachmentNotes,
      cancelReason: action.cancelReason,
    };

    const fields = mergeActionFields(currentFields, body);
    const errors = validateActionFields(fields, body, { now: new Date(), ticketCreatedAt: action.ticket.createdAt });

    if (body.assigneeId !== undefined && !(await isAssignable(body.assigneeId))) errors.push(ASSIGNEE_ERROR);

    if (errors.length > 0) {
      validationResponse(res, errors);
      return;
    }

    const now = new Date();
    const data: Prisma.ActionTakenUncheckedUpdateManyInput = {
      actionAt: fields.actionAt!,
      description: fields.description,
      result: fields.result,
      status: fields.status,
      followUpRequired: fields.followUpRequired,
      followUpNote: fields.followUpNote,
      attachmentNotes: fields.attachmentNotes,
      cancelReason: fields.cancelReason,
      version: { increment: 1 },
    };
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId as number;
    if (to === "COMPLETED" && statusChanges) data.completedAt = now;
    if (to === "CANCELLED" && statusChanges) data.cancelledAt = now;

    // DB-2 — the version check and the write are one statement.
    const written = await prisma.$transaction(async (tx) => {
      const { count } = await tx.actionTaken.updateMany({ where: { id: actionId, version }, data });
      if (count === 0) return false;
      if (statusChanges) {
        await tx.ticket.update({ where: { id: action.ticketId }, data: { version: { increment: 1 } } });
      }
      return true;
    });

    if (!written) {
      await staleResponse(res, actionId);
      return;
    }

    res.status(200).json(await prisma.actionTaken.findUnique({ where: { id: actionId }, select: actionSelect }));
  } catch {
    res.status(500).json({ error: "Unable to update the action" });
  }
});

actionsRouter.patch("/api/actions/:id/follow-up", actionWrite, async (req: Request, res: Response) => {
  const actionId = parseId(req.params.id);
  if (actionId === null) {
    res.status(400).json({ error: "Invalid action id" });
    return;
  }

  const version = parseVersion((req.body ?? {}).version);
  if (version === null) {
    validationResponse(res, [{ field: "version", message: "The version you last saw is required" }]);
    return;
  }

  const user = currentUser(req);

  try {
    const prisma = getPrisma();
    const action = await loadForWrite(actionId);

    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }

    if (LOCKED_STATUSES.includes(action.ticket.status)) {
      lockedResponse(res);
      return;
    }

    // BR-12 — only a Completed action with an open follow-up has one to clear.
    if (action.status !== "COMPLETED" || !action.followUpRequired || action.followUpClearedAt !== null) {
      res.status(400).json({ error: "This action has no open follow-up to clear." });
      return;
    }

    const written = await prisma.$transaction(async (tx) => {
      const { count } = await tx.actionTaken.updateMany({
        where: { id: actionId, version },
        data: { followUpClearedAt: new Date(), followUpClearedById: user.id, version: { increment: 1 } },
      });
      if (count === 0) return false;
      await tx.ticket.update({ where: { id: action.ticketId }, data: { version: { increment: 1 } } });
      return true;
    });

    if (!written) {
      await staleResponse(res, actionId);
      return;
    }

    res.status(200).json(await prisma.actionTaken.findUnique({ where: { id: actionId }, select: actionSelect }));
  } catch {
    res.status(500).json({ error: "Unable to clear the follow-up" });
  }
});
