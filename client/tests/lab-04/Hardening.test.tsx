import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as reference from "../../src/api/reference.js";
import * as ticketsApi from "../../src/api/tickets.js";
import * as staffApi from "../../src/api/staff.js";
import * as actionsApi from "../../src/api/actions.js";
import * as adminApi from "../../src/api/admin.js";
import * as conversation from "../../src/api/conversation.js";
import { ApiError } from "../../src/api/client.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import CreateTicket from "../../src/pages/CreateTicket.js";
import StaffTicketDetail from "../../src/pages/StaffTicketDetail.js";
import UserManagement from "../../src/pages/UserManagement.js";
import ConversationThread from "../../src/components/ConversationThread.js";
import { ADMINISTRATOR, IT_STAFF, REQUESTER, signedInAs } from "../helpers/auth.js";

// HARD-01 … HARD-06 — docs/lab-04/tests.md §2.7a: duplicate-submission and
// keep-the-values rules across the forms of Labs 2 to 4 (BR-39, BR-40,
// AC-36, AC-37). The Actions Taken form has its own cases (UI-08 … UI-10).

afterEach(() => {
  vi.restoreAllMocks();
});

/** A promise the test resolves or rejects when it chooses. */
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function staffTicket(overrides: Partial<staffApi.StaffTicket> = {}): staffApi.StaffTicket {
  return {
    id: 42,
    ticketNumber: "TKT-2026-000042",
    summary: "Label printer prints blank labels",
    description: "The label printer at counter 2 prints blank labels since this morning.",
    status: "IN_PROGRESS",
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    requesterResolvedAt: null,
    createdAt: "2026-10-30T01:00:00.000Z",
    updatedAt: "2026-10-30T03:00:00.000Z",
    requester: { id: 1, name: "Napat Srisai" },
    owner: { id: 26, name: "Warin Chaiyaporn" },
    category: { id: 2, name: "Hardware" },
    relatedSystem: { id: 6, name: "Printer" },
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
    attachments: [],
    comments: [],
    notes: [],
    version: 3,
    ...overrides,
  };
}

describe("Create Ticket", () => {
  async function renderAndFill() {
    signedInAs(REQUESTER);
    vi.spyOn(reference, "getCategories").mockResolvedValue([{ id: 2, name: "Hardware" }]);
    vi.spyOn(reference, "getRelatedSystems").mockResolvedValue([{ id: 7, name: "Corporate Laptop" }]);
    render(
      <MemoryRouter initialEntries={["/tickets/new"]}>
        <AuthProvider>
          <Routes>
            <Route path="/tickets/new" element={<CreateTicket />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await userEvent.selectOptions(await screen.findByLabelText(/^Category/), "2");
    await userEvent.selectOptions(screen.getByLabelText(/^Related System/), "7");
    await userEvent.selectOptions(screen.getByLabelText(/^Requested Priority/), "MEDIUM");
    await userEvent.type(screen.getByLabelText(/^Summary/), "Laptop battery drains fast");
    await userEvent.type(
      screen.getByLabelText(/^Description/),
      "The laptop discharges from full to empty within an hour even when idle."
    );
  }

  // HARD-01 / AC-36
  it("sends one request on a double click", async () => {
    const call = pending<ticketsApi.Ticket>();
    const create = vi.spyOn(ticketsApi, "createTicket").mockReturnValue(call.promise);
    await renderAndFill();

    await userEvent.dblClick(screen.getByRole("button", { name: /submit ticket/i }));
    expect(create).toHaveBeenCalledTimes(1);
  });

  // HARD-02 / AC-37
  it("keeps every value after a network failure and after a 500", async () => {
    vi.spyOn(ticketsApi, "createTicket")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new ApiError(500, "Internal error"));
    await renderAndFill();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));
      await screen.findByRole("button", { name: /submit ticket/i });
      expect(screen.getByLabelText(/^Summary/)).toHaveValue("Laptop battery drains fast");
      expect(screen.getByLabelText(/^Category/)).toHaveValue("2");
      expect(screen.getByLabelText(/^Description/)).toHaveValue(
        "The laptop discharges from full to empty within an hour even when idle."
      );
    }
  });
});

describe("Public Comment and Internal Note composer", () => {
  // HARD-03 / AC-36, AC-37
  it("posts once on a double click and keeps the text when posting fails", async () => {
    const call = pending<conversation.ConversationEntry>();
    const post = vi.fn().mockReturnValueOnce(call.promise).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ConversationThread variant="comment" entries={[]} onPost={post} onPosted={() => {}} />);

    await userEvent.type(screen.getByLabelText("Add a comment"), "Visiting at 14:00.");
    await userEvent.dblClick(screen.getByRole("button", { name: "Post Comment" }));
    expect(post).toHaveBeenCalledTimes(1);

    call.reject(new ApiError(500, "Internal error"));
    expect(await screen.findByText("The comment could not be posted. Please try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a comment")).toHaveValue("Visiting at 14:00.");
  });
});

