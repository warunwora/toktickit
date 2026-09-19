import { TicketStatus } from "../api/tickets.js";

// The status workflow the Status select offers — docs/lab-03/specification.md
// §5.1. This mirrors server/src/lib/transitions.ts the same way the Lab 2 field
// rules mirror the backend validators: it decides what to *offer*, never what
// is allowed. The API re-checks every transition and its rejection is final.

export const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

export const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: [],
  CANCELLED: [],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
};

/** Both are irreversible, so the screen confirms before sending one (BR-39). */
export const CONFIRM_REQUIRED: readonly TicketStatus[] = ["CLOSED", "CANCELLED"];

export function allowedTransitions(from: TicketStatus): readonly TicketStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function isTerminal(status: TicketStatus): boolean {
  return allowedTransitions(status).length === 0;
}
