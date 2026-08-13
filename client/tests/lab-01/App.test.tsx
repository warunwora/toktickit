import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("renders the TokTickIT heading", () => {
    render(<App />);
    expect(screen.getByText(/TokTickIT/i)).toBeInTheDocument();
  });

  it("shows the loading state, then Online and the seeded categories", async () => {
    // Hold the API promise open so the loading state is observable (UI-02).
    let resolve!: (value: api.SystemStatus) => void;
    const pending = new Promise<api.SystemStatus>((r) => (resolve = r));
    vi.spyOn(api, "checkSystem").mockReturnValue(pending);

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /check system/i }));

    expect(screen.getByText(/⏳ loading/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /loading/i })).toBeDisabled();

    resolve({
      online: true,
      categories: [
        { id: 1, name: "Account and Access" },
        { id: 2, name: "Hardware" },
        { id: 3, name: "Software" },
        { id: 4, name: "Network" },
      ],
    });

    expect(await screen.findByText(/Online/i)).toBeInTheDocument();
    expect(screen.queryByText(/⏳/)).not.toBeInTheDocument();
    expect(screen.getByText("Account and Access")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
  });

  it("shows an Offline error message when the API is unavailable", async () => {
    vi.spyOn(api, "checkSystem").mockRejectedValue(new Error("down"));

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /check system/i }));

    expect(await screen.findByText(/Offline/i)).toBeInTheDocument();
    expect(screen.getByText(/Unable to connect to TokTickIT API/i)).toBeInTheDocument();
  });
});
