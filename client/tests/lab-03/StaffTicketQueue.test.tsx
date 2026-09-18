import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as reference from "../../src/api/reference.js";
import * as staffApi from "../../src/api/staff.js";
import { ApiError } from "../../src/api/client.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import StaffTicketQueue from "../../src/pages/StaffTicketQueue.js";
import { IT_STAFF, signedInAs } from "../helpers/auth.js";

// UI-16 … UI-23 — docs/lab-03/tests.md §2.9

function ticket(overrides: Partial<staffApi.QueueTicket> = {}): staffApi.QueueTicket {
  return {
    id: 42,
    ticketNumber: "TKT-2026-000042",
    summary: "Cannot connect to the VPN from home",
    status: "NEW",
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    requesterResolvedAt: null,
    createdAt: "2026-09-10T02:14:55.000Z",
    updatedAt: "2026-09-12T08:02:11.000Z",
    requester: { id: 1, name: "Napat Srisai" },
    owner: null,
    category: { id: 4, name: "Network" },
    ...overrides,
  };
}

function page(
  tickets: staffApi.QueueTicket[],
  overrides: Partial<staffApi.QueueResponse> = {}
): staffApi.QueueResponse {
  return {
    tickets,
    page: 1,
    pageSize: 10,
    totalItems: tickets.length,
    totalPages: 1,
    ...overrides,
  };
}

