import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as staffApi from "../../src/api/staff.js";
import * as conversation from "../../src/api/conversation.js";
import { ApiError } from "../../src/api/client.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import StaffTicketDetail from "../../src/pages/StaffTicketDetail.js";
import { ADMINISTRATOR, IT_STAFF, signedInAs } from "../helpers/auth.js";

// UI-24 … UI-31 — docs/lab-03/tests.md §2.9

function staffTicket(overrides: Partial<staffApi.StaffTicket> = {}): staffApi.StaffTicket {
  return {
    id: 42,
    ticketNumber: "TKT-2026-000042",
    summary: "Cannot connect to the VPN from home",
    description: "The VPN client reports a certificate error every evening after 18:00.",
    status: "NEW",
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    requesterResolvedAt: null,
    createdAt: "2026-09-10T02:14:55.000Z",
    updatedAt: "2026-09-12T08:02:11.000Z",
    requester: { id: 1, name: "Napat Srisai" },
    owner: null,
    category: { id: 4, name: "Network" },
    relatedSystem: { id: 3, name: "VPN" },
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
    attachments: [],
    comments: [],
    notes: [],
    ...overrides,
  };
}

function entry(overrides: Partial<conversation.ConversationEntry> = {}): conversation.ConversationEntry {
  return {
    id: 1,
    body: "We are investigating the issue on your device.",
    createdAt: "2026-09-12T03:30:00.000Z",
    author: { id: 26, name: "Warin Chaiyaporn", role: "IT_STAFF" },
    ...overrides,
  };
}

