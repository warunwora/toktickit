import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as staffApi from "../../src/api/staff.js";
import * as adminApi from "../../src/api/admin.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { PriorityBadge, RoleBadge, StatusBadge } from "../../src/components/Badges.js";
import StaffTicketDetail from "../../src/pages/StaffTicketDetail.js";
import Login from "../../src/pages/Login.js";
import { IT_STAFF, signedInAs } from "../helpers/auth.js";

// STYLE-01 … STYLE-05 — docs/lab-03/tests.md §2.10, ui-spec.md §1 and §7.

// Vitest stubs a CSS module even with ?raw, and these checks are about what the
// files contain rather than what the bundler produces, so both are read from
// disk. Paths are relative to the client workspace, which is the test cwd.
const LAB3_SOURCES: [string, string][] = [
  "src/pages/StaffTicketQueue.tsx",
  "src/pages/StaffTicketDetail.tsx",
  "src/pages/UserManagement.tsx",
  "src/pages/Login.tsx",
  "src/pages/ChangePassword.tsx",
  "src/components/ConversationThread.tsx",
  "src/components/AppShell.tsx",
  "src/components/Badges.tsx",
].map((file) => [file, readFileSync(file, "utf8")]);

const STYLESHEET = readFileSync("src/styles/zen-green.css", "utf8");

function ticket(overrides: Partial<staffApi.StaffTicket> = {}): staffApi.StaffTicket {
  return {
    id: 42,
    ticketNumber: "TKT-2026-000042",
    summary: "Cannot connect to the VPN from home",
    description: "The VPN client reports a certificate error every evening.",
    status: "NEW",
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    requesterResolvedAt: null,
    createdAt: "2026-09-10T02:14:55.000Z",
    updatedAt: "2026-09-12T08:02:11.000Z",
    requester: { id: 1, name: "Napat Srisai" },
    owner: null,
    category: { id: 4, name: "Network" },
    relatedSystem: { id: 3, name: "VPN" },
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
    attachments: [],
    comments: [],
    notes: [],
    ...overrides,
  };
}

