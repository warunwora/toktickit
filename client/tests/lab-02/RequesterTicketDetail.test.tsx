import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as reference from "../../src/api/reference.js";
import * as ticketsApi from "../../src/api/tickets.js";
import { ApiError, REQUESTER_STORAGE_KEY } from "../../src/api/client.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import RequesterTicketDetail from "../../src/pages/RequesterTicketDetail.js";

// UI-15, UI-16 — docs/lab-02/tests.md §2.3

const TICKET: ticketsApi.Ticket = {
  id: 42,
  ticketNumber: "TKT-2026-000042",
  status: "NEW",
  requestedPriority: "HIGH",
  summary: "Laptop battery drains fast",
  description: "The laptop discharges from full to empty within an hour even when idle on the desk.",
  requester: { id: 1, name: "Napat Srisai" },
  category: { id: 2, name: "Hardware" },
  relatedSystem: { id: 7, name: "Corporate Laptop" },
  createdAt: "2026-08-12T04:11:20.310Z",
  updatedAt: "2026-08-12T05:00:00.000Z",
  attachments: [],
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");
  vi.spyOn(reference, "getRequesters").mockResolvedValue([
    { id: 1, name: "Napat Srisai", email: "napat.sri@kmutt.ac.th", department: "Faculty of Engineering" },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDetail(path = "/tickets/42") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
          <Route path="/tickets" element={<h1>My Tickets</h1>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

describe("Requester Ticket Detail", () => {
  // UI-15 / AC-25
  it("shows every ticket field read-only with no editable header control", async () => {
    vi.spyOn(ticketsApi, "getTicket").mockResolvedValue(TICKET);

    renderDetail();

    expect(await screen.findByRole("heading", { name: "TKT-2026-000042" })).toBeInTheDocument();

    for (const label of [/Ticket Number/, /Ticket Date/, /^Requester/, /^Category/, /Related System/, /^Summary/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("readonly");
    }
    expect(screen.getByLabelText(/^Description/)).toHaveAttribute("readonly");

    expect(screen.getByLabelText(/^Summary/)).toHaveValue("Laptop battery drains fast");
    expect(screen.getByLabelText(/^Category/)).toHaveValue("Hardware");

    // No control on the ticket header may be editable.
    const editable = screen
      .getAllByRole("textbox")
      .filter((element) => !element.hasAttribute("readonly"));
    expect(editable).toHaveLength(0);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows the priority and status as badges with readable text", async () => {
    vi.spyOn(ticketsApi, "getTicket").mockResolvedValue(TICKET);

    renderDetail();

    expect(await screen.findByText("High")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  // UI-16 / AC-26, BR-13
  it("shows a not-found state instead of ticket data when the API answers 404", async () => {
    vi.spyOn(ticketsApi, "getTicket").mockRejectedValue(new ApiError(404, "Ticket not found"));

    renderDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent(/belongs to another requester/i);
    expect(screen.queryByText("Laptop battery drains fast")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to my tickets/i })).toBeInTheDocument();
  });

  it("shows a retryable failure state for an unexpected error", async () => {
    const spy = vi.spyOn(ticketsApi, "getTicket").mockRejectedValueOnce(new Error("network down"));
    spy.mockResolvedValue(TICKET);

    renderDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load this ticket/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("treats a non-numeric id as not found without calling the API", async () => {
    const spy = vi.spyOn(ticketsApi, "getTicket");

    renderDetail("/tickets/abc");

    expect(await screen.findByRole("alert")).toHaveTextContent(/ticket not found/i);
    expect(spy).not.toHaveBeenCalled();
  });
});
