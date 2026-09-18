import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as authApi from "../../src/api/auth.js";
import * as reference from "../../src/api/reference.js";
import * as ticketsApi from "../../src/api/tickets.js";
import * as staffApi from "../../src/api/staff.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRoutes } from "../../src/AppRoot.js";
import { ADMINISTRATOR, IT_STAFF, REQUESTER, signedInAs } from "../helpers/auth.js";

// UI-12 … UI-15 — docs/lab-03/tests.md §2.9

afterEach(() => {
  vi.restoreAllMocks();
});

function renderApp(path: string) {
  vi.spyOn(reference, "getCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
  vi.spyOn(reference, "getRelatedSystems").mockResolvedValue([{ id: 7, name: "Corporate Laptop" }]);
  vi.spyOn(staffApi, "getQueue").mockResolvedValue({
    tickets: [],
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
  });
  vi.spyOn(ticketsApi, "listTickets").mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
  });

  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("role-aware application shell", () => {
  // UI-12 / AC-18
  it("shows a Requester only the Requester destinations", async () => {
    signedInAs(REQUESTER);
    renderApp("/tickets");

    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "My Tickets" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Create Ticket" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Account" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /ticket queue/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /user management/i })).not.toBeInTheDocument();
  });

  // UI-12 / AC-18
  it("shows IT Staff and Administrators no Requester destinations", async () => {
    for (const user of [IT_STAFF, ADMINISTRATOR]) {
      signedInAs(user);
      const view = renderApp("/account");

      const nav = await screen.findByRole("navigation", { name: "Main" });
      expect(within(nav).queryByRole("link", { name: "My Tickets" })).not.toBeInTheDocument();
      expect(within(nav).queryByRole("link", { name: "Create Ticket" })).not.toBeInTheDocument();
      expect(within(nav).getByRole("link", { name: "Ticket Queue" })).toBeInTheDocument();
      expect(within(nav).getByRole("link", { name: "Account" })).toBeInTheDocument();

      view.unmount();
      vi.restoreAllMocks();
    }
  });

  // UI-13 / AC-18
  it("shows the authenticated name and role, and no trace of the Development Requester selector", async () => {
    signedInAs(IT_STAFF);
    renderApp("/account");

    const header = within(await screen.findByRole("banner"));
    expect(header.getByText(/Warin Chaiyaporn/)).toBeInTheDocument();
    expect(header.getByText("IT Staff")).toBeInTheDocument();
    expect(screen.queryByText(/Development Requester/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change requester/i })).not.toBeInTheDocument();
  });

  // UI-14 / AC-07
  it("logs out and returns to the login screen", async () => {
    signedInAs(REQUESTER);
    const logout = vi.spyOn(authApi, "logout").mockResolvedValue(undefined);
    renderApp("/tickets");

    await userEvent.click(await screen.findByRole("button", { name: "Logout" }));

    expect(logout).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { name: "Sign in to your account" })).toBeInTheDocument();
  });

  // UI-15 / AC-18
  it("redirects a role away from a destination it may not use", async () => {
    signedInAs(IT_STAFF);
    renderApp("/tickets");

    expect(await screen.findByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "My Tickets" })).not.toBeInTheDocument();
  });

  it("keeps a Requester out of the staff queue", async () => {
    signedInAs(REQUESTER);
    renderApp("/staff/queue");

    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ticket Queue" })).not.toBeInTheDocument();
  });

  // AC-12 / AC-07 — an unauthenticated visit never reaches an application screen
  it("sends an unauthenticated visitor to the login screen", async () => {
    signedInAs(null);
    renderApp("/tickets");

    expect(await screen.findByRole("heading", { name: "Sign in to your account" })).toBeInTheDocument();
  });

  it("sends the root path to the landing screen of the signed-in role", async () => {
    signedInAs(REQUESTER);
    renderApp("/");

    await waitFor(() => expect(screen.getByRole("heading", { name: "My Tickets" })).toBeInTheDocument());
  });
});
