import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as ticketsApi from "../../src/api/tickets.js";
import * as conversation from "../../src/api/conversation.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import RequesterTicketDetail from "../../src/pages/RequesterTicketDetail.js";
import { REQUESTER, signedInAs } from "../helpers/auth.js";

// UI-32 … UI-35 — docs/lab-03/tests.md §2.9

function ticket(overrides: Partial<ticketsApi.Ticket> = {}): ticketsApi.Ticket {
  return {
    id: 42,
    ticketNumber: "TKT-2026-000042",
    status: "IN_PROGRESS",
    requestedPriority: "HIGH",
    summary: "Cannot connect to the VPN from home",
    description: "The VPN client reports a certificate error every evening after 18:00.",
    itPriority: "MEDIUM",
    requester: { id: 1, name: "Napat Srisai" },
    owner: { id: 26, name: "Warin Chaiyaporn" },
    resolutionSummary: null,
    requesterResolvedAt: null,
    category: { id: 4, name: "Network" },
    relatedSystem: { id: 3, name: "VPN" },
    createdAt: "2026-09-10T02:14:55.000Z",
    updatedAt: "2026-09-12T08:02:11.000Z",
    attachments: [],
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
  signedInAs(REQUESTER);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderDetail(
  loaded: ticketsApi.Ticket = ticket(),
  comments: conversation.ConversationEntry[] = []
) {
  vi.spyOn(ticketsApi, "getTicket").mockResolvedValue(loaded);
  vi.spyOn(conversation, "getComments").mockResolvedValue({ comments });

  const view = render(
    <MemoryRouter initialEntries={[`/tickets/${loaded.id}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
          <Route path="/tickets" element={<h1>My Tickets</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );

  await screen.findByRole("heading", { name: loaded.ticketNumber });
  return view;
}

describe("Requester Public Comments", () => {
  // UI-32 / AC-21
  it("renders each comment with its author, role badge, time and body", async () => {
    await renderDetail(ticket(), [
      entry({ id: 1, body: "We are investigating the issue on your device." }),
      entry({
        id: 2,
        body: "Thank you, it is still failing.",
        author: { id: 1, name: "Napat Srisai", role: "REQUESTER" },
      }),
    ]);

    const thread = await screen.findByRole("region", { name: "Public Comments" });
    expect(within(thread).getByText("We are investigating the issue on your device.")).toBeInTheDocument();
    expect(within(thread).getByText("Thank you, it is still failing.")).toBeInTheDocument();
    expect(within(thread).getByText("Warin Chaiyaporn")).toBeInTheDocument();
    expect(within(thread).getByText("IT Staff")).toBeInTheDocument();
    expect(within(thread).getByText("Requester")).toBeInTheDocument();
    expect(thread.querySelectorAll("time")).toHaveLength(2);
  });

  it("shows the empty state when the thread has no comments", async () => {
    await renderDetail();
    const thread = await screen.findByRole("region", { name: "Public Comments" });
    expect(within(thread).getByText("No comments yet.")).toBeInTheDocument();
  });

  it("posts a comment and appends it to the thread", async () => {
    const post = vi
      .spyOn(conversation, "postComment")
      .mockResolvedValue(entry({ id: 9, body: "It works again, thank you." }));

    await renderDetail();
    const thread = await screen.findByRole("region", { name: "Public Comments" });

    await userEvent.type(within(thread).getByLabelText("Add a comment"), "It works again, thank you.");
    await userEvent.click(within(thread).getByRole("button", { name: "Post Comment" }));

    expect(post).toHaveBeenCalledWith(42, "It works again, thank you.");
    expect(await within(thread).findByText("It works again, thank you.")).toBeInTheDocument();
    expect((within(thread).getByLabelText("Add a comment") as HTMLTextAreaElement).value).toBe("");
  });

  // UI-33 / AC-22
  it("blocks a whitespace-only comment without sending a request", async () => {
    const post = vi.spyOn(conversation, "postComment");

    await renderDetail();
    const thread = await screen.findByRole("region", { name: "Public Comments" });

    await userEvent.type(within(thread).getByLabelText("Add a comment"), "   ");
    await userEvent.click(within(thread).getByRole("button", { name: "Post Comment" }));

    expect(await within(thread).findByText("Comment is required")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});

describe("The problem appears resolved", () => {
  // UI-34 / AC-23
  it("confirms, sends, then reports it without changing the status", async () => {
    const mark = vi.spyOn(conversation, "markProblemResolved").mockResolvedValue({
      id: 42,
      ticketNumber: "TKT-2026-000042",
      status: "IN_PROGRESS",
      requesterResolvedAt: "2026-09-13T01:00:00.000Z",
      updatedAt: "2026-09-13T01:00:00.000Z",
    });

    await renderDetail();
    await userEvent.click(screen.getByRole("button", { name: "The problem appears resolved" }));

    const dialog = screen.getByRole("dialog");
    expect(mark).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Yes, tell IT Staff" }));

    expect(mark).toHaveBeenCalledWith(42);
    expect(
      await screen.findByText("You told IT Staff that this problem appears resolved.")
    ).toBeInTheDocument();
    // The status badge is untouched: only IT Staff resolve a ticket (BR-40).
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "The problem appears resolved" })
      ).not.toBeInTheDocument()
    );
  });

  it("sends nothing when the confirmation is cancelled", async () => {
    const mark = vi.spyOn(conversation, "markProblemResolved");

    await renderDetail();
    await userEvent.click(screen.getByRole("button", { name: "The problem appears resolved" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(mark).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "The problem appears resolved" })).toBeInTheDocument();
  });

  it("offers the action only while the indication has not been given", async () => {
    await renderDetail(ticket({ requesterResolvedAt: "2026-09-13T01:00:00.000Z" }));

    expect(screen.queryByRole("button", { name: "The problem appears resolved" })).not.toBeInTheDocument();
    expect(screen.getByText("You told IT Staff that this problem appears resolved.")).toBeInTheDocument();
  });
});

describe("Internal Notes are invisible to a Requester", () => {
  // UI-35 / AC-14
  it("renders no note tab, section, composer or text anywhere on the screen", async () => {
    const { container } = await renderDetail(ticket(), [entry()]);

    expect(screen.queryByRole("region", { name: "Internal Notes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Internal Notes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Internal Note" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add an internal note")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/internal note/i);
    expect(container.querySelector(".zg-notes")).toBeNull();
  });
});
