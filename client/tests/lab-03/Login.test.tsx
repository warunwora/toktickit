import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as authApi from "../../src/api/auth.js";
import { ApiError } from "../../src/api/client.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import Login from "../../src/pages/Login.js";
import { ADMINISTRATOR, IT_STAFF, REQUESTER, signedInAs } from "../helpers/auth.js";

// UI-01 … UI-06 — docs/lab-03/tests.md §2.9

beforeEach(() => {
  signedInAs(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/tickets" element={<h1>My Tickets</h1>} />
          <Route path="/account" element={<h1>Your account</h1>} />
          <Route path="/staff/queue" element={<h1>Ticket Queue</h1>} />
          <Route path="/change-password" element={<h1>Change Your Password</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function signIn(email: string, password: string) {
  await userEvent.type(screen.getByLabelText(/Email address/), email);
  await userEvent.type(screen.getByLabelText(/^Password/), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign In" }));
}

describe("Login", () => {
  // UI-01 / AC-03
  it("shows field messages and sends no request when the form is empty", async () => {
    const login = vi.spyOn(authApi, "login");
    renderLogin();

    await userEvent.click(await screen.findByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Enter your email address")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("rejects a malformed email address before calling the API", async () => {
    const login = vi.spyOn(authApi, "login");
    renderLogin();

    await screen.findByRole("button", { name: "Sign In" });
    await signIn("not-an-email", "Kmutt#2026x");

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  // UI-02 / AC-03
  it("shows one safe message and clears the password when the credentials are wrong", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(
      new ApiError(401, "Invalid email or password. Please try again.")
    );
    renderLogin();

    await screen.findByRole("button", { name: "Sign In" });
    await signIn("napat.sri@kmutt.ac.th", "wrong-password");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid email or password. Please try again.");
    expect(screen.getByLabelText(/^Password/)).toHaveValue("");
  });

  // UI-03 / AC-05
  it("shows the distinct message for a deactivated account", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(
      new ApiError(403, "This account is not active. Please contact an administrator.")
    );
    renderLogin();

    await screen.findByRole("button", { name: "Sign In" });
    await signIn("anan.tep@kmutt.ac.th", "ChangeMe!2026");

    expect(await screen.findByRole("alert")).toHaveTextContent(/not active/i);
  });

  // UI-04 / AC-51
  it("disables the submit button and shows a busy label while signing in", async () => {
    let resolve: (value: { user: authApi.AuthUser }) => void = () => {};
    vi.spyOn(authApi, "login").mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    renderLogin();

    await screen.findByRole("button", { name: "Sign In" });
    await signIn("napat.sri@kmutt.ac.th", "ChangeMe!2026");

    const busy = await screen.findByRole("button", { name: /signing in/i });
    expect(busy).toBeDisabled();

    resolve({ user: REQUESTER });
    await screen.findByRole("heading", { name: "My Tickets" });
  });

  // UI-05 / AC-01
  it("sends each role to its own landing screen", async () => {
    const cases: [authApi.AuthUser, string][] = [
      [REQUESTER, "My Tickets"],
      [IT_STAFF, "Ticket Queue"],
      [ADMINISTRATOR, "Ticket Queue"],
    ];

    for (const [user, heading] of cases) {
      vi.spyOn(authApi, "login").mockResolvedValue({ user });
      const view = renderLogin();

      await screen.findByRole("button", { name: "Sign In" });
      await signIn(user.email, "ChangeMe!2026");

      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
      view.unmount();
    }
  });

  // UI-05 / AC-02
  it("sends a user with an initial password straight to the change-password screen", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue({ user: { ...REQUESTER, mustChangePassword: true } });
    renderLogin();

    await screen.findByRole("button", { name: "Sign In" });
    await signIn("kittisak.boo@kmutt.ac.th", "ChangeMe!2026");

    expect(await screen.findByRole("heading", { name: "Change Your Password" })).toBeInTheDocument();
  });

  // UI-06 / AC-50
  it("toggles the password between hidden and visible with a real button", async () => {
    renderLogin();

    const field = await screen.findByLabelText(/^Password/);
    expect(field).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(toggle);

    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers no registration or password-reset action, both of which are out of scope", async () => {
    renderLogin();
    await screen.findByRole("button", { name: "Sign In" });

    expect(screen.queryByText(/create an account/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/forgot/i)).not.toBeInTheDocument();
  });

  it("maps a backend validation error onto its own field", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(
      new ApiError(400, "Validation failed", {
        fields: [{ field: "email", message: "Enter a valid email address" }],
      })
    );
    renderLogin();

    await screen.findByRole("button", { name: "Sign In" });
    await signIn("napat.sri@kmutt.ac.th", "ChangeMe!2026");

    await waitFor(() => expect(screen.getByText("Enter a valid email address")).toBeInTheDocument());
  });
});
