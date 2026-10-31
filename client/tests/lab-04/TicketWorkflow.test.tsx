import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as staffApi from "../../src/api/staff.js";
import * as actionsApi from "../../src/api/actions.js";
import { ApiError } from "../../src/api/client.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import StaffTicketDetail from "../../src/pages/StaffTicketDetail.js";
import { TicketStatus } from "../../src/api/tickets.js";
import { TRANSITIONS, STATUS_LABEL } from "../../src/lib/transitions.js";
import { ADMINISTRATOR, IT_STAFF, signedInAs } from "../helpers/auth.js";

// UI-13 … UI-18 — docs/lab-04/tests.md §2.7.

function staffTicket(overrides: Partial<staffApi.StaffTicket> = {}): staffApi.StaffTicket {
  return {
    id: 42,
    ticketNumber: "TKT-2026-000042",
    summary: "Label printer at counter 2 prints blank labels",
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
    version: 7,
    ...overrides,
  };
}

const planned: actionsApi.ActionTaken = {
  id: 31,
  ticketId: 42,
  actionAt: "2026-10-30T02:00:00.000Z",
  description: "Replace the print head",
  result: null,
  status: "IN_PROGRESS",
  performedBy: { id: 26, name: "Warin Chaiyaporn", role: "IT_STAFF" },
  assignee: { id: 26, name: "Warin Chaiyaporn", role: "IT_STAFF" },
  followUpRequired: false,
  followUpNote: null,
  followUpClearedAt: null,
  followUpClearedBy: null,
  attachmentNotes: null,
  cancelReason: null,
  completedAt: null,
  cancelledAt: null,
  version: 2,
  createdAt: "2026-10-30T02:00:00.000Z",
  updatedAt: "2026-10-30T02:00:00.000Z",
};

