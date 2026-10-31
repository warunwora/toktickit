import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as actionsApi from "../../src/api/actions.js";
import * as staffApi from "../../src/api/staff.js";
import * as ticketsApi from "../../src/api/tickets.js";
import * as conversation from "../../src/api/conversation.js";
import { ApiError } from "../../src/api/client.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import StaffTicketDetail from "../../src/pages/StaffTicketDetail.js";
import RequesterTicketDetail from "../../src/pages/RequesterTicketDetail.js";
import { toBangkokInput } from "../../src/lib/actions.js";
import { ADMINISTRATOR, IT_STAFF, REQUESTER, signedInAs } from "../helpers/auth.js";

// UI-01 … UI-12 — docs/lab-04/tests.md §2.7.

const WARIN = { id: 26, name: "Warin Chaiyaporn", role: "IT_STAFF" as const };
const PIM = { id: 27, name: "Pimchanok Rattana", role: "IT_STAFF" as const };
const ANONG = { id: 30, name: "Anong Sukjai", role: "ADMINISTRATOR" as const };

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
    owner: { id: WARIN.id, name: WARIN.name },
    category: { id: 2, name: "Hardware" },
    relatedSystem: { id: 6, name: "Printer" },
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
    attachments: [],
    comments: [],
    notes: [],
    version: 1,
    ...overrides,
  };
}

