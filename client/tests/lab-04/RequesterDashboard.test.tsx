import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as dashboardApi from "../../src/api/dashboard.js";
import { ApiError } from "../../src/api/client.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import RequesterDashboard from "../../src/pages/RequesterDashboard.js";
import { REQUESTER, signedInAs } from "../helpers/auth.js";

// UI-19 … UI-22 — docs/lab-04/tests.md §2.7.

const LINKS = {
  open: "/tickets?statusGroup=active",
  waitingForMe: "/tickets?status=WAITING_FOR_REQUESTER",
  resolved: "/tickets?status=RESOLVED",
  closed: "/tickets?status=CLOSED",
  recentlyUpdated: "/tickets?sort=updatedAt&order=desc",
};

function data(overrides: Partial<dashboardApi.RequesterDashboardData> = {}): dashboardApi.RequesterDashboardData {
  return {
    metrics: { open: 3, waitingForMe: 1, resolved: 2, closed: 7 },
    recentlyUpdated: [
      {
        id: 281,
        ticketNumber: "TKT-2026-000281",
        summary: "Label printer prints blank labels",
        status: "IN_PROGRESS",
        updatedAt: "2026-10-30T03:45:00.000Z",
      },
    ],
    recentlyResolved: [
      {
        id: 270,
        ticketNumber: "TKT-2026-000270",
        summary: "VPN certificate expired",
        status: "RESOLVED",
        updatedAt: "2026-10-29T01:00:00.000Z",
        resolvedAt: "2026-10-29T01:00:00.000Z",
      },
    ],
    links: LINKS,
    generatedAt: "2026-10-30T04:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  signedInAs(REQUESTER);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderDashboard() {
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <Routes>
          <Route path="/dashboard" element={<RequesterDashboard />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  await screen.findByRole("heading", { name: "Welcome back, Napat" });
}

const card = (label: string) => screen.getByRole("region", { name: label });

describe("Requester Dashboard", () => {
  // UI-19 / AC-24
  it("renders four cards and two lists from the API, with Bangkok times", async () => {
    vi.spyOn(dashboardApi, "getRequesterDashboard").mockResolvedValue(data());
    await renderDashboard();

    expect(await within(card("Open tickets")).findByText("3")).toBeInTheDocument();
    expect(within(card("Waiting for me")).getByText("1")).toBeInTheDocument();
    expect(within(card("Resolved")).getByText("2")).toBeInTheDocument();
    expect(within(card("Closed")).getByText("7")).toBeInTheDocument();

    const updated = screen.getByRole("region", { name: "Recently updated" });
    expect(within(updated).getByRole("link", { name: "TKT-2026-000281" })).toHaveAttribute("href", "/tickets/281");
    expect(within(updated).getByText("In Progress")).toBeInTheDocument();
    // 03:45 UTC is 10:45 in Bangkok.
    expect(within(updated).getByText(/30 Oct 2026, 10:45/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Recently resolved" })).getByText("TKT-2026-000270")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Create Ticket" })).toHaveAttribute("href", "/tickets/new");
  });

  // UI-20 / AC-27
  it("shows 0 with 'Nothing here right now' and empty list messages", async () => {
    vi.spyOn(dashboardApi, "getRequesterDashboard").mockResolvedValue(
      data({ metrics: { open: 0, waitingForMe: 0, resolved: 0, closed: 0 }, recentlyUpdated: [], recentlyResolved: [] })
    );
    await renderDashboard();

    expect(await within(card("Waiting for me")).findByText("0")).toBeInTheDocument();
    expect(screen.getAllByText("Nothing here right now")).toHaveLength(4);
    expect(screen.getAllByText("No recent tickets.")).toHaveLength(2);
    expect(within(card("Waiting for me")).getByRole("link", { name: "View tickets waiting for me" })).toBeInTheDocument();
  });

  // UI-21 / AC-28
  it("links every card and View all to the documented drill-down URL", async () => {
    vi.spyOn(dashboardApi, "getRequesterDashboard").mockResolvedValue(data());
    await renderDashboard();
    await within(card("Open tickets")).findByText("3");

    const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href("View open tickets")).toBe(LINKS.open);
    expect(href("View tickets waiting for me")).toBe(LINKS.waitingForMe);
    expect(href("View resolved tickets")).toBe(LINKS.resolved);
    expect(href("View closed tickets")).toBe(LINKS.closed);
    expect(href("View all recently updated")).toBe(LINKS.recentlyUpdated);
  });

  // UI-22 / AC-32
  it("shows a busy skeleton, then a safe failure with Retry that reloads", async () => {
    let fail: (reason: unknown) => void = () => {};
    const load = vi
      .spyOn(dashboardApi, "getRequesterDashboard")
      .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
      .mockResolvedValueOnce(data());
    await renderDashboard();

    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
    expect(screen.getByLabelText("Open tickets loading")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();

    fail(new ApiError(500, "relation \"Ticket\" does not exist"));
    expect(await screen.findByText("The dashboard could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText(/relation/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await within(card("Open tickets")).findByText("3")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
