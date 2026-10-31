import { RoleName } from "./auth.js";
import { apiFetch } from "./client.js";
import { Attachment } from "./attachments.js";
import { Priority, TicketReference, TicketStatus } from "./tickets.js";

// IT Staff queue and ticket retrieval — docs/lab-03/api-spec.md §6.

export interface QueueTicket {
  id: number;
  ticketNumber: string;
  summary: string;
  status: TicketStatus;
  requestedPriority: Priority;
  itPriority: Priority;
  requesterResolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requester: TicketReference;
  owner: TicketReference | null;
  category: TicketReference;
}

export interface QueueResponse {
  tickets: QueueTicket[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface TicketEntry {
  id: number;
  body: string;
  createdAt: string;
  author: { id: number; name: string; role: RoleName };
}

export interface StaffTicket extends QueueTicket {
  description: string;
  relatedSystem: TicketReference;
  resolutionSummary: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  attachments: Attachment[];
  comments: TicketEntry[];
  notes: TicketEntry[];
  /** Lab 4 — sent back on every write (api-spec.md §1.2). */
  version: number;
}

export const QUEUE_SORT_FIELDS = ["createdAt", "updatedAt", "ticketNumber", "itPriority", "status"] as const;
export type QueueSortField = (typeof QUEUE_SORT_FIELDS)[number];

export interface QueueQuery {
  search?: string;
  status?: TicketStatus | "";
  /** Lab 4 api-spec.md §5.4 — "active" means the five active statuses. */
  statusGroup?: "active" | "";
  categoryId?: number | "";
  itPriority?: Priority | "";
  ownerId?: number | "unassigned" | "";
  sort?: QueueSortField;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export function getQueue(query: QueueQuery): Promise<QueueResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const suffix = params.toString();
  return apiFetch<QueueResponse>(`/api/staff/tickets${suffix ? `?${suffix}` : ""}`);
}

export function getStaffTicket(id: number): Promise<StaffTicket> {
  return apiFetch<StaffTicket>(`/api/staff/tickets/${id}`);
}

// --- Ticket operations — api-spec.md §6.3-§6.5 ------------------------------

export interface AssignableUser {
  id: number;
  name: string;
  /** Lab 4 api-spec.md §4.2 — Administrators are assignable too. */
  role?: RoleName;
}

export function getAssignableUsers(): Promise<AssignableUser[]> {
  return apiFetch<{ users: AssignableUser[] }>("/api/staff/assignable-users").then((body) => body.users);
}

/**
 * `null` releases the ticket back to unassigned; claiming is assigning oneself.
 * `version` is the one on screen; a stale one answers 409 STALE_UPDATE.
 */
export function updateOwner(ticketId: number, version: number, ownerId: number | null): Promise<StaffTicket> {
  return apiFetch<StaffTicket>(`/api/staff/tickets/${ticketId}/owner`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, ownerId }),
  });
}

export interface TicketOperationPayload {
  itPriority?: Priority;
  status?: TicketStatus;
  resolutionSummary?: string;
}

export function updateStaffTicket(
  ticketId: number,
  version: number,
  payload: TicketOperationPayload
): Promise<StaffTicket> {
  return apiFetch<StaffTicket>(`/api/staff/tickets/${ticketId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, version }),
  });
}

/** One entry of a 409 RESOLUTION_BLOCKED body (api-spec.md §4.1). */
export interface BlockingAction {
  id: number;
  description: string;
  status: string;
  reason: "INCOMPLETE" | "FOLLOW_UP_OPEN";
}
