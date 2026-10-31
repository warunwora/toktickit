import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as dashboardApi from "../../src/api/dashboard.js";
import * as reference from "../../src/api/reference.js";
import * as ticketsApi from "../../src/api/tickets.js";
import * as staffApi from "../../src/api/staff.js";
import { ApiError } from "../../src/api/client.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import StaffDashboard from "../../src/pages/StaffDashboard.js";
import { AppRoutes } from "../../src/AppRoot.js";
import { ADMINISTRATOR, IT_STAFF, REQUESTER, signedInAs } from "../helpers/auth.js";

// UI-23 … UI-27 — docs/lab-04/tests.md §2.7.

const STATUS_LINKS = Object.fromEntries(
  ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"].map((s) => [
    s,
    `/staff/queue?status=${s}`,
  ])
) as dashboardApi.StaffDashboardData["links"]["byStatus"];

const PRIORITY_LINKS = Object.fromEntries(
  ["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => [p, `/staff/queue?itPriority=${p}&statusGroup=active`])
) as dashboardApi.StaffDashboardData["links"]["byItPriority"];

function data(overrides: Partial<dashboardApi.StaffDashboardData> = {}): dashboardApi.StaffDashboardData {
  return {
    metrics: { unassigned: 4, ownedByMe: 6, myOpenActions: 2, urgentActive: 0 },
    byStatus: {
      NEW: 4,
      OPEN: 2,
      IN_PROGRESS: 5,
      WAITING_FOR_REQUESTER: 2,
      RESOLVED: 3,
      CLOSED: 9,
      REOPENED: 1,
      CANCELLED: 1,
    },
    byItPriority: { LOW: 3, MEDIUM: 6, HIGH: 5, URGENT: 0 },
    myOpenActionsList: [
      {
        id: 31,
        ticketId: 272,
        ticketNumber: "TKT-2026-000272",
        description: "Archive mailbox items older than three years.",
        status: "IN_PROGRESS",
        actionAt: "2026-10-30T03:00:00.000Z",
        link: "/staff/tickets/272?tab=actions",
      },
    ],
    recentlyUpdated: [
      {
        id: 272,
        ticketNumber: "TKT-2026-000272",
        summary: "Outlook freezes when opening large mailboxes",
        status: "IN_PROGRESS",
        itPriority: "HIGH",
        updatedAt: "2026-10-30T03:45:00.000Z",
      },
    ],
    links: {
      unassigned: "/staff/queue?ownerId=unassigned&statusGroup=active",
      ownedByMe: "/staff/queue?ownerId=26&statusGroup=active",
      urgentActive: "/staff/queue?itPriority=URGENT&statusGroup=active",
      recentlyUpdated: "/staff/queue?sort=updatedAt&order=desc",
      byStatus: STATUS_LINKS,
      byItPriority: PRIORITY_LINKS,
    },
    generatedAt: "2026-10-30T04:00:00.000Z",
    ...overrides,
  };
}

const USERS = {
  REQUESTER: { active: 4, inactive: 1, link: "/admin/users?role=REQUESTER" },
  IT_STAFF: { active: 3, inactive: 1, link: "/admin/users?role=IT_STAFF" },
  ADMINISTRATOR: { active: 1, inactive: 0, link: "/admin/users?role=ADMINISTRATOR" },
};

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderDashboard(firstName: string) {
  render(
    <MemoryRouter initialEntries={["/staff/dashboard"]}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/dashboard" element={<StaffDashboard />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  await screen.findByRole("heading", { name: `Welcome back, ${firstName}` });
}

const region = (name: string) => screen.getByRole("region", { name });

describe("IT Staff Dashboard", () => {
  // UI-23 / AC-25
  it("renders the cards, by status, by IT Priority, my open actions and recently updated", async () => {
    signedInAs(IT_STAFF);
    vi.spyOn(dashboardApi, "getStaffDashboard").mockResolvedValue(data());
    await renderDashboard("Warin");

    expect(await within(region("Unassigned")).findByText("4")).toBeInTheDocument();
    expect(within(region("Owned by me")).getByText("6")).toBeInTheDocument();
    expect(within(region("My open actions")).getByText("2")).toBeInTheDocument();
    expect(within(region("Urgent (active)")).getByText("Nothing here right now")).toBeInTheDocument();

    expect(within(region("By status")).getAllByRole("listitem")).toHaveLength(8);
    expect(within(region("By status")).getByText("Closed").parentElement).toHaveTextContent("9");
    expect(within(region("By IT Priority")).getAllByRole("listitem")).toHaveLength(4);

    const actions = region("Open actions assigned to me");
    expect(within(actions).getByRole("link", { name: "TKT-2026-000272" })).toHaveAttribute(
      "href",
      "/staff/tickets/272?tab=actions"
    );
    expect(within(actions).getByText("In Progress")).toBeInTheDocument();
    expect(within(region("Recently updated")).getByRole("link", { name: "TKT-2026-000272" })).toHaveAttribute(
      "href",
      "/staff/tickets/272"
    );
  });

  // UI-24 / AC-26
  it("shows the Users group to an Administrator only", async () => {
    signedInAs(ADMINISTRATOR);
    vi.spyOn(dashboardApi, "getStaffDashboard").mockResolvedValue(data({ users: USERS }));
    await renderDashboard("Anong");

    const users = await screen.findByRole("region", { name: "Users" });
    expect(within(users).getByText("4 active · 1 inactive")).toBeInTheDocument();
    expect(within(users).getByRole("link", { name: "View IT Staff users" })).toHaveAttribute(
      "href",
      "/admin/users?role=IT_STAFF"
    );

    vi.restoreAllMocks();
    document.body.innerHTML = "";
    signedInAs(IT_STAFF);
    vi.spyOn(dashboardApi, "getStaffDashboard").mockResolvedValue(data());
    await renderDashboard("Warin");
    await within(region("Unassigned")).findByText("4");
    expect(screen.queryByRole("region", { name: "Users" })).not.toBeInTheDocument();
  });

  // UI-25 / AC-28
  it("links every View to the documented drill-down URL", async () => {
    signedInAs(IT_STAFF);
    vi.spyOn(dashboardApi, "getStaffDashboard").mockResolvedValue(data());
    await renderDashboard("Warin");
    await within(region("Unassigned")).findByText("4");

    const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href("View unassigned tickets")).toBe("/staff/queue?ownerId=unassigned&statusGroup=active");
    expect(href("View tickets owned by me")).toBe("/staff/queue?ownerId=26&statusGroup=active");
    expect(href("View urgent active tickets")).toBe("/staff/queue?itPriority=URGENT&statusGroup=active");
    expect(href("View Waiting for Requester tickets")).toBe("/staff/queue?status=WAITING_FOR_REQUESTER");
    expect(href("View active high priority tickets")).toBe("/staff/queue?itPriority=HIGH&statusGroup=active");
    expect(href("View all recently updated")).toBe("/staff/queue?sort=updatedAt&order=desc");
  });

  // UI-27 / AC-32
  it("shows safe messages for a failure and for a forbidden answer", async () => {
    signedInAs(IT_STAFF);
    vi.spyOn(dashboardApi, "getStaffDashboard").mockRejectedValue(new TypeError("Failed to fetch"));
    await renderDashboard("Warin");
    expect(await screen.findByText("The dashboard could not be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    vi.restoreAllMocks();
    document.body.innerHTML = "";
    signedInAs(IT_STAFF);
    vi.spyOn(dashboardApi, "getStaffDashboard").mockRejectedValue(new ApiError(403, "Forbidden"));
    await renderDashboard("Warin");
    expect(await screen.findByText("You do not have access to this dashboard.")).toBeInTheDocument();
  });
});

describe("navigation and landing (UI-26 / AC-34)", () => {
  function renderApp(path: string) {
    vi.spyOn(dashboardApi, "getRequesterDashboard").mockResolvedValue({
      metrics: { open: 0, waitingForMe: 0, resolved: 0, closed: 0 },
      recentlyUpdated: [],
      recentlyResolved: [],
      links: {
        open: "/tickets?statusGroup=active",
        waitingForMe: "/tickets?status=WAITING_FOR_REQUESTER",
        resolved: "/tickets?status=RESOLVED",
        closed: "/tickets?status=CLOSED",
        recentlyUpdated: "/tickets?sort=updatedAt&order=desc",
      },
      generatedAt: "2026-10-30T04:00:00.000Z",
    });
    vi.spyOn(dashboardApi, "getStaffDashboard").mockResolvedValue(data());
    vi.spyOn(reference, "getCategories").mockResolvedValue([]);
    vi.spyOn(reference, "getRelatedSystems").mockResolvedValue([]);
    vi.spyOn(ticketsApi, "listTickets").mockResolvedValue({ items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 1 });
    vi.spyOn(staffApi, "getQueue").mockResolvedValue({ tickets: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 1 });
    return render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );
  }

  it("lands each role on its dashboard with Dashboard first and marked current", async () => {
    const cases = [
      [REQUESTER, "Napat", ["Dashboard", "My Tickets", "Create Ticket", "Account"]],
      [IT_STAFF, "Warin", ["Dashboard", "Ticket Queue", "Account"]],
      [ADMINISTRATOR, "Anong", ["Dashboard", "Ticket Queue", "Users", "Account"]],
    ] as const;

    for (const [user, firstName, nav] of cases) {
      signedInAs(user);
      const view = renderApp("/");
      await screen.findByRole("heading", { name: `Welcome back, ${firstName}` });

      const links = within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(nav);
      expect(links[0]).toHaveAttribute("aria-current", "page");
      view.unmount();
      vi.restoreAllMocks();
    }
  });

  it("sends a role opening another role's dashboard to its own", async () => {
    signedInAs(REQUESTER);
    renderApp("/staff/dashboard");
    expect(await screen.findByRole("heading", { name: "Welcome back, Napat" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View open tickets" })).toBeInTheDocument();
  });

  it("opens My Tickets with the active group a dashboard link carries", async () => {
    signedInAs(REQUESTER);
    renderApp("/tickets?statusGroup=active");
    await screen.findByRole("heading", { name: "My Tickets" });
    expect(screen.getByLabelText("Status")).toHaveValue("active");
    expect(vi.mocked(ticketsApi.listTickets).mock.calls.at(-1)?.[0]).toMatchObject({ statusGroup: "active", status: "" });
  });

  it("opens the queue with the owner and active group a dashboard link carries", async () => {
    signedInAs(IT_STAFF);
    renderApp("/staff/queue?ownerId=26&statusGroup=active");
    await screen.findByRole("heading", { name: "Ticket Queue" });
    expect(screen.getByLabelText("Owner")).toHaveValue("26");
    expect(screen.getByLabelText("Status")).toHaveValue("active");
    expect(vi.mocked(staffApi.getQueue).mock.calls.at(-1)?.[0]).toMatchObject({ ownerId: 26, statusGroup: "active" });
  });
});
