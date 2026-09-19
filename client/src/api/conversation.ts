import { apiFetch } from "./client.js";
import { RoleName } from "./auth.js";
import { TicketStatus } from "./tickets.js";

// The ticket conversation — docs/lab-03/api-spec.md §4.1-§4.3 and §5.
// Public Comments and Internal Notes share one entry shape because they are the
// same thing with different visibility; only the endpoints differ.

export interface ConversationEntry {
  id: number;
  body: string;
  createdAt: string;
  author: { id: number; name: string; role: RoleName };
}

export function getComments(ticketId: number): Promise<{ comments: ConversationEntry[] }> {
  return apiFetch(`/api/tickets/${ticketId}/comments`);
}

export function postComment(ticketId: number, body: string): Promise<ConversationEntry> {
  return apiFetch(`/api/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export function getNotes(ticketId: number): Promise<{ notes: ConversationEntry[] }> {
  return apiFetch(`/api/tickets/${ticketId}/notes`);
}

export function postNote(ticketId: number, body: string): Promise<ConversationEntry> {
  return apiFetch(`/api/tickets/${ticketId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export interface ResolutionIndication {
  id: number;
  ticketNumber: string;
  status: TicketStatus;
  requesterResolvedAt: string | null;
  updatedAt: string;
}

/** Records an opinion, never a status: only IT Staff resolve a ticket (BR-40). */
export function markProblemResolved(ticketId: number): Promise<ResolutionIndication> {
  return apiFetch(`/api/tickets/${ticketId}/problem-resolved`, { method: "POST" });
}
