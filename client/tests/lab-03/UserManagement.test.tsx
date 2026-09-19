import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as adminApi from "../../src/api/admin.js";
import { ApiError } from "../../src/api/client.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import UserManagement from "../../src/pages/UserManagement.js";
import { ADMINISTRATOR, signedInAs } from "../helpers/auth.js";

// UI-36 … UI-44 — docs/lab-03/tests.md §2.9

function managed(overrides: Partial<adminApi.ManagedUser> = {}): adminApi.ManagedUser {
  return {
    id: 1,
    name: "Napat Srisai",
    email: "napat.sri@kmutt.ac.th",
    role: "REQUESTER",
    isActive: true,
    mustChangePassword: false,
    createdAt: "2026-09-01T04:00:00.000Z",
    ...overrides,
  };
}

const ROSTER = [
  managed(),
  managed({ id: 26, name: "Warin Chaiyaporn", email: "warin.cha@kmutt.ac.th", role: "IT_STAFF" }),
  managed({
    id: 29,
    name: "Ratchanon Duangdee",
    email: "ratchanon.dua@kmutt.ac.th",
    role: "IT_STAFF",
    isActive: false,
  }),
  managed({ id: 30, name: "Anong Sukjai", email: "anong.suk@kmutt.ac.th", role: "ADMINISTRATOR" }),
];

