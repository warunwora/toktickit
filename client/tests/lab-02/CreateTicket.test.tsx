import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as reference from "../../src/api/reference.js";
import * as tickets from "../../src/api/tickets.js";
import * as attachments from "../../src/api/attachments.js";
import { ApiError, REQUESTER_STORAGE_KEY } from "../../src/api/client.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import CreateTicket from "../../src/pages/CreateTicket.js";

// UI-04 … UI-08 — docs/lab-02/tests.md §2.3

const REQUESTERS = [
  { id: 1, name: "Napat Srisai", email: "napat.sri@kmutt.ac.th", department: "Faculty of Engineering" },
];
const CATEGORIES = [
  { id: 1, name: "Account and Access" },
  { id: 2, name: "Hardware" },
];
const RELATED_SYSTEMS = [
  { id: 6, name: "Printer" },
  { id: 7, name: "Corporate Laptop" },
];

const VALID_DESCRIPTION =
  "The laptop discharges from full to empty within an hour even when it is idle on the desk.";

function createdTicket(overrides: Partial<tickets.Ticket> = {}): tickets.Ticket {
  return {
    id: 42,
    ticketNumber: "TKT-2026-000042",
    status: "NEW",
    requestedPriority: "MEDIUM",
    summary: "Laptop battery drains fast",
    description: VALID_DESCRIPTION,
    requester: { id: 1, name: "Napat Srisai" },
    category: { id: 2, name: "Hardware" },
    relatedSystem: { id: 7, name: "Corporate Laptop" },
    createdAt: "2026-08-12T04:11:20.310Z",
    updatedAt: "2026-08-12T04:11:20.310Z",
    attachments: [],
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

function renderCreateTicket() {
  return render(
    <MemoryRouter initialEntries={["/tickets/new"]}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/new" element={<CreateTicket />} />
          <Route path="/tickets/:id" element={<h1>Ticket Detail</h1>} />
          <Route path="/tickets" element={<h1>My Tickets</h1>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

async function fillValidForm() {
  await userEvent.selectOptions(await screen.findByLabelText(/^Category/), "2");
  await userEvent.selectOptions(screen.getByLabelText(/^Related System/), "7");
  await userEvent.selectOptions(screen.getByLabelText(/^Requested Priority/), "MEDIUM");
  await userEvent.type(screen.getByLabelText(/^Summary/), "Laptop battery drains fast");
  await userEvent.type(screen.getByLabelText(/^Description/), VALID_DESCRIPTION);
}

describe("Create Ticket", () => {
  // UI-08 / AC-15
  it("loads Category and Related System options from the API", async () => {
    renderCreateTicket();

    expect(await screen.findByRole("option", { name: "Hardware" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Corporate Laptop" })).toBeInTheDocument();
    expect(reference.getCategories).toHaveBeenCalled();
    expect(reference.getRelatedSystems).toHaveBeenCalled();
  });

  // ui-spec §7.2 — system-generated values are read-only (BR-04)
  it("shows Ticket Number, Ticket Date and Requester as read-only fields", async () => {
    renderCreateTicket();

    const ticketNumber = await screen.findByLabelText(/Ticket Number/);
    expect(ticketNumber).toHaveAttribute("readonly");
    expect(ticketNumber).toHaveValue("Will be generated on submit");
    expect(screen.getByLabelText(/Ticket Date/)).toHaveAttribute("readonly");

    const requesterField = screen.getByLabelText(/^Requester/);
    expect(requesterField).toHaveAttribute("readonly");
    await waitFor(() => expect(requesterField).toHaveValue("Napat Srisai"));
  });

  // UI-04 / AC-09, AC-37
  it("shows a field-level message and sends no request when Summary is empty", async () => {
    const createSpy = vi.spyOn(tickets, "createTicket");
    renderCreateTicket();

    await userEvent.selectOptions(await screen.findByLabelText(/^Category/), "2");
    await userEvent.selectOptions(screen.getByLabelText(/^Related System/), "7");
    await userEvent.selectOptions(screen.getByLabelText(/^Requested Priority/), "MEDIUM");
    await userEvent.type(screen.getByLabelText(/^Description/), VALID_DESCRIPTION);

    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    const summary = screen.getByLabelText(/^Summary/);
    expect(summary).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Summary is required")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  // UI-04 / AC-10 boundary
  it("reports a too-short Summary and Description before calling the API", async () => {
    const createSpy = vi.spyOn(tickets, "createTicket");
    renderCreateTicket();

    await userEvent.selectOptions(await screen.findByLabelText(/^Category/), "2");
    await userEvent.selectOptions(screen.getByLabelText(/^Related System/), "7");
    await userEvent.selectOptions(screen.getByLabelText(/^Requested Priority/), "LOW");
    await userEvent.type(screen.getByLabelText(/^Summary/), "too short");
    await userEvent.type(screen.getByLabelText(/^Description/), "still too short");

    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(screen.getByText(/Summary must be at least 10 characters/)).toBeInTheDocument();
    expect(screen.getByText(/Description must be at least 20 characters/)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  // UI-05 / AC-11
  it("disables Submit and shows a busy label while the request is in flight", async () => {
    let resolve!: (ticket: tickets.Ticket) => void;
    vi.spyOn(tickets, "createTicket").mockReturnValue(
      new Promise<tickets.Ticket>((r) => (resolve = r))
    );

    renderCreateTicket();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    const busyButton = screen.getByRole("button", { name: /submitting/i });
    expect(busyButton).toBeDisabled();

    resolve(createdTicket());
    expect(await screen.findByText("TKT-2026-000042")).toBeInTheDocument();
  });

  // UI-06 / AC-07
  it("shows the ticket number returned by the backend and a next action", async () => {
    vi.spyOn(tickets, "createTicket").mockResolvedValue(createdTicket());

    renderCreateTicket();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByText("TKT-2026-000042")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view ticket/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create another/i })).toBeInTheDocument();
  });

  it("sends the trimmed values the API contract expects", async () => {
    const createSpy = vi.spyOn(tickets, "createTicket").mockResolvedValue(createdTicket());

    renderCreateTicket();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith({
        categoryId: 2,
        relatedSystemId: 7,
        requestedPriority: "MEDIUM",
        summary: "Laptop battery drains fast",
        description: VALID_DESCRIPTION,
      })
    );
  });

  // UI-07 / AC-12, BR-20
  it("keeps every entered value when the API call fails", async () => {
    vi.spyOn(tickets, "createTicket").mockRejectedValue(new Error("network down"));

    renderCreateTicket();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to reach toktickit api/i);
    expect(screen.getByLabelText(/^Summary/)).toHaveValue("Laptop battery drains fast");
    expect(screen.getByLabelText(/^Description/)).toHaveValue(VALID_DESCRIPTION);
    expect(screen.getByLabelText(/^Category/)).toHaveValue("2");
    expect(screen.getByLabelText(/^Requested Priority/)).toHaveValue("MEDIUM");
  });

  // BR-17 — backend field errors are shown next to their own field
  it("maps backend field errors onto the matching fields", async () => {
    vi.spyOn(tickets, "createTicket").mockRejectedValue(
      new ApiError(400, "Validation failed", [
        { field: "summary", message: "Summary must be at least 10 characters" },
      ])
    );

    renderCreateTicket();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByText("Summary must be at least 10 characters")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Summary/)).toHaveAttribute("aria-invalid", "true");
  });

  // AC-13 — the duplicate answer from the backend is surfaced, not swallowed
  it("shows the duplicate-submission message from the backend", async () => {
    vi.spyOn(tickets, "createTicket").mockRejectedValue(
      new ApiError(409, "This ticket looks like a duplicate submission")
    );

    renderCreateTicket();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/duplicate submission/i);
  });

  it("shows a retryable failure state when reference data cannot be loaded", async () => {
    vi.spyOn(reference, "getCategories").mockRejectedValue(new Error("down"));

    renderCreateTicket();

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load categories/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  // UI-09 / AC-14, BR-31, BR-32
  it("rejects an invalid attachment by name and keeps the valid one selected", async () => {
    renderCreateTicket();

    const picker = await screen.findByLabelText(/^Attachments/);
    const validFile = new File([new Uint8Array(1024)], "evidence.png", { type: "image/png" });
    const oversized = new File([new Uint8Array(8)], "huge.png", { type: "image/png" });
    Object.defineProperty(oversized, "size", { value: 6 * 1024 * 1024 });

    fireEvent.change(picker, {
      target: {
        files: [
          validFile,
          oversized,
          new File(["MZ"], "setup.exe", { type: "application/x-msdownload" }),
        ],
      },
    });

    expect(await screen.findByText(/huge\.png: each file must be 5 MB or smaller/i)).toBeInTheDocument();
    expect(screen.getByText(/setup\.exe: only JPG, PNG, WEBP and PDF/i)).toBeInTheDocument();
    expect(screen.getByText("evidence.png")).toBeInTheDocument();
  });

  // BR-41 — an attachment failure never rolls back a saved ticket
  it("keeps the created ticket and reports the file when an upload fails", async () => {
    vi.spyOn(tickets, "createTicket").mockResolvedValue(createdTicket());
    vi.spyOn(attachments, "uploadAttachment").mockRejectedValue(new Error("upload down"));

    renderCreateTicket();
    await fillValidForm();

    fireEvent.change(screen.getByLabelText(/^Attachments/), {
      target: { files: [new File([new Uint8Array(16)], "evidence.png", { type: "image/png" })] },
    });

    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    expect(await screen.findByText("TKT-2026-000042")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/some attachments did not upload/i);
    expect(screen.getByText(/evidence\.png/)).toBeInTheDocument();
  });

  it("uploads each selected attachment after the ticket is created", async () => {
    vi.spyOn(tickets, "createTicket").mockResolvedValue(createdTicket());
    const uploadSpy = vi.spyOn(attachments, "uploadAttachment").mockResolvedValue({
      id: 5,
      ticketId: 42,
      originalFilename: "evidence.png",
      mimeType: "image/png",
      sizeBytes: 16,
      uploadedAt: "2026-08-12T04:20:10.004Z",
      uploadedBy: { id: 1, name: "Napat Srisai" },
      state: "ACTIVE",
    });

    renderCreateTicket();
    await fillValidForm();

    fireEvent.change(screen.getByLabelText(/^Attachments/), {
      target: { files: [new File([new Uint8Array(16)], "evidence.png", { type: "image/png" })] },
    });

    await userEvent.click(screen.getByRole("button", { name: /submit ticket/i }));

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledWith(42, expect.any(File)));
    expect(await screen.findByText("TKT-2026-000042")).toBeInTheDocument();
  });
});
