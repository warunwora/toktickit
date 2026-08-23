import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as reference from "../../src/api/reference.js";
import * as ticketsApi from "../../src/api/tickets.js";
import { REQUESTER_STORAGE_KEY } from "../../src/api/client.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import MyTickets from "../../src/pages/MyTickets.js";

// UI-10 … UI-14 — docs/lab-02/tests.md §2.3

const REQUESTERS = [
  { id: 1, name: "Napat Srisai", email: "napat.sri@kmutt.ac.th", department: "Faculty of Engineering" },
];
const CATEGORIES = [
  { id: 1, name: "Account and Access" },
  { id: 2, name: "Hardware" },
];
const RELATED_SYSTEMS = [{ id: 7, name: "Corporate Laptop" }];

function item(overrides: Partial<ticketsApi.TicketListItem> = {}): ticketsApi.TicketListItem {
  return {
    id: 42,
    ticketNumber: "TKT-2026-000042",
    summary: "Laptop battery drains fast",
    category: { id: 2, name: "Hardware" },
    relatedSystem: { id: 7, name: "Corporate Laptop" },
    requestedPriority: "HIGH",
    status: "NEW",
    attachmentCount: 0,
    createdAt: "2026-08-12T04:11:20.310Z",
    updatedAt: "2026-08-12T04:11:20.310Z",
    ...overrides,
  };
}

function page(
  items: ticketsApi.TicketListItem[],
  overrides: Partial<ticketsApi.TicketListResponse> = {}
): ticketsApi.TicketListResponse {
  return {
    items,
    page: 1,
    pageSize: 10,
    totalItems: items.length,
    totalPages: 1,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");
  vi.spyOn(reference, "getRequesters").mockResolvedValue(REQUESTERS);
  vi.spyOn(reference, "getCategories").mockResolvedValue(CATEGORIES);
  vi.spyOn(reference, "getRelatedSystems").mockResolvedValue(RELATED_SYSTEMS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderMyTickets() {
  return render(
    <MemoryRouter initialEntries={["/tickets"]}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/new" element={<h1>Create Ticket</h1>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

/** The last query the page sent to the API. */
function lastQuery(spy: { mock: { calls: unknown[][] } }): ticketsApi.TicketListParams {
  const calls = spy.mock.calls;
  return calls[calls.length - 1][0] as ticketsApi.TicketListParams;
}

describe("My Tickets", () => {
  // UI-10 / AC-16
  it("renders the tickets and the pagination metadata from the API", async () => {
    vi.spyOn(ticketsApi, "listTickets").mockResolvedValue(
      page([item(), item({ id: 43, ticketNumber: "TKT-2026-000043", summary: "VPN drops every hour" })], {
        totalItems: 2,
      })
    );

    renderMyTickets();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("TKT-2026-000042")).toBeInTheDocument();
    expect(within(table).getByText("VPN drops every hour")).toBeInTheDocument();
    expect(screen.getByText(/showing 1–2 of 2/i)).toBeInTheDocument();
  });

  // UI-11 / AC-17
  it("sends a search parameter after typing, without a request per keystroke", async () => {
    const spy = vi.spyOn(ticketsApi, "listTickets").mockResolvedValue(page([item()]));

    renderMyTickets();
    await screen.findByRole("table");
    const callsBefore = spy.mock.calls.length;

    await userEvent.type(screen.getByLabelText(/^Search/), "laptop");

    await waitFor(() => expect(lastQuery(spy).search).toBe("laptop"));
    expect(spy.mock.calls.length - callsBefore).toBeLessThan(6);
  });

  // UI-11 / AC-18
  it("sends the documented filter parameters", async () => {
    const spy = vi.spyOn(ticketsApi, "listTickets").mockResolvedValue(page([item()]));

    renderMyTickets();
    await screen.findByRole("table");

    await userEvent.selectOptions(screen.getByLabelText(/^Category/), "2");
    await waitFor(() => expect(lastQuery(spy).categoryId).toBe("2"));

    await userEvent.selectOptions(screen.getByLabelText(/^Requested Priority/), "HIGH");
    await waitFor(() => expect(lastQuery(spy).requestedPriority).toBe("HIGH"));
    expect(lastQuery(spy).categoryId).toBe("2");
    expect(lastQuery(spy).page).toBe(1);
  });

  // UI-12 / AC-19, AC-20
  it("sends sort, page size, and page changes", async () => {
    const spy = vi
      .spyOn(ticketsApi, "listTickets")
      .mockResolvedValue(page([item()], { totalItems: 12, totalPages: 3 }));

    renderMyTickets();
    await screen.findByRole("table");

    await userEvent.selectOptions(screen.getByLabelText(/^Sort by/), "createdAt:asc");
    await waitFor(() => expect(lastQuery(spy)).toMatchObject({ sort: "createdAt", order: "asc" }));

    await userEvent.selectOptions(screen.getByLabelText(/^Per page/), "20");
    await waitFor(() => expect(lastQuery(spy).pageSize).toBe(20));

    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(lastQuery(spy).page).toBe(2));
  });

  it("disables Previous on the first page and Next on the last page", async () => {
    vi.spyOn(ticketsApi, "listTickets").mockResolvedValue(page([item()], { totalItems: 1, totalPages: 1 }));

    renderMyTickets();
    await screen.findByRole("table");

    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  // UI-13 / AC-22
  it("shows the empty state when the requester has no tickets at all", async () => {
    vi.spyOn(ticketsApi, "listTickets").mockResolvedValue(page([]));

    renderMyTickets();

    expect(await screen.findByText(/you have not created any tickets yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/no tickets match these filters/i)).not.toBeInTheDocument();
  });

  // UI-13 / AC-23, BR-30
  it("shows the no-results state with Clear filters when filters match nothing", async () => {
    const spy = vi.spyOn(ticketsApi, "listTickets").mockResolvedValue(page([]));

    renderMyTickets();
    await screen.findByText(/you have not created any tickets yet/i);

    await userEvent.selectOptions(screen.getByLabelText(/^Category/), "2");

    expect(await screen.findByText(/no tickets match these filters/i)).toBeInTheDocument();
    expect(screen.queryByText(/you have not created any tickets yet/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: /clear filters/i })[0]);
    await waitFor(() => expect(lastQuery(spy).categoryId).toBe(""));
    expect(await screen.findByText(/you have not created any tickets yet/i)).toBeInTheDocument();
  });

  // UI-14 / AC-24
  it("shows a safe failure state with Retry when the list cannot be loaded", async () => {
    const spy = vi.spyOn(ticketsApi, "listTickets").mockRejectedValueOnce(new Error("down"));
    spy.mockResolvedValue(page([item()]));

    renderMyTickets();

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load your tickets/i);

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("links each ticket number to its detail screen", async () => {
    vi.spyOn(ticketsApi, "listTickets").mockResolvedValue(page([item()]));

    renderMyTickets();

    const link = await screen.findByRole("link", { name: "TKT-2026-000042" });
    expect(link).toHaveAttribute("href", "/tickets/42");
  });
});
