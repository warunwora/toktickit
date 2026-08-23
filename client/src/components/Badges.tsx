import { Priority, TicketStatus } from "../api/tickets.js";

// ui-spec.md §8 — colour is always redundant with the text (AC-38).

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export function PriorityBadge({ value }: { value: Priority }) {
  return (
    <span className={`zg-badge zg-badge-priority-${value.toLowerCase()}`}>{PRIORITY_LABEL[value]}</span>
  );
}

export function StatusBadge({ value }: { value: TicketStatus }) {
  return <span className={`zg-badge zg-badge-status-${value.toLowerCase()}`}>{value === "NEW" ? "New" : value}</span>;
}
