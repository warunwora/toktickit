import { APIRequestContext, expect, request } from "@playwright/test";
import { API_URL, PASSWORD } from "./auth.js";

// Lab 4 setup through the API. A spec that tests the Actions Taken screen or
// the resolution gate should not also depend on the Create Ticket form and the
// status select to reach its starting point, so those steps are done here.

export async function apiAs(email: string): Promise<APIRequestContext> {
  const context = await request.newContext({ baseURL: API_URL });
  const response = await context.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(response.status(), `${email} must be able to sign in`).toBe(200);
  return context;
}

export interface CreatedTicket {
  id: number;
  ticketNumber: string;
}

/** A Requester creates a ticket; the summary carries the run marker. */
export async function createTicket(requester: APIRequestContext, summary: string): Promise<CreatedTicket> {
  const [categories, systems] = await Promise.all([
    requester.get("/api/categories").then((r) => r.json()),
    requester.get("/api/related-systems").then((r) => r.json()),
  ]);
  const response = await requester.post("/api/tickets", {
    data: {
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
      summary,
      description: `Created by the Lab 4 end-to-end suite: ${summary}.`,
      requestedPriority: "HIGH",
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = await response.json();
  return { id: body.id, ticketNumber: body.ticketNumber };
}

export async function ticketVersion(staff: APIRequestContext, id: number): Promise<number> {
  return (await (await staff.get(`/api/staff/tickets/${id}`)).json()).version;
}

/** Moves a ticket through the matrix with the version it currently has. */
export async function setStatus(staff: APIRequestContext, id: number, status: string): Promise<void> {
  const response = await staff.patch(`/api/staff/tickets/${id}`, {
    data: { version: await ticketVersion(staff, id), status },
  });
  expect(response.status(), await response.text()).toBe(200);
}

export async function addAction(
  staff: APIRequestContext,
  ticketId: number,
  data: Record<string, unknown>
): Promise<{ id: number; version: number }> {
  const response = await staff.post(`/api/tickets/${ticketId}/actions`, {
    // Now: a ticket created a moment ago has nothing earlier to point at (BR-05).
    data: { actionAt: new Date().toISOString(), ...data },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