beforeEach(() => {
  signedInAs(ADMINISTRATOR);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderScreen(users: adminApi.ManagedUser[] = ROSTER) {
  const listUsers = vi.spyOn(adminApi, "listUsers").mockResolvedValue(users);

  const view = render(
    <MemoryRouter initialEntries={["/admin/users"]}>
      <AuthProvider>
        <Routes>
          <Route path="/admin/users" element={<UserManagement />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );

  await screen.findByRole("heading", { name: "Users" });
  await waitFor(() => expect(listUsers).toHaveBeenCalled());
  return { ...view, listUsers };
}

/** The last query the screen sent. */
function lastQuery(spy: { mock: { calls: unknown[][] } }): adminApi.UserListQuery {
  return spy.mock.calls.at(-1)?.[0] as adminApi.UserListQuery;
}

function table() {
  return screen.getAllByRole("table")[0];
}

/**
 * The desktop table and the mobile card list are both in the DOM — CSS decides
 * which one is shown, and jsdom applies no CSS — so an Edit action is always
 * taken from the table.
 */
function editButton(name: string) {
  return within(table()).getByRole("button", { name: `Edit ${name}` });
}

describe("User list", () => {
  // UI-36 / AC-40
  it("shows name, email, role badge, status badge and an Edit action per row", async () => {
    await renderScreen();

    const headers = within(table())
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim());
    expect(headers.slice(0, 4)).toEqual(["Name", "Email", "Role", "Status"]);

    const rows = within(table()).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);

    const requester = rows[0];
    expect(within(requester).getByText("Napat Srisai")).toBeInTheDocument();
    expect(within(requester).getByText("napat.sri@kmutt.ac.th")).toBeInTheDocument();
    expect(within(requester).getByText("Requester")).toBeInTheDocument();
    expect(within(requester).getByText("Active")).toBeInTheDocument();
    expect(within(requester).getByRole("button", { name: "Edit Napat Srisai" })).toBeInTheDocument();

    expect(within(rows[2]).getByText("Inactive")).toBeInTheDocument();
  });

  it("never renders a password field or value in the list", async () => {
    const { container } = await renderScreen();
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  // UI-37 / AC-41
  it("sends the search term and the role filter", async () => {
    const { listUsers } = await renderScreen();

    await userEvent.type(screen.getByLabelText("Search"), "warin");
    await waitFor(() => expect(lastQuery(listUsers).search).toBe("warin"));

    await userEvent.selectOptions(screen.getByLabelText("Role"), "IT_STAFF");
    await waitFor(() => expect(lastQuery(listUsers).role).toBe("IT_STAFF"));
    expect(lastQuery(listUsers).search).toBe("warin");
  });

  it("shows a no-results state with a Clear action", async () => {
    const { listUsers } = await renderScreen();

    listUsers.mockResolvedValue([]);
    await userEvent.type(screen.getByLabelText("Search"), "nobody");

    expect(await screen.findByText("No users match this search.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    listUsers.mockResolvedValue(ROSTER);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => expect(lastQuery(listUsers).search).toBe(""));
  });

  it("shows a safe failure callout with Retry", async () => {
    vi.spyOn(adminApi, "listUsers").mockRejectedValue(new ApiError(500, "Unable to load the users"));

    render(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <AuthProvider>
          <Routes>
            <Route path="/admin/users" element={<UserManagement />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("The user list could not be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows the forbidden message when the API refuses the screen", async () => {
    vi.spyOn(adminApi, "listUsers").mockRejectedValue(new ApiError(403, "forbidden"));

    render(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <AuthProvider>
          <Routes>
            <Route path="/admin/users" element={<UserManagement />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("You do not have access to this screen.")).toBeInTheDocument();
  });
});

describe("Create User panel", () => {
  // UI-38 / AC-42
  it("validates name, email and the initial password before sending", async () => {
    const createUser = vi.spyOn(adminApi, "createUser");
    await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "＋ Create User" }));
    const panel = screen.getByRole("region", { name: "Create New User" });

    await userEvent.type(within(panel).getByLabelText(/Full Name/), "A");
    await userEvent.type(within(panel).getByLabelText(/Email Address/), "not-an-email");
    await userEvent.type(within(panel).getByLabelText(/Initial Password/), "weak");
    await userEvent.click(within(panel).getByRole("button", { name: "Save User" }));

    expect(await within(panel).findByText("Full Name must be at least 2 characters")).toBeInTheDocument();
    expect(within(panel).getByText("Enter a valid email address")).toBeInTheDocument();
    expect(within(panel).getByText("This password does not meet the rules")).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates the user with one role and shows the password reminder", async () => {
    const createUser = vi
      .spyOn(adminApi, "createUser")
      .mockResolvedValue(managed({ id: 99, name: "Alex Thompson", role: "IT_STAFF", mustChangePassword: true }));

    await renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "＋ Create User" }));
    const panel = screen.getByRole("region", { name: "Create New User" });

    await userEvent.type(within(panel).getByLabelText(/Full Name/), "Alex Thompson");
    await userEvent.type(within(panel).getByLabelText(/Email Address/), "alex.thompson@kmutt.ac.th");
    await userEvent.selectOptions(within(panel).getByLabelText(/Role/), "IT_STAFF");
    await userEvent.type(within(panel).getByLabelText(/Initial Password/), "Start#2026");
    await userEvent.click(within(panel).getByRole("button", { name: "Save User" }));

    expect(createUser).toHaveBeenCalledWith({
      name: "Alex Thompson",
      email: "alex.thompson@kmutt.ac.th",
      role: "IT_STAFF",
      isActive: true,
      initialPassword: "Start#2026",
    });

    expect(
      await screen.findByText(/The user must change this password at their next login\./)
    ).toBeInTheDocument();
  });

  // UI-39 / AC-43
  it("puts a duplicate-email rejection on the email field", async () => {
    vi.spyOn(adminApi, "createUser").mockRejectedValue(
      new ApiError(409, "That email address is already in use", { code: "EMAIL_IN_USE" })
    );

    await renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "＋ Create User" }));
    const panel = screen.getByRole("region", { name: "Create New User" });

    await userEvent.type(within(panel).getByLabelText(/Full Name/), "Alex Thompson");
    await userEvent.type(within(panel).getByLabelText(/Email Address/), "warin.cha@kmutt.ac.th");
    await userEvent.type(within(panel).getByLabelText(/Initial Password/), "Start#2026");
    await userEvent.click(within(panel).getByRole("button", { name: "Save User" }));

    const message = await within(panel).findByText("That email address is already in use");
    expect(message).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Email Address/)).toHaveAttribute("aria-invalid", "true");
  });

  // UI-44 / AC-51
  it("disables and relabels Save while the request is in flight", async () => {
    let release: (user: adminApi.ManagedUser) => void = () => {};
    vi.spyOn(adminApi, "createUser").mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );

    await renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "＋ Create User" }));
    const panel = screen.getByRole("region", { name: "Create New User" });

    await userEvent.type(within(panel).getByLabelText(/Full Name/), "Alex Thompson");
    await userEvent.type(within(panel).getByLabelText(/Email Address/), "alex.thompson@kmutt.ac.th");
    await userEvent.type(within(panel).getByLabelText(/Initial Password/), "Start#2026");
    await userEvent.click(within(panel).getByRole("button", { name: "Save User" }));

    const busy = await within(panel).findByRole("button", { name: "Saving…" });
    expect(busy).toBeDisabled();

    release(managed({ id: 99 }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Saving…" })).not.toBeInTheDocument());
  });
});

