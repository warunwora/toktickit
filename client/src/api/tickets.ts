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

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  category: TicketReference;
  relatedSystem: TicketReference;
  requestedPriority: Priority;
  status: TicketStatus;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListResponse {
  items: TicketListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface TicketListParams {
  search?: string;
  categoryId?: string;
  relatedSystemId?: string;
  requestedPriority?: string;
  status?: string;
  sort?: string;
  order?: string;
  page?: number;
  pageSize?: number;
}

/** Only non-empty parameters are sent: the API rejects unknown ones (BR-25). */
export function listTickets(params: TicketListParams): Promise<TicketListResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const suffix = query.toString();
  return apiFetch<TicketListResponse>(`/api/tickets${suffix ? `?${suffix}` : ""}`, {
    withRequester: true,
  });
}