describe("IT Staff Ticket Detail operations", () => {
  async function renderDetail() {
    signedInAs(IT_STAFF);
    vi.spyOn(staffApi, "getAssignableUsers").mockResolvedValue([{ id: 26, name: "Warin Chaiyaporn", role: "IT_STAFF" }]);
    vi.spyOn(actionsApi, "listActions").mockResolvedValue([]);
    vi.spyOn(staffApi, "getStaffTicket").mockResolvedValue(staffTicket());
    render(
      <MemoryRouter initialEntries={["/staff/tickets/42"]}>
        <AuthProvider>
          <Routes>
            <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await screen.findByRole("heading", { name: "TKT-2026-000042" });
  }

  const priority = () => screen.getByLabelText("IT Priority") as HTMLSelectElement;
  const status = () => screen.getByLabelText("Status") as HTMLSelectElement;

  // HARD-04 / AC-37
  it("keeps the selections after a network failure and after a 500", async () => {
    vi.spyOn(staffApi, "updateStaffTicket")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new ApiError(500, "Internal error"));
    await renderDetail();

    await userEvent.selectOptions(priority(), "URGENT");
    await userEvent.selectOptions(status(), "WAITING_FOR_REQUESTER");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
      expect(await screen.findByText("The ticket could not be updated. Please try again.")).toBeInTheDocument();
      expect(priority().value).toBe("URGENT");
      expect(status().value).toBe("WAITING_FOR_REQUESTER");
    }
  });

  it("still puts the controls back when the server refuses the values (400)", async () => {
    vi.spyOn(staffApi, "updateStaffTicket").mockRejectedValue(
      new ApiError(400, "Validation failed", {
        code: "INVALID_TRANSITION",
        fields: [{ field: "status", message: "This ticket is In Progress; it can move to …" }],
      })
    );
    await renderDetail();
    await userEvent.selectOptions(priority(), "URGENT");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(priority().value).toBe("HIGH"));
  });

  // HARD-05 / AC-36
  it("saves once on a double click", async () => {
    const call = pending<staffApi.StaffTicket>();
    const update = vi.spyOn(staffApi, "updateStaffTicket").mockReturnValue(call.promise);
    await renderDetail();

    await userEvent.selectOptions(priority(), "LOW");
    await userEvent.dblClick(screen.getByRole("button", { name: "Save changes" }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});

describe("User Management create panel", () => {
  // HARD-06 / AC-36, AC-37
  it("creates once on a double click and keeps the fields after a failure", async () => {
    signedInAs(ADMINISTRATOR);
    vi.spyOn(adminApi, "listUsers").mockResolvedValue([]);
    const call = pending<{ user: adminApi.ManagedUser }>();
    const create = vi.spyOn(adminApi, "createUser").mockReturnValue(call.promise as never);
    render(
      <MemoryRouter initialEntries={["/admin/users?role=IT_STAFF"]}>
        <AuthProvider>
          <Routes>
            <Route path="/admin/users" element={<UserManagement />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await screen.findByRole("heading", { name: "Users" });
    // The Administrator dashboard drills down here by role (Lab 4 AC-28).
    await waitFor(() => expect(vi.mocked(adminApi.listUsers).mock.calls.at(-1)?.[0]).toMatchObject({ role: "IT_STAFF" }));

    await userEvent.click(screen.getByRole("button", { name: /Create User/ }));
    const panel = screen.getByRole("region", { name: "Create New User" });
    await userEvent.type(within(panel).getByLabelText(/Full Name/), "Kanya Srisuk");
    await userEvent.type(within(panel).getByLabelText(/Email Address/), "kanya.sri@kmutt.ac.th");
    await userEvent.type(within(panel).getByLabelText(/Initial Password/), "Start#2026");
    await userEvent.dblClick(within(panel).getByRole("button", { name: "Save User" }));
    expect(create).toHaveBeenCalledTimes(1);

    call.reject(new TypeError("Failed to fetch"));
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Save User" })).toBeEnabled());
    expect(within(panel).getByLabelText(/Full Name/)).toHaveValue("Kanya Srisuk");
    expect(within(panel).getByLabelText(/Email Address/)).toHaveValue("kanya.sri@kmutt.ac.th");
  });
});
