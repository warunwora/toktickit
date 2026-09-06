import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as reference from "../../src/api/reference.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import RequireRequester from "../../src/components/RequireRequester.js";
import RequesterSelection from "../../src/pages/RequesterSelection.js";
import { REQUESTER_STORAGE_KEY } from "../../src/api/client.js";

// UI-01, UI-02 — docs/lab-02/tests.md §2.3

const ACTIVE_REQUESTERS = [
  { id: 1, name: "Napat Srisai", email: "napat.sri@kmutt.ac.th", department: "Faculty of Engineering" },
  { id: 2, name: "Chanya Pholrat", email: "chanya.pho@kmutt.ac.th", department: "Faculty of Science" },
];

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSelection() {
  return render(
    <MemoryRouter initialEntries={["/select-requester"]}>
      <RequesterProvider>
        <Routes>
          <Route path="/select-requester" element={<RequesterSelection />} />
          <Route path="/tickets" element={<h1>My Tickets</h1>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

describe("Development Requester Selection", () => {
  // UI-01 / AC-02, BR-06
  it("lists active requesters and states that it is not a login screen", async () => {
    vi.spyOn(reference, "getRequesters").mockResolvedValue(ACTIVE_REQUESTERS);

    renderSelection();

    expect(await screen.findByRole("combobox", { name: /development requester/i })).toBeInTheDocument();
    expect(screen.getByText(/this is not a login screen/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Napat Srisai/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Anan Tepsiri/ })).not.toBeInTheDocument();
  });

  // UI-01 / AC-11-style busy rule: Continue stays disabled until a choice is made
  it("keeps Continue disabled until a requester is chosen, then stores the selection", async () => {
    vi.spyOn(reference, "getRequesters").mockResolvedValue(ACTIVE_REQUESTERS);

    renderSelection();

    const continueButton = await screen.findByRole("button", { name: /continue/i });
    expect(continueButton).toBeDisabled();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /development requester/i }),
      "2"
    );
    expect(continueButton).toBeEnabled();

    await userEvent.click(continueButton);

    expect(window.localStorage.getItem(REQUESTER_STORAGE_KEY)).toBe("2");
    expect(await screen.findByRole("heading", { name: /my tickets/i })).toBeInTheDocument();
  });

  // UI-01 / AC-06
  it("shows an empty state instead of an empty dropdown when no active requester exists", async () => {
    vi.spyOn(reference, "getRequesters").mockResolvedValue([]);

    renderSelection();

    expect(await screen.findByText(/no active development requesters found/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  // UI-01 / AC-05
  it("shows a safe failure state with retry when the requester API fails", async () => {
    vi.spyOn(reference, "getRequesters").mockRejectedValue(new Error("network down"));

    renderSelection();

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load development requesters/i);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("retries loading when Retry is pressed", async () => {
    const spy = vi
      .spyOn(reference, "getRequesters")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(ACTIVE_REQUESTERS);

    renderSelection();

    await userEvent.click(await screen.findByRole("button", { name: /retry/i }));

    expect(await screen.findByRole("combobox", { name: /development requester/i })).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("RequireRequester guard", () => {
  // UI-02 / AC-01, BR-09
  it("shows the selection screen when no requester is selected", async () => {
    vi.spyOn(reference, "getRequesters").mockResolvedValue(ACTIVE_REQUESTERS);

    render(
      <MemoryRouter initialEntries={["/tickets"]}>
        <RequesterProvider>
          <RequireRequester>
            <h1>My Tickets</h1>
          </RequireRequester>
        </RequesterProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText(/this is not a login screen/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /my tickets/i })).not.toBeInTheDocument();
  });

  // UI-02 / BR-10
  it("clears a stored requester that is no longer active and explains why", async () => {
    window.localStorage.setItem(REQUESTER_STORAGE_KEY, "99");
    vi.spyOn(reference, "getRequesters").mockResolvedValue(ACTIVE_REQUESTERS);

    render(
      <MemoryRouter initialEntries={["/tickets"]}>
        <RequesterProvider>
          <RequireRequester>
            <h1>My Tickets</h1>
          </RequireRequester>
        </RequesterProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(REQUESTER_STORAGE_KEY)).toBeNull();
  });
});
