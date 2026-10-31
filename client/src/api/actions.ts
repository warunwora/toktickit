import { RoleName } from "./auth.js";
import { apiFetch } from "./client.js";

// Actions Taken — docs/lab-04/api-spec.md §1.3 and §3.

export type ActionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface ActionPerson {
  id: number;
  name: string;
  role: RoleName;
}

export interface ActionTaken {
  id: number;
  ticketId: number;
  actionAt: string;
  description: string;
  result: string | null;
  status: ActionStatus;
  performedBy: ActionPerson;
  assignee: ActionPerson;
  followUpRequired: boolean;
  followUpNote: string | null;
  followUpClearedAt: string | null;
  followUpClearedBy: ActionPerson | null;
  attachmentNotes: string | null;
  cancelReason: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActionPayload {
  actionAt?: string;
  description?: string;
  result?: string;
  status?: ActionStatus;
  assigneeId?: number;
  followUpRequired?: boolean;
  followUpNote?: string;
  attachmentNotes?: string;
  cancelReason?: string;
}

const json = { "Content-Type": "application/json" };

export function listActions(ticketId: number): Promise<ActionTaken[]> {
  return apiFetch<{ actions: ActionTaken[] }>(`/api/tickets/${ticketId}/actions`).then((body) => body.actions);
}

export function createAction(ticketId: number, payload: ActionPayload): Promise<ActionTaken> {
  return apiFetch<ActionTaken>(`/api/tickets/${ticketId}/actions`, {
    method: "POST",
    headers: json,
    body: JSON.stringify(payload),
  });
}

/** `version` is the one the user last saw; a stale one answers 409 STALE_UPDATE (api-spec.md §1.2). */
export function updateAction(actionId: number, version: number, payload: ActionPayload): Promise<ActionTaken> {
  return apiFetch<ActionTaken>(`/api/actions/${actionId}`, {
    method: "PATCH",
    headers: json,
    body: JSON.stringify({ ...payload, version }),
  });
}

export function clearFollowUp(actionId: number, version: number): Promise<ActionTaken> {
  return apiFetch<ActionTaken>(`/api/actions/${actionId}/follow-up`, {
    method: "PATCH",
    headers: json,
    body: JSON.stringify({ version }),
  });
}
