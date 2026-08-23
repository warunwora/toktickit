import { apiFetch } from "./client.js";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketStatus = "NEW";

export interface TicketReference {
  id: number;
  name: string;
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  status: TicketStatus;
  requestedPriority: Priority;
  summary: string;
  description: string;
  requester: TicketReference;
  category: TicketReference;
  relatedSystem: TicketReference;
  createdAt: string;
  updatedAt: string;
  attachments: unknown[];
}

export interface CreateTicketPayload {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: Priority;
}

export function createTicket(payload: CreateTicketPayload): Promise<Ticket> {
  return apiFetch<Ticket>("/api/tickets", {
    method: "POST",
    withRequester: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