beforeEach(() => {
  signedInAs(IT_STAFF);
  vi.spyOn(reference, "getCategories").mockResolvedValue([
    { id: 4, name: "Network" },
    { id: 2, name: "Hardware" },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderQueue() {
  return render(
    <MemoryRouter initialEntries={["/staff/queue"]}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/queue" element={<StaffTicketQueue />} />
          <Route path="/staff/tickets/:id" element={<h1>Ticket Detail</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

/** The last query the screen sent to the API. */
function lastQuery(spy: { mock: { calls: unknown[][] } }): staffApi.QueueQuery {
  return spy.mock.calls.at(-1)?.[0] as staffApi.QueueQuery;
}

describe("IT Staff Ticket Queue", () => {
  // UI-16 / AC-25
  it("renders every documented column and the ticket rows", async () => {
    vi.spyOn(staffApi, "getQueue").mockResolvedValue(
      page([ticket(), ticket({ id: 43, ticketNumber: "TKT-2026-000043", summary: "Printer offline" })])
    );
    renderQueue();

    const table = await screen.findByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.replace(/[▲▼↕]/g, "").trim());

    expect(headers).toEqual([
      "Ticket No.",
      "Created",
      "Summary",
      "Category",
      "Req. Priority",
      "IT Priority",
      "Status",
      "Owner",
      "Last Updated",
    ]);
    expect(within(table).getByRole("link", { name: "TKT-2026-000042" })).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(3); // header + two tickets
  });

  // UI-17 / AC-31
  it("shows an Unassigned badge instead of an empty owner cell", async () => {
    vi.spyOn(staffApi, "getQueue").mockResolvedValue(
      page([ticket(), ticket({ id: 43, owner: { id: 26, name: "Warin Chaiyaporn" } })])
    );
    renderQueue();

    const table = await screen.findByRole("table");
    expect(within(table).getAllByText("Unassigned")).toHaveLength(1);
    expect(within(table).getByText("Warin Chaiyaporn")).toBeInTheDocument();
  });

  it("marks a ticket the Requester believes is resolved", async () => {
    vi.spyOn(staffApi, "getQueue").mockResolvedValue(
      page([ticket({ requesterResolvedAt: "2026-09-13T04:00:00.000Z" })])
    );
    renderQueue();

    expect(await screen.findByText("Requester says resolved")).toBeInTheDocument();
  });

  // UI-18 / AC-26
  it("sends the search term after typing and renders the filtered result", async () => {
    const getQueue = vi.spyOn(staffApi, "getQueue").mockResolvedValue(page([ticket()]));
    renderQueue();
    await screen.findByRole("table");

    await userEvent.type(screen.getByLabelText("Search"), "vpn");

    await waitFor(() => expect(lastQuery(getQueue).search).toBe("vpn"));
    // One request per pause, not one per keystroke.
    expect(getQueue.mock.calls.length).toBeLessThan(4);
  });

  // UI-19 / AC-27
  it("sends each filter and resets to the first page", async () => {
    const getQueue = vi.spyOn(staffApi, "getQueue").mockResolvedValue(page([ticket()], { totalPages: 3 }));
    renderQueue();
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastQuery(getQueue).page).toBe(2));

    await userEvent.selectOptions(screen.getByLabelText("Status"), "IN_PROGRESS");
    await waitFor(() => {
      expect(lastQuery(getQueue).status).toBe("IN_PROGRESS");
      expect(lastQuery(getQueue).page).toBe(1);
    });

    await userEvent.selectOptions(screen.getByLabelText("IT Priority"), "URGENT");
    await waitFor(() => expect(lastQuery(getQueue).itPriority).toBe("URGENT"));

    await userEvent.selectOptions(screen.getByLabelText("Owner"), "unassigned");
    await waitFor(() => expect(lastQuery(getQueue).ownerId).toBe("unassigned"));

    await userEvent.selectOptions(screen.getByLabelText("Category"), "2");
    await waitFor(() => expect(lastQuery(getQueue).categoryId).toBe(2));
  });

  it("offers Assigned to me for the signed-in staff member", async () => {
    const getQueue = vi.spyOn(staffApi, "getQueue").mockResolvedValue(page([ticket()]));
    renderQueue();
    await screen.findByRole("table");

    await userEvent.selectOptions(screen.getByLabelText("Owner"), String(IT_STAFF.id));
    await waitFor(() => expect(lastQuery(getQueue).ownerId).toBe(IT_STAFF.id));
  });

  // UI-20 / AC-30
  it("shows a no-results message with a clear action and no empty table", async () => {
    const getQueue = vi.spyOn(staffApi, "getQueue").mockResolvedValue(page([]));
    renderQueue();

    await userEvent.type(await screen.findByLabelText("Search"), "nothing");

    expect(await screen.findByText("No tickets match these filters.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[1]);
    await waitFor(() => expect(lastQuery(getQueue).search).toBe(""));
  });

  it("distinguishes an empty queue from a filtered one", async () => {
    vi.spyOn(staffApi, "getQueue").mockResolvedValue(page([]));
    renderQueue();

    expect(await screen.findByText("No tickets in the queue yet.")).toBeInTheDocument();
  });

  // UI-21 / AC-29
  it("pages forward and back and disables the controls at the ends", async () => {
    const getQueue = vi
      .spyOn(staffApi, "getQueue")
      .mockResolvedValue(page([ticket()], { page: 1, totalItems: 25, totalPages: 3 }));
    renderQueue();

    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByText("Showing 1 to 10 of 25 tickets")).toBeInTheDocument();

    getQueue.mockResolvedValue(page([ticket()], { page: 3, totalItems: 25, totalPages: 3 }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeDisabled());
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
  });

  // UI-22 / AC-28
  it("sorts by a column and exposes the direction to assistive technology", async () => {
    const getQueue = vi.spyOn(staffApi, "getQueue").mockResolvedValue(page([ticket()]));
    renderQueue();
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: /IT Priority/ }));
    await waitFor(() => {
      expect(lastQuery(getQueue)).toMatchObject({ sort: "itPriority", order: "desc" });
    });
    expect(screen.getByRole("columnheader", { name: /IT Priority/ })).toHaveAttribute("aria-sort", "descending");

    await userEvent.click(screen.getByRole("button", { name: /IT Priority/ }));
    await waitFor(() => expect(lastQuery(getQueue).order).toBe("asc"));
    expect(screen.getByRole("columnheader", { name: /IT Priority/ })).toHaveAttribute("aria-sort", "ascending");
  });

  // UI-23 / AC-30
  it("shows a safe failure message with a retry, and no raw error text", async () => {
    const getQueue = vi.spyOn(staffApi, "getQueue").mockRejectedValue(new Error("connect ECONNREFUSED"));
    renderQueue();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The ticket queue could not be loaded.");
    expect(alert).not.toHaveTextContent(/ECONNREFUSED/);

    getQueue.mockResolvedValue(page([ticket()]));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  // AC-15 — the backend answer is reflected, never guessed at
  it("shows a forbidden message when the API refuses the role", async () => {
    vi.spyOn(staffApi, "getQueue").mockRejectedValue(
      new ApiError(403, "You do not have access to this resource")
    );
    renderQueue();

    expect(await screen.findByText("You do not have access to this screen.")).toBeInTheDocument();
  });
});