beforeEach(() => {
  signedInAs(IT_STAFF);
  vi.spyOn(staffApi, "getAssignableUsers").mockResolvedValue([
    { id: 26, name: "Warin Chaiyaporn", role: "IT_STAFF" },
    { id: 30, name: "Anong Sukjai", role: "ADMINISTRATOR" },
  ]);
  vi.spyOn(actionsApi, "listActions").mockResolvedValue([planned]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderDetail(ticket = staffTicket()) {
  const load = vi.spyOn(staffApi, "getStaffTicket").mockResolvedValue(ticket);
  render(
    <MemoryRouter initialEntries={[`/staff/tickets/${ticket.id}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  await screen.findByRole("heading", { name: ticket.ticketNumber });
  return load;
}

const statusSelect = () => screen.getByLabelText("Status") as HTMLSelectElement;

async function chooseResolved() {
  await userEvent.selectOptions(statusSelect(), "RESOLVED");
  await userEvent.type(screen.getByLabelText(/Resolution Summary/), "Replaced the head.");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
}

describe("Ticket workflow feedback", () => {
  // UI-13 / AC-14
  it("lists the blocking actions as links into the Actions Taken tab", async () => {
    vi.spyOn(staffApi, "updateStaffTicket").mockRejectedValue(
      new ApiError(409, "This ticket still has incomplete Actions Taken.", {
        code: "RESOLUTION_BLOCKED",
        body: {
          blockingActions: [
            { id: 31, description: "Replace the print head", status: "IN_PROGRESS", reason: "INCOMPLETE" },
            { id: 29, description: "Check the driver", status: "COMPLETED", reason: "FOLLOW_UP_OPEN" },
          ],
        },
      })
    );
    await renderDetail();
    await chooseResolved();

    const callout = (await screen.findByText("This ticket cannot be resolved yet.")).closest(".zg-callout") as HTMLElement;
    const items = within(callout).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["Replace the print head — incomplete", "Check the driver — follow-up open"]);
    expect(statusSelect().value).toBe("RESOLVED");

    await userEvent.click(within(callout).getByRole("link", { name: "Replace the print head" }));
    expect(screen.getByRole("tab", { name: "Actions Taken (1)" })).toHaveAttribute("aria-selected", "true");
  });

  // UI-14 / AC-17
  it("warns on STALE_UPDATE, keeps the selections and reloads on request", async () => {
    vi.spyOn(staffApi, "updateStaffTicket").mockRejectedValue(
      new ApiError(409, "This ticket was changed by someone else.", { code: "STALE_UPDATE" })
    );
    const load = await renderDetail();

    await userEvent.selectOptions(screen.getByLabelText("IT Priority"), "URGENT");
    await userEvent.selectOptions(statusSelect(), "WAITING_FOR_REQUESTER");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const warning = await screen.findByText("This ticket was changed by someone else.");
    expect(warning.closest(".zg-callout")).toHaveClass("zg-callout-warning");
    expect((screen.getByLabelText("IT Priority") as HTMLSelectElement).value).toBe("URGENT");
    expect(statusSelect().value).toBe("WAITING_FOR_REQUESTER");

    load.mockResolvedValue(staffTicket({ version: 8, itPriority: "LOW" }));
    await userEvent.click(screen.getByRole("button", { name: "Reload latest" }));
    await waitFor(() => expect((screen.getByLabelText("IT Priority") as HTMLSelectElement).value).toBe("LOW"));
    expect(screen.queryByText("This ticket was changed by someone else.")).not.toBeInTheDocument();
  });

  // UI-15 / AC-20
  it("offers exactly the permitted transitions from every status", async () => {
    for (const status of Object.keys(TRANSITIONS) as TicketStatus[]) {
      const view = await (async () => {
        vi.spyOn(staffApi, "getStaffTicket").mockResolvedValue(staffTicket({ status }));
        return render(
          <MemoryRouter initialEntries={["/staff/tickets/42"]}>
            <AuthProvider>
              <Routes>
                <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        );
      })();
      await screen.findByRole("heading", { name: "TKT-2026-000042" });
      const labels = Array.from(statusSelect().options).map((option) => option.textContent);
      expect(labels, status).toEqual([STATUS_LABEL[status], ...TRANSITIONS[status].map((s) => STATUS_LABEL[s])]);
      view.unmount();
    }
  });

  // UI-16 / AC-21
  it("updates badges in place and sends the new version on the next save", async () => {
    const update = vi
      .spyOn(staffApi, "updateStaffTicket")
      .mockResolvedValueOnce(staffTicket({ status: "WAITING_FOR_REQUESTER", version: 8 }))
      .mockResolvedValueOnce(staffTicket({ status: "WAITING_FOR_REQUESTER", itPriority: "LOW", version: 9 }));
    await renderDetail();

    await userEvent.selectOptions(statusSelect(), "WAITING_FOR_REQUESTER");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("The ticket has been updated.");
    expect(update).toHaveBeenLastCalledWith(42, 7, { status: "WAITING_FOR_REQUESTER" });

    const header = screen.getByRole("heading", { name: "TKT-2026-000042" }).parentElement as HTMLElement;
    expect(within(header).getByText("Waiting for Requester")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("IT Priority"), "LOW");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith(42, 8, { itPriority: "LOW" }));
  });

  it("chains the version from an owner change into the ticket change in one save", async () => {
    const owner = vi.spyOn(staffApi, "updateOwner").mockResolvedValue(staffTicket({ owner: { id: 30, name: "Anong Sukjai" }, version: 8 }));
    const update = vi.spyOn(staffApi, "updateStaffTicket").mockResolvedValue(staffTicket({ itPriority: "LOW", version: 9 }));
    await renderDetail();

    await userEvent.selectOptions(screen.getByLabelText("Ticket Owner"), "30");
    await userEvent.selectOptions(screen.getByLabelText("IT Priority"), "LOW");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(42, 8, { itPriority: "LOW" }));
    expect(owner).toHaveBeenCalledWith(42, 7, 30);
  });

  // UI-17 / AC-33
  it("gives an Administrator the claim, IT Priority, status and Add action controls", async () => {
    vi.restoreAllMocks();
    signedInAs(ADMINISTRATOR);
    vi.spyOn(staffApi, "getAssignableUsers").mockResolvedValue([{ id: 30, name: "Anong Sukjai", role: "ADMINISTRATOR" }]);
    vi.spyOn(actionsApi, "listActions").mockResolvedValue([]);
    const claim = vi.spyOn(staffApi, "updateOwner").mockResolvedValue(staffTicket({ owner: { id: 30, name: "Anong Sukjai" }, version: 8 }));
    await renderDetail(staffTicket({ owner: null }));

    expect(screen.getByLabelText("IT Priority")).toBeEnabled();
    expect(statusSelect()).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Claim this ticket" }));
    expect(claim).toHaveBeenCalledWith(42, 7, 30);

    await userEvent.click(screen.getByRole("tab", { name: /Actions Taken/ }));
    expect(screen.getByRole("button", { name: "Add action" })).toBeInTheDocument();
  });

  // UI-18 / AC-22
  it("shows the Requester indication next to the status without changing it", async () => {
    await renderDetail(staffTicket({ status: "WAITING_FOR_REQUESTER", requesterResolvedAt: "2026-10-30T04:00:00.000Z" }));
    const header = screen.getByRole("heading", { name: "TKT-2026-000042" }).parentElement as HTMLElement;
    expect(within(header).getByText("Requester says resolved")).toBeInTheDocument();
    expect(within(header).getByText("Waiting for Requester")).toBeInTheDocument();
  });

  it("takes the ticket's new version after its own action write (BR-25)", async () => {
    vi.spyOn(actionsApi, "updateAction").mockResolvedValue({ ...planned, status: "COMPLETED", result: "Done.", version: 3 });
    const load = await renderDetail();
    const update = vi.spyOn(staffApi, "updateStaffTicket").mockResolvedValue(staffTicket({ itPriority: "LOW", version: 9 }));

    load.mockResolvedValue(staffTicket({ version: 8 }));
    await userEvent.click(screen.getByRole("tab", { name: /Actions Taken/ }));
    await userEvent.click(screen.getByRole("button", { name: "Complete" }));
    await userEvent.type(screen.getByLabelText(/^Result/), "Done.");
    await userEvent.click(screen.getByRole("button", { name: "Save action" }));
    await screen.findByText("Action saved.");
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));

    await userEvent.selectOptions(screen.getByLabelText("IT Priority"), "LOW");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(42, 8, { itPriority: "LOW" }));
  });
});
