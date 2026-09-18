import { FieldError } from "./validation.js";

// The Ticket status workflow — docs/lab-03/specification.md §5.1 (BR-33 … BR-39).
// The matrix lives here, in one table, so the API, the unit tests and the
// status select on the screen can never drift apart: the UI asks this module
// which transitions to offer, and the API asks it whether to accept one.

export const STATUS_VALUES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
] as const;

export type TicketStatusValue = (typeof STATUS_VALUES)[number];

export const STATUS_LABEL: Record<TicketStatusValue, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

/** Row = current status, entries = the statuses it may move to (BR-36). */
export const TRANSITIONS: Record<TicketStatusValue, readonly TicketStatusValue[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  // Closed and Cancelled are terminal: nothing leaves them (BR-38).
  CLOSED: [],
  CANCELLED: [],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
};

/** Both irreversible, so the UI must confirm before sending one (BR-39). */
export const CONFIRM_REQUIRED: readonly TicketStatusValue[] = ["CLOSED", "CANCELLED"];

export const RESOLUTION_SUMMARY_MAX = 2000;

export function isStatus(value: unknown): value is TicketStatusValue {
  return typeof value === "string" && (STATUS_VALUES as readonly string[]).includes(value);
}

export function allowedTransitions(from: TicketStatusValue): readonly TicketStatusValue[] {
  return TRANSITIONS[from];
}

export function isTerminal(status: TicketStatusValue): boolean {
  return TRANSITIONS[status].length === 0;
}

export function canTransition(from: TicketStatusValue, to: TicketStatusValue): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * The message a rejected transition carries. It names where the ticket is and
 * where it may go, because "invalid transition" alone tells the person nothing
 * about what to do next (ui-spec.md §5.5).
 */
export function transitionMessage(from: TicketStatusValue): string {
  const targets = TRANSITIONS[from];
  const label = STATUS_LABEL[from];

  if (targets.length === 0) {
    return `This ticket is ${label}; it is final and cannot change status.`;
  }

  const names = targets.map((status) => STATUS_LABEL[status]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `This ticket is ${label}; it can move to ${list}.`;
}

export interface TransitionCheck {
  errors: FieldError[];
  /** The resolution summary to store, present only when Resolved is the target. */
  resolutionSummary?: string;
}

/**
 * Validates a status change together with its resolution summary, because
 * Resolved without a summary is a rejected transition, not a rejected field
 * that leaves the status applied (BR-37, AC-36).
 */
export function checkTransition(
  from: TicketStatusValue,
  to: TicketStatusValue,
  rawSummary: unknown
): TransitionCheck {
  if (!canTransition(from, to)) {
    return { errors: [{ field: "status", message: transitionMessage(from) }] };
  }

  if (to !== "RESOLVED") return { errors: [] };

  const summary = typeof rawSummary === "string" ? rawSummary.trim() : "";

  if (summary === "") {
    return {
      errors: [{ field: "resolutionSummary", message: "Resolution Summary is required to resolve a ticket" }],
    };
  }

  if (summary.length > RESOLUTION_SUMMARY_MAX) {
    return {
      errors: [
        {
          field: "resolutionSummary",
          message: `Resolution Summary must be ${RESOLUTION_SUMMARY_MAX} characters or fewer`,
        },
      ],
    };
  }

  return { errors: [], resolutionSummary: summary };
}
