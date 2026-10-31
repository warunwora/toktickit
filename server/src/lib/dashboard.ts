import { PRIORITIES, PriorityValue } from "./validation.js";
import { STATUSES, StatusValue } from "./query.js";

// Dashboards — docs/lab-04/api-spec.md §5, specification.md BR-30 … BR-38.
// The windows and the drill-down links live here, outside the routes, so the
// unit tests can pin them and the screens never build a URL of their own.

export const RECENT_UPDATED_DAYS = 7;
export const RECENT_RESOLVED_DAYS = 30;
/** BR-34 — short lists hold at most five items. */
export const LIST_LIMIT = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * BR-32 — a rolling window of whole 24-hour days back from the request time.
 * Rolling windows have no midnight to get wrong (D-08), so the time zone does
 * not matter here; it only matters when a date is shown (BR-33).
 */
export function windowStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** True when `value` falls inside the window: `value >= windowStart` (the SQL `>=`). */
export function inWindow(value: Date | null, now: Date, days: number): boolean {
  return value !== null && value.getTime() >= windowStart(now, days).getTime();
}

// --- Drill-down links (BR-36, api-spec.md §5.1, §5.2) ----------------------

export const requesterLinks = {
  open: "/tickets?statusGroup=active",
  waitingForMe: "/tickets?status=WAITING_FOR_REQUESTER",
  resolved: "/tickets?status=RESOLVED",
  closed: "/tickets?status=CLOSED",
  recentlyUpdated: "/tickets?sort=updatedAt&order=desc",
} as const;

export function staffLinks(me: number) {
  return {
    unassigned: "/staff/queue?ownerId=unassigned&statusGroup=active",
    ownedByMe: `/staff/queue?ownerId=${me}&statusGroup=active`,
    urgentActive: "/staff/queue?itPriority=URGENT&statusGroup=active",
    recentlyUpdated: "/staff/queue?sort=updatedAt&order=desc",
    byStatus: Object.fromEntries(STATUSES.map((status) => [status, `/staff/queue?status=${status}`])) as Record<
      StatusValue,
      string
    >,
    byItPriority: Object.fromEntries(
      PRIORITIES.map((priority) => [priority, `/staff/queue?itPriority=${priority}&statusGroup=active`])
    ) as Record<PriorityValue, string>,
  };
}

export const ROLES = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const;

export function userLink(role: (typeof ROLES)[number]): string {
  return `/admin/users?role=${role}`;
}

/** The ticket screen an action is worked on, opened on its tab. */
export function actionLink(ticketId: number): string {
  return `/staff/tickets/${ticketId}?tab=actions`;
}
