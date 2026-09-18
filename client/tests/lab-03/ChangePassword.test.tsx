import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as authApi from "../../src/api/auth.js";
import { ApiError } from "../../src/api/client.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRoutes } from "../../src/AppRoot.js";
import ChangePassword from "../../src/pages/ChangePassword.js";
import { REQUESTER, signedInAs } from "../helpers/auth.js";

// UI-07 … UI-11 — docs/lab-03/tests.md §2.9

const MUST_CHANGE = { ...REQUESTER, mustChangePassword: true };

afterEach(() => {
  vi.restoreAllMocks();
});

function renderScreen() {
  signedInAs(MUST_CHANGE);
  return render(
    <MemoryRouter initialEntries={["/change-password"]}>
      <AuthProvider>
        <Routes>
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/tickets" element={<h1>My Tickets</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function fill(current: string, next: string, confirm: string) {
  await userEvent.type(await screen.findByLabelText(/Current \(temporary\) password/), current);
  await userEvent.type(screen.getByLabelText(/^New password/), next);
  await userEvent.type(screen.getByLabelText(/Confirm new password/), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("Change Password", () => {
  // UI-07 / AC-09
  it("ticks each rule as the new password satisfies it", async () => {
    renderScreen();

    const rulesTitle = await screen.findByText("Password must:");
    const rules = within(rulesTitle.closest("div")!);
    const newPassword = screen.getByLabelText(/^New password/);

    await userEvent.type(newPassword, "abc");
    expect(rules.getByText("Be at least 8 characters").closest("li")).not.toHaveClass("zg-rule-met");

    await userEvent.clear(newPassword);
    await userEvent.type(newPassword, "Kmutt#2026x");

    await waitFor(() => {
      for (const label of [
        "Be at least 8 characters",
        "Include upper and lower case letters",
        "Include a number",
        "Include a special character",
      ]) {
        expect(rules.getByText(label).closest("li")).toHaveClass("zg-rule-met");
      }
    });
  });

  // UI-08 / AC-09
  it("blocks a mismatched confirmation without calling the API", async () => {
    const change = vi.spyOn(authApi, "changePassword");
    renderScreen();

    await fill("ChangeMe!2026", "Kmutt#2026x", "Kmutt#2026y");

    expect(await screen.findByText("The two passwords do not match")).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it("blocks a new password that breaks the rules without calling the API", async () => {
    const change = vi.spyOn(authApi, "changePassword");
    renderScreen();

    await fill("ChangeMe!2026", "abcdefgh", "abcdefgh");

    expect(await screen.findByText("This password does not meet the rules below")).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it("blocks reusing the current password", async () => {
    const change = vi.spyOn(authApi, "changePassword");
    renderScreen();

    await fill("Kmutt#2026x", "Kmutt#2026x", "Kmutt#2026x");

    expect(await screen.findByText("Choose a password you have not used before")).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  // UI-09 / AC-09
  it("shows a rejected current password on its own field", async () => {
    vi.spyOn(authApi, "changePassword").mockRejectedValue(
      new ApiError(400, "Validation failed", {
        fields: [{ field: "currentPassword", message: "Your current password is not correct" }],
      })
    );
    renderScreen();

    await fill("Wrong#2026x", "Kmutt#2026x", "Kmutt#2026x");

    expect(await screen.findByText("Your current password is not correct")).toBeInTheDocument();
  });

  // UI-11 / AC-10
  it("continues into the application after a successful change", async () => {
    vi.spyOn(authApi, "changePassword").mockResolvedValue({
      user: { ...MUST_CHANGE, mustChangePassword: false },
    });
    renderScreen();

    await fill("ChangeMe!2026", "Kmutt#2026x", "Kmutt#2026x");

    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
  });

  it("states that the change is mandatory", async () => {
    renderScreen();
    expect(await screen.findByText("You must change your password to continue.")).toBeInTheDocument();
  });

  // UI-10 / AC-02
  it("redirects every other route to the change-password screen while the flag is set", async () => {
    signedInAs(MUST_CHANGE);

    render(
      <MemoryRouter initialEntries={["/tickets"]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Change Your Password" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  });
});
