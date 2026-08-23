import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as reference from "../../src/api/reference.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import { AppRoutes } from "../../src/AppRoot.js";
import { REQUESTER_STORAGE_KEY } from "../../src/api/client.js";

// UI-03 — docs/lab-02/tests.md §2.3

const ACTIVE_REQUESTERS = [
  { id: 1, name: "Napat Srisai", email: "napat.sri@kmutt.ac.th", department: "Faculty of Engineering" },
  { id: 2, name: "Chanya Pholrat", email: "chanya.pho@kmutt.ac.th", department: "Faculty of Science" },
];

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(reference, "getRequesters").mockResolvedValue(ACTIVE_REQUESTERS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RequesterProvider>
        <AppRoutes />
      </RequesterProvider>
    </MemoryRouter>
  );
}

describe("application shell", () => {
  // UI-03 / AC-03
  it("shows the selected Development Requester and the navigation on every ticket screen", async () => {
    window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");

    renderApp("/tickets");

    expect(await screen.findByText("Napat Srisai")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: /main/i });
    expect(within(nav).getByRole("link", { name: /my tickets/i })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /create ticket/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change requester/i })).toBeInTheDocument();
  });

  // UI-03 / ui-spec §6 — active page indication is not colour alone
  it("marks the current page with aria-current and the active class", async () => {
    window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");

    renderApp("/tickets/new");

    const nav = await screen.findByRole("navigation", { name: /main/i });
    const createLink = within(nav).getByRole("link", { name: /create ticket/i });
    expect(createLink).toHaveAttribute("aria-current", "page");
    expect(createLink.className).toContain("zg-nav-link-active");

    const listLink = within(nav).getByRole("link", { name: /my tickets/i });
    expect(listLink).not.toHaveAttribute("aria-current");
  });

  // UI-03 / AC-04, BR-08
  it("returns to the selection screen and clears the stored identity on Change Requester", async () => {
    window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");

    renderApp("/tickets");

    await userEvent.click(await screen.findByRole("button", { name: /change requester/i }));

    expect(await screen.findByText(/this is not a login screen/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(REQUESTER_STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole("navigation", { name: /main/i })).not.toBeInTheDocument();
  });

  // UI-03 / AC-04 — the new identity is the one the shell reports
  it("shows the newly selected requester after switching", async () => {
    window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");

    renderApp("/tickets");

    await userEvent.click(await screen.findByRole("button", { name: /change requester/i }));
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: /development requester/i }),
      "2"
    );
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("Chanya Pholrat")).toBeInTheDocument();
    expect(screen.queryByText("Napat Srisai")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(REQUESTER_STORAGE_KEY)).toBe("2");
  });
});
