import { FieldError } from "./validation.js";

// Actions Taken — docs/lab-04/specification.md §5 (BR-04 … BR-13) and §5.2.
// One module holds the field rules and the status matrix so the API, the unit
// tests and the screen's Start / Complete / Cancel buttons cannot drift apart.

export const ACTION_STATUS_VALUES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type ActionStatusValue = (typeof ACTION_STATUS_VALUES)[number];

export const ACTION_STATUS_LABEL: Record<ActionStatusValue, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** §5.2 — row = current status, entries = where it may go. Completed and Cancelled are final (BR-11). */
export const ACTION_TRANSITIONS: Record<ActionStatusValue, readonly ActionStatusValue[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** A quick fix is often recorded after it is done, so Completed is allowed on creation (§5.2). */
export const CREATE_STATUSES: readonly ActionStatusValue[] = ["PLANNED", "IN_PROGRESS", "COMPLETED"];

export const DESCRIPTION_MAX = 2000;
export const RESULT_MAX = 2000;
export const FOLLOW_UP_NOTE_MAX = 1000;
export const ATTACHMENT_NOTES_MAX = 500;
export const CANCEL_REASON_MIN = 3;
export const CANCEL_REASON_MAX = 500;
/** BR-05 — clock tolerance between the browser and the server. */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
/** BR-39 — the window in which an identical submission is a retry, not a new action. */
export const DUPLICATE_WINDOW_MS = 60 * 1000;

export function isActionStatus(value: unknown): value is ActionStatusValue {
  return typeof value === "string" && (ACTION_STATUS_VALUES as readonly string[]).includes(value);
}

export function isFinal(status: ActionStatusValue): boolean {
  return ACTION_TRANSITIONS[status].length === 0;
}

export function canActionTransition(from: ActionStatusValue, to: ActionStatusValue): boolean {
  return ACTION_TRANSITIONS[from].includes(to);
}

export function actionTransitionMessage(from: ActionStatusValue): string {
  const targets = ACTION_TRANSITIONS[from].map((status) => ACTION_STATUS_LABEL[status]);
  if (targets.length === 0) return `This action is ${ACTION_STATUS_LABEL[from]}; it is final and cannot change.`;
  const list = targets.length === 1 ? targets[0] : `${targets.slice(0, -1).join(", ")} or ${targets[targets.length - 1]}`;
  return `This action is ${ACTION_STATUS_LABEL[from]}; it can move to ${list}.`;
}

/**
 * The Action Date/Time control holds whole minutes, so an action recorded in
 * the same minute the ticket was created must not count as "before" it.
 */
function startOfMinute(value: Date): number {
  return Math.floor(value.getTime() / 60_000) * 60_000;
}

/** The stored shape of every field the rules decide on. */
export interface ActionFields {
  actionAt: Date | null;
  description: string;
  result: string | null;
  status: ActionStatusValue;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  cancelReason: string | null;
}

export interface ActionContext {
  now: Date;
  ticketCreatedAt: Date;
}

function trimmedOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value === "" ? null : value;
}

/** Accepts an ISO 8601 string only; a number or a Date-like object is a client bug. */
export function parseActionAt(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}

/**
 * Merges a request body onto the current values (empty for a create) and
 * normalises it: text is trimmed, an empty optional becomes null, and the
 * Follow-up Note is dropped when Follow-Up Required is off (BR-08).
 */
export function mergeActionFields(current: ActionFields, body: Record<string, unknown>): ActionFields {
  const next: ActionFields = { ...current };

  if (body.actionAt !== undefined) next.actionAt = parseActionAt(body.actionAt);
  if (body.description !== undefined) next.description = typeof body.description === "string" ? body.description.trim() : "";
  if (body.result !== undefined) next.result = trimmedOrNull(body.result);
  if (body.status !== undefined) next.status = body.status as ActionStatusValue;
  if (body.followUpRequired !== undefined) next.followUpRequired = body.followUpRequired as boolean;
  if (body.followUpNote !== undefined) next.followUpNote = trimmedOrNull(body.followUpNote);
  if (body.attachmentNotes !== undefined) next.attachmentNotes = trimmedOrNull(body.attachmentNotes);
  if (body.cancelReason !== undefined) next.cancelReason = trimmedOrNull(body.cancelReason);

  if (!next.followUpRequired) next.followUpNote = null;
  if (next.status !== "CANCELLED") next.cancelReason = null;
  return next;
}

/**
 * Field rules for the merged values (BR-05 … BR-09, BR-13). The status
 * transition itself is checked by the caller, because a create and an update
 * allow different statuses.
 */
export function validateActionFields(
  fields: ActionFields,
  body: Record<string, unknown>,
  context: ActionContext
): FieldError[] {
  const errors: FieldError[] = [];

  if (body.actionAt !== undefined || fields.actionAt === null) {
    if (fields.actionAt === null) {
      errors.push({ field: "actionAt", message: "Action Date/Time is required" });
    } else if (fields.actionAt.getTime() > context.now.getTime() + FUTURE_TOLERANCE_MS) {
      errors.push({ field: "actionAt", message: "Action Date/Time cannot be in the future" });
    } else if (fields.actionAt.getTime() < startOfMinute(context.ticketCreatedAt)) {
      errors.push({ field: "actionAt", message: "Action Date/Time cannot be earlier than the ticket" });
    }
  }

  if (fields.description === "") {
    errors.push({ field: "description", message: "Action Description is required" });
  } else if (fields.description.length > DESCRIPTION_MAX) {
    errors.push({ field: "description", message: `Action Description must be ${DESCRIPTION_MAX} characters or fewer` });
  }

  if (fields.result !== null && fields.result.length > RESULT_MAX) {
    errors.push({ field: "result", message: `Result must be ${RESULT_MAX} characters or fewer` });
  } else if (fields.status === "COMPLETED" && fields.result === null) {
    errors.push({ field: "result", message: "Result is required to complete an action" });
  }

  if (body.followUpRequired !== undefined && typeof body.followUpRequired !== "boolean") {
    errors.push({ field: "followUpRequired", message: "Follow-Up Required must be true or false" });
  } else if (fields.followUpRequired) {
    if (fields.followUpNote === null) {
      errors.push({ field: "followUpNote", message: "Follow-up Note is required when a follow-up is needed" });
    } else if (fields.followUpNote.length > FOLLOW_UP_NOTE_MAX) {
      errors.push({ field: "followUpNote", message: `Follow-up Note must be ${FOLLOW_UP_NOTE_MAX} characters or fewer` });
    }
  }

  if (fields.attachmentNotes !== null && fields.attachmentNotes.length > ATTACHMENT_NOTES_MAX) {
    errors.push({ field: "attachmentNotes", message: `Attachment Notes must be ${ATTACHMENT_NOTES_MAX} characters or fewer` });
  }

  if (fields.status === "CANCELLED") {
    const reason = fields.cancelReason ?? "";
    if (reason.length < CANCEL_REASON_MIN || reason.length > CANCEL_REASON_MAX) {
      errors.push({
        field: "cancelReason",
        message: `A reason of ${CANCEL_REASON_MIN} to ${CANCEL_REASON_MAX} characters is required to cancel an action`,
      });
    }
  }

  return errors;
}

export const EMPTY_ACTION: ActionFields = {
  actionAt: null,
  description: "",
  result: null,
  status: "PLANNED",
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  cancelReason: null,
};

/** A body `version` must be a positive integer (api-spec.md §1.2). */
export function parseVersion(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
}