describe("Edit User panel", () => {
  // UI-40 / AC-44
  it("pre-fills the panel and saves the edited values", async () => {
    const updateUser = vi
      .spyOn(adminApi, "updateUser")
      .mockResolvedValue(managed({ id: 26, name: "Warin C.", role: "IT_STAFF" }));

    await renderScreen();
    await userEvent.click(editButton("Warin Chaiyaporn"));

    const panel = screen.getByRole("region", { name: "Edit User" });
    expect(within(panel).getByLabelText(/Full Name/)).toHaveValue("Warin Chaiyaporn");
    expect(within(panel).getByLabelText(/Email Address/)).toHaveValue("warin.cha@kmutt.ac.th");
    expect(within(panel).getByLabelText(/^Role/)).toHaveValue("IT_STAFF");
    // The panel never shows a stored password, only a field to set a new one.
    expect(within(panel).queryByLabelText(/Initial Password/)).not.toBeInTheDocument();

    await userEvent.clear(within(panel).getByLabelText(/Full Name/));
    await userEvent.type(within(panel).getByLabelText(/Full Name/), "Warin C.");
    await userEvent.click(within(panel).getByRole("button", { name: "Save User" }));

    expect(updateUser).toHaveBeenCalledWith(26, {
      name: "Warin C.",
      email: "warin.cha@kmutt.ac.th",
      role: "IT_STAFF",
      isActive: true,
    });
    expect(await screen.findByText("User updated.")).toBeInTheDocument();
  });

  // UI-41 / AC-45
  it("shows a self-deactivation rejection as a callout above the panel actions", async () => {
    vi.spyOn(adminApi, "updateUser").mockRejectedValue(
      new ApiError(400, "You cannot deactivate your own account", { code: "SELF_DEACTIVATION" })
    );

    await renderScreen();
    await userEvent.click(editButton("Anong Sukjai"));
    const panel = screen.getByRole("region", { name: "Edit User" });

    await userEvent.click(within(panel).getByRole("button", { name: "Deactivate user" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, deactivate" }));

    expect(await within(panel).findByText("You cannot deactivate your own account")).toBeInTheDocument();
  });

  // UI-42 / AC-46
  it("shows the last-Administrator rejection with its explanation", async () => {
    vi.spyOn(adminApi, "updateUser").mockRejectedValue(
      new ApiError(400, "At least one active Administrator must remain", { code: "LAST_ADMINISTRATOR" })
    );

    await renderScreen();
    await userEvent.click(editButton("Anong Sukjai"));
    const panel = screen.getByRole("region", { name: "Edit User" });

    await userEvent.selectOptions(within(panel).getByLabelText(/^Role/), "IT_STAFF");
    await userEvent.click(within(panel).getByRole("button", { name: "Save User" }));

    expect(
      await within(panel).findByText("At least one active Administrator must remain")
    ).toBeInTheDocument();
  });

  it("confirms before deactivating and sends nothing when the dialog is cancelled", async () => {
    const updateUser = vi.spyOn(adminApi, "updateUser");

    await renderScreen();
    await userEvent.click(editButton("Warin Chaiyaporn"));
    const panel = screen.getByRole("region", { name: "Edit User" });

    await userEvent.click(within(panel).getByRole("button", { name: "Deactivate user" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Deactivate Warin Chaiyaporn?")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("offers no Deactivate action on an already inactive account", async () => {
    await renderScreen();
    await userEvent.click(editButton("Ratchanon Duangdee"));

    const panel = screen.getByRole("region", { name: "Edit User" });
    expect(within(panel).queryByRole("button", { name: "Deactivate user" })).not.toBeInTheDocument();
  });

  // UI-43 / AC-47
  it("confirms, sets a new initial password and reminds that it must be changed", async () => {
    const setPassword = vi
      .spyOn(adminApi, "setInitialPassword")
      .mockResolvedValue(managed({ id: 26, mustChangePassword: true }));

    await renderScreen();
    await userEvent.click(editButton("Warin Chaiyaporn"));
    const panel = screen.getByRole("region", { name: "Edit User" });

    await userEvent.type(within(panel).getByLabelText(/New initial password/), "Reset#2026");
    await userEvent.click(within(panel).getByRole("button", { name: "Set new initial password" }));

    const dialog = screen.getByRole("dialog");
    expect(setPassword).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Yes, set the password" }));

    expect(setPassword).toHaveBeenCalledWith(26, "Reset#2026");
    expect(
      await within(panel).findByText(/New initial password set\. The user must change this password/)
    ).toBeInTheDocument();
  });

  it("rejects a weak new initial password before sending it", async () => {
    const setPassword = vi.spyOn(adminApi, "setInitialPassword");

    await renderScreen();
    await userEvent.click(editButton("Warin Chaiyaporn"));
    const panel = screen.getByRole("region", { name: "Edit User" });

    await userEvent.type(within(panel).getByLabelText(/New initial password/), "weak");
    await userEvent.click(within(panel).getByRole("button", { name: "Set new initial password" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, set the password" }));

    expect(setPassword).not.toHaveBeenCalled();
    expect(await within(panel).findByText("This password does not meet the rules")).toBeInTheDocument();
  });
});