function action(overrides: Partial<actionsApi.ActionTaken> = {}): actionsApi.ActionTaken {
  return {
    id: 1,
    ticketId: 42,
    actionAt: "2026-10-30T02:00:00.000Z",
    description: "Checked the print head.",
    result: null,
    status: "PLANNED",
    performedBy: WARIN,
    assignee: WARIN,
    followUpRequired: false,
    followUpNote: null,
    followUpClearedAt: null,
    followUpClearedBy: null,
    attachmentNotes: null,
    cancelReason: null,
    completedAt: null,
    cancelledAt: null,
    version: 1,
    createdAt: "2026-10-30T02:01:00.000Z",
    updatedAt: "2026-10-30T02:01:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  signedInAs(IT_STAFF);
  vi.spyOn(staffApi, "getAssignableUsers").mockResolvedValue([
    { id: ANONG.id, name: ANONG.name, role: "ADMINISTRATOR" },
    { id: PIM.id, name: PIM.name, role: "IT_STAFF" },
    { id: WARIN.id, name: WARIN.name, role: "IT_STAFF" },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderStaff(actions: actionsApi.ActionTaken[], ticket = staffTicket()) {
  vi.spyOn(staffApi, "getStaffTicket").mockResolvedValue(ticket);
  vi.spyOn(actionsApi, "listActions").mockResolvedValue(actions);

  render(
    <MemoryRouter initialEntries={[`/staff/tickets/${ticket.id}?tab=actions`]}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );

  await screen.findByRole("heading", { name: ticket.ticketNumber });
  await screen.findByRole("tab", { name: `Actions Taken (${actions.length})` });
  return screen.getByRole("region", { name: "Actions Taken" });
}

const rows = () => screen.getAllByTestId("action-row");

async function openAddForm() {
  await userEvent.click(screen.getByRole("button", { name: "Add action" }));
  return screen.getByRole("form", { name: "Add action" });
}

describe("Actions Taken list", () => {
  // UI-01 / AC-10
  it("opens on ?tab=actions and lists actions in the given order with every column", async () => {
    const section = await renderStaff([
      action({ id: 3, actionAt: "2026-10-30T02:00:00.000Z", description: "First step." }),
      action({
        id: 5,
        actionAt: "2026-10-30T02:00:00.000Z",
        description: "Second step.",
        status: "COMPLETED",
        result: "Printed fine.",
        completedAt: "2026-10-30T02:30:00.000Z",
      }),
      action({ id: 4, actionAt: "2026-10-30T03:00:00.000Z", description: "Third step.", status: "IN_PROGRESS" }),
    ]);

    expect(screen.getByRole("tab", { name: "Actions Taken (3)" })).toHaveAttribute("aria-selected", "true");
    expect(rows().map((row) => within(row).getByText(/step\./).textContent)).toEqual([
      "First step.",
      "Second step.",
      "Third step.",
    ]);

    const headers = within(section).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Action Date/Time", "Description", "Performed by", "Assigned to", "Status", "Actions"]);

    // Bangkok time: 02:00 UTC is 09:00 in Bangkok.
    expect(within(rows()[0]).getByText(/09:00/)).toBeInTheDocument();
    expect(within(rows()[1]).getByText("Completed", { selector: ".zg-badge" })).toBeInTheDocument();
    expect(within(rows()[1]).getByText("Printed fine.")).toBeInTheDocument();
    expect(within(rows()[2]).getByText("In Progress", { selector: ".zg-badge" })).toBeInTheDocument();
  });

  it("shows the empty state with the Add action button", async () => {
    await renderStaff([]);
    expect(screen.getByText("No actions recorded yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add action" })).toBeInTheDocument();
  });

  // UI-04 / AC-07
  it("offers Start only on Planned and Complete only on open actions", async () => {
    await renderStaff([
      action({ id: 1, status: "PLANNED" }),
      action({ id: 2, status: "IN_PROGRESS", actionAt: "2026-10-30T02:10:00.000Z" }),
    ]);
    const [planned, inProgress] = rows();

    expect(within(planned).getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(within(planned).getByRole("button", { name: "Complete" })).toBeInTheDocument();
    expect(within(inProgress).queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(within(inProgress).getByRole("button", { name: "Complete" })).toBeInTheDocument();
  });

  it("starts an action with its version", async () => {
    const update = vi.spyOn(actionsApi, "updateAction").mockResolvedValue(action({ status: "IN_PROGRESS", version: 2 }));
    await renderStaff([action({ version: 4 })]);

    await userEvent.click(within(rows()[0]).getByRole("button", { name: "Start" }));

    expect(update).toHaveBeenCalledWith(1, 4, { status: "IN_PROGRESS" });
    expect(await screen.findByText("Action saved.")).toBeInTheDocument();
    expect(within(rows()[0]).getByText("In Progress", { selector: ".zg-badge" })).toBeInTheDocument();
  });

  // UI-06 / AC-09
  it("shows no edit controls on final actions and Mark follow-up done on an open follow-up", async () => {
    const clear = vi.spyOn(actionsApi, "clearFollowUp").mockResolvedValue(
      action({ id: 1, status: "COMPLETED", result: "Done.", followUpRequired: true, followUpNote: "Order a spare.", followUpClearedAt: "2026-10-30T05:00:00.000Z", followUpClearedBy: WARIN, version: 3 })
    );
    await renderStaff([
      action({ id: 1, status: "COMPLETED", result: "Done.", followUpRequired: true, followUpNote: "Order a spare.", version: 2 }),
      action({ id: 2, status: "CANCELLED", cancelReason: "Not needed.", actionAt: "2026-10-30T02:10:00.000Z" }),
    ]);
    const [completed, cancelled] = rows();

    for (const row of [completed, cancelled]) {
      for (const name of ["Edit", "Start", "Complete", "Cancel"]) {
        expect(within(row).queryByRole("button", { name })).not.toBeInTheDocument();
      }
    }
    expect(within(completed).getByText("Follow-up", { selector: ".zg-badge" })).toBeInTheDocument();
    expect(within(cancelled).queryByRole("button", { name: "Mark follow-up done" })).not.toBeInTheDocument();
    expect(within(cancelled).getByText(/Not needed\./)).toBeInTheDocument();

    await userEvent.click(within(completed).getByRole("button", { name: "Mark follow-up done" }));
    expect(clear).toHaveBeenCalledWith(1, 2);
    await waitFor(() =>
      expect(within(rows()[0]).queryByRole("button", { name: "Mark follow-up done" })).not.toBeInTheDocument()
    );
  });

  // UI-07 / AC-11
  it("marks an action assigned to someone other than the ticket owner", async () => {
    await renderStaff([
      action({ id: 1, assignee: WARIN }),
      action({ id: 2, actionAt: "2026-10-30T02:10:00.000Z", performedBy: PIM, assignee: ANONG }),
    ]);
    const [own, other] = rows();

    expect(within(own).queryByText("Not the ticket owner")).not.toBeInTheDocument();
    expect(within(other).getByText("Not the ticket owner")).toBeInTheDocument();
    expect(within(other).getByText("Pimchanok Rattana")).toBeInTheDocument();
    expect(within(other).getByText("Administrator")).toBeInTheDocument();
  });

  it("shows no controls on a closed ticket", async () => {
    await renderStaff([action()], staffTicket({ status: "CLOSED" }));
    expect(screen.queryByRole("button", { name: "Add action" })).not.toBeInTheDocument();
    expect(within(rows()[0]).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Add and edit an action", () => {
  // UI-02 / AC-01
  it("submits the documented payload, with Performed by read-only", async () => {
    const create = vi.spyOn(actionsApi, "createAction").mockImplementation(async (_ticketId, payload) =>
      action({ id: 9, description: payload.description!, assignee: PIM, actionAt: payload.actionAt! })
    );
    await renderStaff([]);
    const form = await openAddForm();

    const performer = within(form).getByLabelText("Performed by");
    expect(performer).toHaveValue("Warin Chaiyaporn");
    expect(performer).toHaveAttribute("readonly");

    const when = within(form).getByLabelText(/Action Date\/Time/);
    await userEvent.clear(when);
    await userEvent.type(when, "2026-10-30T10:15");
    await userEvent.type(within(form).getByLabelText(/Action Description/), "  Replaced the print head.  ");
    await userEvent.selectOptions(within(form).getByLabelText(/Status/), "COMPLETED");
    await userEvent.type(within(form).getByLabelText(/^Result/), "Test label printed.");
    await userEvent.selectOptions(within(form).getByLabelText(/Assigned to/), String(PIM.id));
    await userEvent.click(within(form).getByLabelText("Follow-Up Required"));
    await userEvent.type(within(form).getByLabelText(/Follow-up Note/), "Order a spare.");
    await userEvent.type(within(form).getByLabelText("Attachment Notes"), "evidence.png");
    await userEvent.click(within(form).getByRole("button", { name: "Save action" }));

    expect(create).toHaveBeenCalledWith(42, {
      actionAt: "2026-10-30T03:15:00.000Z",
      description: "Replaced the print head.",
      status: "COMPLETED",
      assigneeId: PIM.id,
      followUpRequired: true,
      followUpNote: "Order a spare.",
      result: "Test label printed.",
      attachmentNotes: "evidence.png",
    });
    expect(await screen.findByText("Action saved.")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Add action" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Actions Taken (1)" })).toBeInTheDocument();
  });

  it("defaults the date to now in Bangkok and the assignee to me", async () => {
    await renderStaff([]);
    const form = await openAddForm();

    const value = (within(form).getByLabelText(/Action Date\/Time/) as HTMLInputElement).value;
    expect(Math.abs(Date.parse(`${value}:00+07:00`) - Date.now())).toBeLessThan(2 * 60_000);
    expect(within(form).getByLabelText(/Assigned to/)).toHaveValue(String(WARIN.id));
  });

  // UI-03 / AC-06
  it("blocks an invalid form with field messages and sends nothing", async () => {
    const create = vi.spyOn(actionsApi, "createAction");
    await renderStaff([]);
    const form = await openAddForm();

    const when = within(form).getByLabelText(/Action Date\/Time/);
    await userEvent.clear(when);
    await userEvent.type(when, toBangkokInput(new Date(Date.now() + 60 * 60_000)));
    await userEvent.selectOptions(within(form).getByLabelText(/Status/), "COMPLETED");
    await userEvent.click(within(form).getByLabelText("Follow-Up Required"));
    await userEvent.click(within(form).getByRole("button", { name: "Save action" }));

    expect(create).not.toHaveBeenCalled();
    expect(within(form).getByText("Action Date/Time cannot be in the future")).toBeInTheDocument();
    expect(within(form).getByText("Action Description is required")).toBeInTheDocument();
    expect(within(form).getByText("Result is required to complete an action")).toBeInTheDocument();
    expect(within(form).getByText("Follow-up Note is required when a follow-up is needed")).toBeInTheDocument();
    expect(within(form).getByLabelText(/Action Description/)).toHaveAttribute("aria-invalid", "true");
  });

  // UI-12 / AC-04
  it("offers exactly the assignable users from the API", async () => {
    await renderStaff([]);
    const form = await openAddForm();

    const options = Array.from((within(form).getByLabelText(/Assigned to/) as HTMLSelectElement).options).map(
      (option) => option.textContent
    );
    expect(options).toEqual(["Select a person", "Anong Sukjai (Administrator)", "Pimchanok Rattana", "Warin Chaiyaporn"]);
  });

  it("opens Complete as an edit with Completed selected and Result required", async () => {
    const update = vi.spyOn(actionsApi, "updateAction").mockResolvedValue(action({ status: "COMPLETED", result: "Fixed.", version: 3 }));
    await renderStaff([action({ status: "IN_PROGRESS", version: 2 })]);

    await userEvent.click(within(rows()[0]).getByRole("button", { name: "Complete" }));
    const form = screen.getByRole("form", { name: "Edit action" });
    expect(within(form).getByLabelText(/Status/)).toHaveValue("COMPLETED");
    expect(within(form).getByLabelText(/^Result/)).toBeRequired();

    await userEvent.type(within(form).getByLabelText(/^Result/), "Fixed.");
    await userEvent.click(within(form).getByRole("button", { name: "Save action" }));

    expect(update).toHaveBeenCalledWith(1, 2, {
      description: "Checked the print head.",
      status: "COMPLETED",
      assigneeId: WARIN.id,
      followUpRequired: false,
      result: "Fixed.",
      attachmentNotes: "",
    });
  });

  // UI-08 / AC-18
  it("keeps the values and offers Reload latest on STALE_UPDATE", async () => {
    vi.spyOn(actionsApi, "updateAction").mockRejectedValue(
      new ApiError(409, "This action was changed by someone else.", { code: "STALE_UPDATE" })
    );
    await renderStaff([action()]);
    const list = vi.mocked(actionsApi.listActions);

    await userEvent.click(within(rows()[0]).getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit action" });
    const description = within(form).getByLabelText(/Action Description/);
    await userEvent.clear(description);
    await userEvent.type(description, "My unsaved wording.");
    await userEvent.click(within(form).getByRole("button", { name: "Save action" }));

    const warning = await screen.findByText("This action was changed by someone else.");
    expect(warning.closest(".zg-callout")).toHaveClass("zg-callout-warning");
    expect(description).toHaveValue("My unsaved wording.");

    const callsBefore = list.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Reload latest" }));
    await waitFor(() => expect(list.mock.calls.length).toBe(callsBefore + 1));
  });

  // UI-09 / AC-37
  it("shows a safe message and keeps every value on a network failure and on a 500", async () => {
    const create = vi
      .spyOn(actionsApi, "createAction")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new ApiError(500, "Internal error"));
    await renderStaff([]);
    const form = await openAddForm();

    await userEvent.type(within(form).getByLabelText(/Action Description/), "Swap the cable.");
    await userEvent.type(within(form).getByLabelText("Attachment Notes"), "cable.jpg");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await userEvent.click(within(form).getByRole("button", { name: "Save action" }));
      expect(await screen.findByText("The action could not be saved. Please try again.")).toBeInTheDocument();
      expect(within(form).getByLabelText(/Action Description/)).toHaveValue("Swap the cable.");
      expect(within(form).getByLabelText("Attachment Notes")).toHaveValue("cable.jpg");
    }
    expect(create).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Internal error/)).not.toBeInTheDocument();
  });

  // UI-10 / AC-36
  it("sends one request on a double click and shows the busy label", async () => {
    let finish: (value: actionsApi.ActionTaken) => void = () => {};
    const create = vi
      .spyOn(actionsApi, "createAction")
      .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await renderStaff([]);
    const form = await openAddForm();
    await userEvent.type(within(form).getByLabelText(/Action Description/), "Reseat the toner.");

    await userEvent.dblClick(within(form).getByRole("button", { name: "Save action" }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(within(form).getByRole("button", { name: "Saving…" })).toBeDisabled();
    finish(action({ id: 11, description: "Reseat the toner." }));
    expect(await screen.findByText("Action saved.")).toBeInTheDocument();
  });

  it("lets an Administrator add an action", async () => {
    vi.restoreAllMocks();
    signedInAs(ADMINISTRATOR);
    vi.spyOn(staffApi, "getAssignableUsers").mockResolvedValue([{ id: ANONG.id, name: ANONG.name, role: "ADMINISTRATOR" }]);
    await renderStaff([]);

    const form = await openAddForm();
    expect(within(form).getByLabelText("Performed by")).toHaveValue("Anong Sukjai");
  });
});

describe("Cancel an action", () => {
  // UI-05 / AC-08
  it("asks for a reason in a dialog; Escape closes it and returns focus", async () => {
    const update = vi.spyOn(actionsApi, "updateAction").mockResolvedValue(
      action({ status: "CANCELLED", cancelReason: "Duplicate step.", cancelledAt: "2026-10-30T04:00:00.000Z", version: 2 })
    );
    await renderStaff([action()]);
    const cancel = within(rows()[0]).getByRole("button", { name: "Cancel" });

    await userEvent.click(cancel);
    let dialog = screen.getByRole("dialog", { name: "Cancel this action?" });
    expect(within(dialog).getByLabelText(/Reason/)).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cancel).toHaveFocus();

    await userEvent.click(cancel);
    dialog = screen.getByRole("dialog", { name: "Cancel this action?" });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "no");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel action" }));
    expect(update).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/A reason of 3 to 500 characters is required/)).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText(/Reason/));
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Duplicate step.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel action" }));

    expect(update).toHaveBeenCalledWith(1, 1, { status: "CANCELLED", cancelReason: "Duplicate step." });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(rows()[0]).getByText("Cancelled", { selector: ".zg-badge" })).toBeInTheDocument();
  });

  it("keeps focus inside the dialog with Tab", async () => {
    await renderStaff([action()]);
    await userEvent.click(within(rows()[0]).getByRole("button", { name: "Cancel" }));
    const dialog = screen.getByRole("dialog");

    await userEvent.tab();
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "Keep it" })).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog).getByLabelText(/Reason/)).toHaveFocus();
  });
});

