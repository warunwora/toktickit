import { RoleName } from "./auth.js";
import { apiFetch } from "./client.js";
import { ActionStatus } from "./actions.js";
import { Priority, TicketStatus } from "./tickets.js";

// Dashboards — docs/lab-04/api-spec.md §5. The server computes every number
// and every drill-down link (BR-30, BR-36); the screens only show them.

export interface RecentTicket {
  id: number;
  ticketNumber: string;
  summary: string;
  status: TicketStatus;
  updatedAt: string;
  resolvedAt?: string | null;
  itPriority?: Priority;
}

export interface RequesterDashboardData {
  metrics: { open: number; waitingForMe: number; resolved: number; closed: number };
  recentlyUpdated: RecentTicket[];
  recentlyResolved: RecentTicket[];
  links: { open: string; waitingForMe: string; resolved: string; closed: string; recentlyUpdated: string };
  generatedAt: string;
}

export interface OpenAction {
  id: number;
  ticketId: number;
  ticketNumber: string;
  description: string;
  status: ActionStatus;
  actionAt: string;
  link: string;
}

export interface StaffDashboardData {
  metrics: { unassigned: number; ownedByMe: number; myOpenActions: number; urgentActive: number };
  byStatus: Record<TicketStatus, number>;
  byItPriority: Record<Priority, number>;
  myOpenActionsList: OpenAction[];
  recentlyUpdated: RecentTicket[];
  links: {
    unassigned: string;
    ownedByMe: string;
    urgentActive: string;
    recentlyUpdated: string;
    byStatus: Record<TicketStatus, string>;
    byItPriority: Record<Priority, string>;
  };
  /** Administrators only; absent for IT Staff (D-09). */
  users?: Record<RoleName, { active: number; inactive: number; link: string }>;
  generatedAt: string;
}

export function getRequesterDashboard(): Promise<RequesterDashboardData> {
  return apiFetch<RequesterDashboardData>("/api/dashboard/requester");
}

export function getStaffDashboard(): Promise<StaffDashboardData> {
  return apiFetch<StaffDashboardData>("/api/dashboard/staff");
}
