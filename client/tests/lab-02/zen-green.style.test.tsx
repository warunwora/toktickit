import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as reference from "../../src/api/reference.js";
import * as ticketsApi from "../../src/api/tickets.js";
import { REQUESTER_STORAGE_KEY } from "../../src/api/client.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import CreateTicket from "../../src/pages/CreateTicket.js";
import MyTickets from "../../src/pages/MyTickets.js";

// STYLE-01 … STYLE-05 — docs/lab-02/tests.md §2.4, ui-spec.md §3–§8

const REQUESTERS = [
  { id: 1, name: "Napat Srisai", email: "napat.sri@kmutt.ac.th", department: "Faculty of Engineering" },
];

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");
  vi.spyOn(reference, "getRequesters").mockResolvedValue(REQUESTERS);
  vi.spyOn(reference, "getCategories").mockResolvedValue([{ id: 2, name: "Hardware" }]);
  vi.spyOn(reference, "getRelatedSystems").mockResolvedValue([{ id: 7, name: "Corporate Laptop" }]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderCreateTicket() {
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <CreateTicket />
      </RequesterProvider>
    </MemoryRouter>
  );
}

describe("Zen Green form styling", () => {
  // STYLE-01 / AC-36
  it("styles read-only fields differently from editable fields", async () => {
    renderCreateTicket();

    const ticketNumber = await screen.findByLabelText(/Ticket Number/);
    expect(ticketNumber.className).toContain("zg-readonly");
    expect(ticketNumber).toHaveAttribute("aria-readonly", "true");

    const summary = screen.getByLabelText(/^Summary/);
    expect(summary.className).toContain("zg-input");
    expect(summary.className).not.toContain("zg-readonly");
    expect(summary).not.toHaveAttribute("readonly");
  });

  // STYLE-02 / AC-37, ui-spec §4
  it("marks required fields with an asterisk and still shows a message below the field", async () => {
    renderCreateTicket();

    const summaryLabel = (await screen.findByText(/^Summary/)).closest("label")!;
    const asterisk = within(summaryLabel).getByText("*");
    expect(asterisk).toHaveAttribute("aria-hidden", "true");
    expect(asterisk.className).toContain("zg-required");

    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    const message = screen.getByText("Summary is required");
    expect(message.className).toContain("zg-message-error");
    expect(message).toHaveAttribute("id", "summary-error");

    const summary = screen.getByLabelText(/^Summary/);
    expect(summary).toHaveAttribute("aria-describedby", "summary-error");
    expect(summary.className).toContain("zg-invalid");
  });

  // STYLE-03 / ui-spec §5
  it("uses the documented button hierarchy and disables the busy submit", async () => {
    let resolve!: (ticket: ticketsApi.Ticket) => void;
    vi.spyOn(ticketsApi, "createTicket").mockReturnValue(
      new Promise<ticketsApi.Ticket>((r) => (resolve = r))
    );

    renderCreateTicket();

    const submit = await screen.findByRole("button", { name: /submit ticket/i });
    expect(submit.className).toContain("zg-btn-primary");
    expect(screen.getByRole("link", { name: /cancel/i }).className).toContain("zg-btn-secondary");

    await userEvent.selectOptions(screen.getByLabelText(/^Category/), "2");
    await userEvent.selectOptions(screen.getByLabelText(/^Related System/), "7");
    await userEvent.selectOptions(screen.getByLabelText(/^Requested Priority/), "MEDIUM");
    await userEvent.type(screen.getByLabelText(/^Summary/), "Laptop battery drains fast");
    await userEvent.type(
      screen.getByLabelText(/^Description/),
      "The laptop discharges from full to empty within an hour even when idle."
    );
    await userEvent.click(submit);

    const busy = screen.getByRole("button", { name: /submitting/i });
    expect(busy).toBeDisabled();

    resolve({
      id: 1,
      ticketNumber: "TKT-2026-000001",
      status: "NEW",
      requestedPriority: "MEDIUM",
      summary: "Laptop battery drains fast",
      description: "…",
      requester: { id: 1, name: "Napat Srisai" },
      category: { id: 2, name: "Hardware" },
      relatedSystem: { id: 7, name: "Corporate Laptop" },
      createdAt: "2026-08-12T04:11:20.310Z",
      updatedAt: "2026-08-12T04:11:20.310Z",
      attachments: [],
    });
    expect(await screen.findByText("TKT-2026-000001")).toBeInTheDocument();
  });
});

describe("Zen Green badges and accessibility hooks", () => {
  // STYLE-04 / AC-38
  it("conveys priority and status as text, not colour alone", async () => {
    vi.spyOn(ticketsApi, "listTickets").mockResolvedValue({
      items: [
        {
          id: 42,
          ticketNumber: "TKT-2026-000042",
          summary: "Laptop battery drains fast",
          category: { id: 2, name: "Hardware" },
          relatedSystem: { id: 7, name: "Corporate Laptop" },
          requestedPriority: "URGENT",
          status: "NEW",
          attachmentCount: 0,
          createdAt: "2026-08-12T04:11:20.310Z",
          updatedAt: "2026-08-12T04:11:20.310Z",
        },
      ],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });

    render(
      <MemoryRouter>
        <RequesterProvider>
          <MyTickets />
        </RequesterProvider>
      </MemoryRouter>
    );

    const table = await screen.findByRole("table");
    const priority = within(table).getByText("Urgent");
    const status = within(table).getByText("New");

    expect(priority.className).toContain("zg-badge-priority-urgent");
    expect(status.className).toContain("zg-badge-status-new");
    expect(priority.textContent?.trim()).toBe("Urgent");
    expect(status.textContent?.trim()).toBe("New");
  });

  // STYLE-05 / AC-39, AC-40
  it("labels every control and marks invalid fields for assistive technology", async () => {
    renderCreateTicket();

    for (const label of [/^Category/, /^Related System/, /^Requested Priority/, /^Summary/, /^Description/]) {
      expect(await screen.findByLabelText(label)).toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    const category = screen.getByLabelText(/^Category/);
    expect(category).toHaveAttribute("aria-invalid", "true");
    expect(category).toHaveAttribute("aria-describedby", "categoryId-error");
    expect(category).toHaveAttribute("aria-required", "true");
  });
});