describe("Requester Ticket Detail", () => {
  function requesterTicket(): ticketsApi.Ticket {
    const { owner: _owner, comments: _c, notes: _n, itPriority: _p, ...rest } = staffTicket();
    return rest as unknown as ticketsApi.Ticket;
  }

  async function renderRequester(actions: actionsApi.ActionTaken[]) {
    vi.restoreAllMocks();
    signedInAs(REQUESTER);
    vi.spyOn(ticketsApi, "getTicket").mockResolvedValue(requesterTicket());
    vi.spyOn(conversation, "getComments").mockResolvedValue({ comments: [] } as never);
    vi.spyOn(actionsApi, "listActions").mockResolvedValue(actions);

    render(
      <MemoryRouter initialEntries={["/tickets/42"]}>
        <AuthProvider>
          <Routes>
            <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await screen.findByRole("heading", { name: /TKT-2026-000042/ });
    return screen.getByRole("region", { name: "Actions Taken" });
  }

  // UI-11 / AC-13
  it("lists the actions read-only, without controls or internal hints", async () => {
    const section = await renderRequester([
      action({ assignee: PIM, status: "COMPLETED", result: "Printed fine.", followUpRequired: true, followUpNote: "We will check again on Monday." }),
    ]);

    await within(section).findByText("Checked the print head.");
    expect(within(section).getByText("Printed fine.")).toBeInTheDocument();
    expect(within(section).getByText(/We will check again on Monday\./)).toBeInTheDocument();
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
    expect(within(section).queryByText("Not the ticket owner")).not.toBeInTheDocument();
    expect(within(section).queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
  });

  it("shows the Requester empty state", async () => {
    const section = await renderRequester([]);
    expect(await within(section).findByText("No actions have been recorded yet.")).toBeInTheDocument();
  });
});