beforeEach(() => {
  signedInAs(IT_STAFF);
  vi.spyOn(staffApi, "getAssignableUsers").mockResolvedValue([{ id: 26, name: "Warin Chaiyaporn" }]);
  vi.spyOn(adminApi, "listUsers").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderStaffDetail() {
  vi.spyOn(staffApi, "getStaffTicket").mockResolvedValue(ticket());

  render(
    <MemoryRouter initialEntries={["/staff/tickets/42"]}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );

  await screen.findByRole("heading", { name: "TKT-2026-000042" });
}

describe("Zen Green tokens", () => {
  // STYLE-01 / AC-49
  it("declares no hard-coded colour in any Lab 3 component", () => {
    const offenders: string[] = [];

    for (const [file, source] of LAB3_SOURCES) {
      // A colour belongs in the stylesheet as a token, never inline in JSX.
      const hex = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      const functional = source.match(/\b(rgb|rgba|hsl|hsla)\(/g) ?? [];
      if (hex.length > 0 || functional.length > 0) {
        offenders.push(`${file}: ${[...hex, ...functional].join(", ")}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("defines every Lab 3 surface class against a declared token", () => {
    // The two Lab 3 surfaces that carry meaning must be token-driven, so a
    // theme change moves them together with everything else.
    for (const rule of [".zg-notes", ".zg-operations", ".zg-tab-active"]) {
      expect(STYLESHEET, `${rule} must exist`).toContain(rule);
    }

    const notes = STYLESHEET.slice(STYLESHEET.indexOf(".zg-notes {"));
    expect(notes).toContain("var(--zg-warning-bg)");
    expect(notes).toContain("var(--zg-warning)");
  });
});

describe("Internal Notes are visually distinct", () => {
  // STYLE-02 / AC-38
  it("puts the notes thread on the warning surface and the comments thread on the card surface", async () => {
    await renderStaffDetail();

    const comments = screen.getByRole("region", { name: "Public Comments" });
    expect(comments.className).toContain("zg-comments");
    expect(comments.className).not.toContain("zg-notes");

    await userEvent.click(screen.getByRole("tab", { name: /Internal Notes/ }));
    const notes = screen.getByRole("region", { name: "Internal Notes" });

    expect(notes.className).toContain("zg-notes");
    // Different declared background token, not merely a different shade.
    const notesRule = STYLESHEET.slice(STYLESHEET.indexOf(".zg-notes {"), STYLESHEET.indexOf(".zg-notes-caption"));
    expect(notesRule).toContain("background: var(--zg-warning-bg)");
    expect(within(notes).getByText("Not visible to the Requester")).toBeInTheDocument();
  });
});

describe("Editable versus read-only on IT Staff Ticket Detail", () => {
  // STYLE-03 / AC-49
  it("gives every read-only field the read-only surface and leaves the operations controls editable", async () => {
    await renderStaffDetail();

    for (const label of [/Ticket Number/, /^Category/, /Related System/, /^Requester/, /^Summary/, /^Description/]) {
      const field = screen.getByLabelText(label);
      expect(field, String(label)).toHaveAttribute("readonly");
      expect(field.className, String(label)).toContain("zg-readonly");
    }

    for (const label of ["Ticket Owner", "IT Priority", "Status"]) {
      const control = screen.getByLabelText(label);
      expect(control).toBeEnabled();
      expect(control.className).not.toContain("zg-readonly");
    }

    // The summary is read-only until Resolved is chosen (ui-spec.md §5.5).
    expect(screen.getByLabelText(/Resolution Summary/).className).toContain("zg-readonly");
  });
});

describe("Badges carry their meaning in text", () => {
  // STYLE-04 / AC-49
  it("renders a readable label for every role, status and priority value", () => {
    const roles = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const;
    const statuses = [
      "NEW",
      "OPEN",
      "IN_PROGRESS",
      "WAITING_FOR_REQUESTER",
      "RESOLVED",
      "CLOSED",
      "REOPENED",
      "CANCELLED",
    ] as const;
    const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

    const { container } = render(
      <>
        {roles.map((role) => (
          <RoleBadge key={role} value={role} />
        ))}
        {statuses.map((status) => (
          <StatusBadge key={status} value={status} />
        ))}
        {priorities.map((priority) => (
          <PriorityBadge key={priority} value={priority} />
        ))}
      </>
    );

    const badges = Array.from(container.querySelectorAll(".zg-badge"));
    expect(badges).toHaveLength(roles.length + statuses.length + priorities.length);

    for (const badge of badges) {
      // Colour is never the only carrier: the text says the same thing.
      expect(badge.textContent?.trim()).not.toBe("");
      expect(badge.textContent).not.toMatch(/_/);
    }

    expect(screen.getByText("Waiting for Requester")).toBeInTheDocument();
    expect(screen.getByText("IT Staff")).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });
});

describe("Validation messages are associated with their field", () => {
  // STYLE-05 / AC-50
  it("references the message from the field that failed", async () => {
    // Nobody is signed in: an authenticated Login redirects away on mount.
    signedInAs(null);

    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );

    await userEvent.click(await screen.findByRole("button", { name: "Sign In" }));

    const email = screen.getByLabelText(/Email address/);
    const described = email.getAttribute("aria-describedby");

    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(described).toBeTruthy();
    expect(document.getElementById(described!.split(" ")[0])?.textContent).toMatch(/required|enter/i);
  });

  it("renders every message id that a Lab 3 field points at", () => {
    // A describedby pointing at nothing is silent for a screen reader, so each
    // literal id a component references must also be an id it renders.
    const orphans: string[] = [];

    for (const [file, source] of LAB3_SOURCES) {
      const referenced = [...source.matchAll(/aria-describedby=\{?\s*[^}]*?"([a-z][a-z0-9-]*)"/g)].map(
        (match) => match[1]
      );

      for (const id of new Set(referenced)) {
        if (!source.includes(`id="${id}"`)) orphans.push(`${file} → ${id}`);
      }
    }

    expect(orphans).toEqual([]);
  });
});

describe("The Lab 3 stylesheet stays one system", () => {
  it("adds no second stylesheet beside zen-green.css", () => {
    expect(readdirSync(join("src", "styles"))).toEqual(["zen-green.css"]);
  });
});
