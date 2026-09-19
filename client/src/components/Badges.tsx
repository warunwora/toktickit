import { RoleName, ROLE_LABEL } from "../api/auth.js";
import { Priority, TicketStatus } from "../api/tickets.js";

// ui-spec.md §8 and docs/lab-03/ui-spec.md §2-§3 — colour is always redundant
// with the text (AC-38, AC-49).

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

function slug(value: string): string {
  return value.toLowerCase().replace(/_/g, "-");
}

export function PriorityBadge({ value }: { value: Priority }) {
  return (
    <span className={`zg-badge zg-badge-priority-${value.toLowerCase()}`}>{PRIORITY_LABEL[value]}</span>
  );
}

export function StatusBadge({ value }: { value: TicketStatus }) {
  return <span className={`zg-badge zg-badge-status-${slug(value)}`}>{STATUS_LABEL[value] ?? value}</span>;
}

export function RoleBadge({ value }: { value: RoleName }) {
  return <span className={`zg-badge zg-badge-role-${slug(value)}`}>{ROLE_LABEL[value]}</span>;
}