beforeEach(() => {
  signedInAs(IT_STAFF);
  vi.spyOn(staffApi, "getAssignableUsers").mockResolvedValue([
    { id: 26, name: "Warin Chaiyaporn" },
    { id: 27, name: "Pimchanok Rattana" },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderDetail(ticket: staffApi.StaffTicket = staffTicket()) {
  vi.spyOn(staffApi, "getStaffTicket").mockResolvedValue(ticket);

  const view = render(
    <MemoryRouter initialEntries={[`/staff/tickets/${ticket.id}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
          <Route path="/staff/queue" element={<h1>Ticket Queue</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );

  await screen.findByRole("heading", { name: ticket.ticketNumber });
  return view;
}

function statusSelect() {
  return screen.getByLabelText("Status") as HTMLSelectElement;
}

function optionLabels(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((option) => option.textContent ?? "");
}

describe("IT Staff Ticket Detail — ownership", () => {
  // UI-24 / AC-32
  it("offers Claim only while the ticket is unassigned and sends the owner update", async () => {
    const claimed = staffTicket({ owner: { id: 26, name: "Warin Chaiyaporn" } });
    const updateOwner = vi.spyOn(staffApi, "updateOwner").mockResolvedValue(claimed);

    await renderDetail();
    await userEvent.click(screen.getByRole("button", { name: "Claim this ticket" }));

    expect(updateOwner).toHaveBeenCalledWith(42, 26);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Claim this ticket" })).not.toBeInTheDocument()
    );
  });

  it("hides Claim on a ticket that already has an owner", async () => {
    await renderDetail(staffTicket({ owner: { id: 27, name: "Pimchanok Rattana" } }));
    expect(screen.queryByRole("button", { name: "Claim this ticket" })).not.toBeInTheDocument();
  });

  it("reassigns through the Owner select and can release the ticket", async () => {
    const updateOwner = vi
      .spyOn(staffApi, "updateOwner")
      .mockResolvedValue(staffTicket({ owner: { id: 27, name: "Pimchanok Rattana" } }));

    await renderDetail(staffTicket({ owner: { id: 26, name: "Warin Chaiyaporn" } }));
    await userEvent.selectOptions(screen.getByLabelText("Ticket Owner"), "27");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateOwner).toHaveBeenCalledWith(42, 27);
  });

  it("shows the field message when the API refuses an owner", async () => {
    vi.spyOn(staffApi, "updateOwner").mockRejectedValue(
      new ApiError(400, "Validation failed", {
        fields: [{ field: "ownerId", message: "Select an active IT Staff user" }],
      })
    );

    await renderDetail(staffTicket({ owner: { id: 26, name: "Warin Chaiyaporn" } }));
    await userEvent.selectOptions(screen.getByLabelText("Ticket Owner"), "27");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Select an active IT Staff user")).toBeInTheDocument();
    // The control returns to the stored owner (ui-spec.md §5.5).
    expect((screen.getByLabelText("Ticket Owner") as HTMLSelectElement).value).toBe("26");
  });
});

describe("IT Staff Ticket Detail — priority and status", () => {
  // UI-30 / AC-34
  it("sends the new IT Priority and keeps the Requested Priority read-only", async () => {
    const update = vi.spyOn(staffApi, "updateStaffTicket").mockResolvedValue(staffTicket({ itPriority: "LOW" }));

    await renderDetail();
    await userEvent.selectOptions(screen.getByLabelText("IT Priority"), "LOW");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(update).toHaveBeenCalledWith(42, { itPriority: "LOW" });
    expect(screen.queryByRole("combobox", { name: "Requested Priority" })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Ticket information")).getByText("High")).toBeInTheDocument();
  });

  // UI-25 / AC-35
  it("offers only the transitions permitted from the current status", async () => {
    await renderDetail(staffTicket({ status: "NEW" }));

    expect(optionLabels(statusSelect())).toEqual(["New", "Open", "In Progress", "Cancelled"]);
    expect(optionLabels(statusSelect())).not.toContain("Resolved");
    expect(optionLabels(statusSelect())).not.toContain("Closed");
  });

  it("offers nothing to move to out of a terminal status", async () => {
    await renderDetail(staffTicket({ status: "CLOSED" }));

    expect(optionLabels(statusSelect())).toEqual(["Closed"]);
    expect(statusSelect()).toBeDisabled();
    expect(screen.getByText(/Closed is final/)).toBeInTheDocument();
  });

  // UI-26 / AC-36
  it("makes the Resolution Summary required when Resolved is chosen and reports an empty one", async () => {
    vi.spyOn(staffApi, "updateStaffTicket").mockRejectedValue(
      new ApiError(400, "Validation failed", {
        code: "INVALID_TRANSITION",
        fields: [
          { field: "resolutionSummary", message: "Resolution Summary is required to resolve a ticket" },
        ],
      })
    );

    await renderDetail(staffTicket({ status: "IN_PROGRESS" }));

    const summary = screen.getByLabelText(/Resolution Summary/);
    expect(summary).toHaveAttribute("readonly");

    await userEvent.selectOptions(statusSelect(), "RESOLVED");
    await waitFor(() => expect(summary).not.toHaveAttribute("readonly"));
    expect(summary).toHaveAttribute("aria-required", "true");
    expect(summary).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Resolution Summary is required to resolve a ticket")
    ).toBeInTheDocument();
  });

  it("sends the status and the summary together when Resolved is saved", async () => {
    const update = vi
      .spyOn(staffApi, "updateStaffTicket")
      .mockResolvedValue(staffTicket({ status: "RESOLVED", resolutionSummary: "Re-enrolled the certificate." }));

    await renderDetail(staffTicket({ status: "IN_PROGRESS" }));
    await userEvent.selectOptions(statusSelect(), "RESOLVED");
    await userEvent.type(screen.getByLabelText(/Resolution Summary/), "Re-enrolled the certificate.");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(update).toHaveBeenCalledWith(42, {
      status: "RESOLVED",
      resolutionSummary: "Re-enrolled the certificate.",
    });
  });

  // UI-27 / AC-35
  it("confirms before Cancelled and leaves the value unchanged when the dialog is cancelled", async () => {
    const update = vi.spyOn(staffApi, "updateStaffTicket").mockResolvedValue(staffTicket());

    await renderDetail(staffTicket({ status: "NEW" }));
    await userEvent.selectOptions(statusSelect(), "CANCELLED");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Move this ticket to Cancelled\?/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    expect(statusSelect().value).toBe("NEW");
  });

  it("sends the transition once the confirmation is accepted", async () => {
    const update = vi
      .spyOn(staffApi, "updateStaffTicket")
      .mockResolvedValue(staffTicket({ status: "CLOSED", closedAt: "2026-09-13T00:00:00.000Z" }));

    await renderDetail(staffTicket({ status: "RESOLVED", resolutionSummary: "Fixed." }));
    await userEvent.selectOptions(statusSelect(), "CLOSED");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, move to Closed" }));

    // Only the status is sent: the stored resolution summary did not change.
    expect(update).toHaveBeenCalledWith(42, { status: "CLOSED" });
  });

  // UI-31 / AC-35
  it("shows the rejection message and reverts every control", async () => {
    vi.spyOn(staffApi, "updateStaffTicket").mockRejectedValue(
      new ApiError(400, "Validation failed", {
        code: "INVALID_TRANSITION",
        fields: [
          { field: "status", message: "This ticket is New; it can move to Open, In Progress or Cancelled." },
        ],
      })
    );

    await renderDetail(staffTicket({ status: "NEW" }));
    await userEvent.selectOptions(statusSelect(), "IN_PROGRESS");
    await userEvent.selectOptions(screen.getByLabelText("IT Priority"), "URGENT");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("This ticket is New; it can move to Open, In Progress or Cancelled.")
    ).toBeInTheDocument();
    expect(statusSelect().value).toBe("NEW");
    expect((screen.getByLabelText("IT Priority") as HTMLSelectElement).value).toBe("HIGH");
  });
});

describe("IT Staff Ticket Detail — conversation", () => {
  // UI-28 / AC-38
  it("separates Public Comments from Internal Notes and captions the notes", async () => {
    await renderDetail(
      staffTicket({
        comments: [entry({ id: 1, body: "A technician will visit this afternoon." })],
        notes: [entry({ id: 2, body: "Fuser unit is failing; order a replacement." })],
      })
    );

    const comments = screen.getByRole("region", { name: "Public Comments" });
    expect(comments.className).not.toContain("zg-notes");
    expect(within(comments).queryByText("Not visible to the Requester")).not.toBeInTheDocument();
    expect(within(comments).getByRole("button", { name: "Post Comment" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /Internal Notes/ }));
    const notes = screen.getByRole("region", { name: "Internal Notes" });

    expect(notes).not.toBe(comments);
    expect(notes.className).toContain("zg-notes");
    expect(within(notes).getByText("Not visible to the Requester")).toBeInTheDocument();
    expect(within(notes).getByRole("button", { name: "Add Internal Note" })).toBeInTheDocument();
    // The composers can never be confused: each button names its own thread.
    expect(within(notes).queryByRole("button", { name: "Post Comment" })).not.toBeInTheDocument();
  });

  // UI-29 / AC-37
  it("posts a comment and a note to their own endpoints and threads", async () => {
    const post = vi
      .spyOn(conversation, "postComment")
      .mockResolvedValue(entry({ id: 10, body: "Visiting at 14:00." }));
    const note = vi
      .spyOn(conversation, "postNote")
      .mockResolvedValue(entry({ id: 11, body: "Spare part is in the cabinet." }));

    await renderDetail();

    const comments = screen.getByRole("region", { name: "Public Comments" });
    await userEvent.type(within(comments).getByLabelText("Add a comment"), "Visiting at 14:00.");
    await userEvent.click(within(comments).getByRole("button", { name: "Post Comment" }));

    await userEvent.click(screen.getByRole("tab", { name: /Internal Notes/ }));
    const notes = screen.getByRole("region", { name: "Internal Notes" });
    await userEvent.type(within(notes).getByLabelText("Add an internal note"), "Spare part is in the cabinet.");
    await userEvent.click(within(notes).getByRole("button", { name: "Add Internal Note" }));

    expect(post).toHaveBeenCalledWith(42, "Visiting at 14:00.");
    expect(note).toHaveBeenCalledWith(42, "Spare part is in the cabinet.");
    expect(await within(comments).findByText("Visiting at 14:00.")).toBeInTheDocument();
    expect(await within(notes).findByText("Spare part is in the cabinet.")).toBeInTheDocument();
    expect(within(comments).queryByText("Spare part is in the cabinet.")).not.toBeInTheDocument();
  });

  it("counts each thread on its tab", async () => {
    await renderDetail(
      staffTicket({ comments: [entry({ id: 1 }), entry({ id: 2 })], notes: [entry({ id: 3 })] })
    );

    expect(screen.getByRole("tab", { name: "Public Comments (2)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Internal Notes (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Attachments (0)" })).toBeInTheDocument();
  });
});

describe("IT Staff Ticket Detail — Administrator", () => {
  // BR-24 / D-10
  it("lets an Administrator read and add a note but never operate the workflow", async () => {
    signedInAs(ADMINISTRATOR);
    await renderDetail();

    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Claim this ticket" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeDisabled();
    expect(screen.getByLabelText("IT Priority")).toBeDisabled();
    expect(screen.getByLabelText("Ticket Owner")).toBeDisabled();

    await userEvent.click(screen.getByRole("tab", { name: /Internal Notes/ }));
    const notes = screen.getByRole("region", { name: "Internal Notes" });
    expect(within(notes).getByRole("button", { name: "Add Internal Note" })).toBeInTheDocument();
  });
});
