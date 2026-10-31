import { ActionStatus, ActionTaken } from "../api/actions.js";

// Actions Taken rules the screen needs — docs/lab-04/specification.md §5.2 and
// BR-05 … BR-08. Like lib/transitions.ts this decides what to *offer*; the API
// re-checks everything and its rejection is final.

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const ACTION_TRANSITIONS: Record<ActionStatus, readonly ActionStatus[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const CREATE_STATUSES: readonly ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED"];

export const DESCRIPTION_MAX = 2000;
export const RESULT_MAX = 2000;
export const FOLLOW_UP_NOTE_MAX = 1000;
export const ATTACHMENT_NOTES_MAX = 500;
export const CANCEL_REASON_MIN = 3;
export const CANCEL_REASON_MAX = 500;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function isFinal(status: ActionStatus): boolean {
  return ACTION_TRANSITIONS[status].length === 0;
}

export function canMove(from: ActionStatus, to: ActionStatus): boolean {
  return ACTION_TRANSITIONS[from].includes(to);
}

export function hasOpenFollowUp(action: ActionTaken): boolean {
  return action.status === "COMPLETED" && action.followUpRequired && action.followUpClearedAt === null;
}

/** BR-15 — oldest first by Action Date/Time, then id. */
export function sortActions(actions: ActionTaken[]): ActionTaken[] {
  return [...actions].sort((a, b) => a.actionAt.localeCompare(b.actionAt) || a.id - b.id);
}

// The service desk runs in Bangkok (D-08), so the date/time control shows and
// reads Bangkok wall-clock time whatever the browser's own zone is.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export function toBangkokInput(value: Date | string): string {
  const time = typeof value === "string" ? Date.parse(value) : value.getTime();
  return new Date(time + BANGKOK_OFFSET_MS).toISOString().slice(0, 16);
}

export function fromBangkokInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatBangkok(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export interface ActionDraft {
  actionAt: string;
  description: string;
  result: string;
  status: ActionStatus;
  assigneeId: number | "";
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

/**
 * The same rules as the API, checked before sending so an obviously invalid
 * form never costs a request (AC-06). The minute input cannot hold seconds, so
 * "before the ticket" compares whole minutes, as the API does.
 */
export function validateDraft(draft: ActionDraft, ticketCreatedAt: string, now = new Date()): Record<string, string> {
  const errors: Record<string, string> = {};
  const at = fromBangkokInput(draft.actionAt);
  const createdMinute = Math.floor(Date.parse(ticketCreatedAt) / 60_000) * 60_000;

  if (!at) errors.actionAt = "Action Date/Time is required";
  else if (at.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) errors.actionAt = "Action Date/Time cannot be in the future";
  else if (at.getTime() < createdMinute) errors.actionAt = "Action Date/Time cannot be earlier than the ticket";

  const description = draft.description.trim();
  if (description === "") errors.description = "Action Description is required";
  else if (description.length > DESCRIPTION_MAX)
    errors.description = `Action Description must be ${DESCRIPTION_MAX} characters or fewer`;

  const result = draft.result.trim();
  if (result.length > RESULT_MAX) errors.result = `Result must be ${RESULT_MAX} characters or fewer`;
  else if (draft.status === "COMPLETED" && result === "") errors.result = "Result is required to complete an action";

  if (draft.followUpRequired) {
    const note = draft.followUpNote.trim();
    if (note === "") errors.followUpNote = "Follow-up Note is required when a follow-up is needed";
    else if (note.length > FOLLOW_UP_NOTE_MAX)
      errors.followUpNote = `Follow-up Note must be ${FOLLOW_UP_NOTE_MAX} characters or fewer`;
  }

  if (draft.attachmentNotes.trim().length > ATTACHMENT_NOTES_MAX)
    errors.attachmentNotes = `Attachment Notes must be ${ATTACHMENT_NOTES_MAX} characters or fewer`;

  if (draft.assigneeId === "") errors.assigneeId = "Select who the action is assigned to";

  return errors;
}
