import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ActionStatus } from "../../src/api/actions.js";
import { ActionStatusBadge } from "../../src/components/ActionsTaken.js";
import { MetricCard } from "../../src/components/Dashboard.js";

// STYLE-01 … STYLE-04 — docs/lab-04/tests.md §2.8, ui-spec.md §8, §9.
// Files are read from disk: the checks are about what the sources contain.

const LAB4_SOURCES: [string, string][] = [
  "src/components/ActionsTaken.tsx",
  "src/components/Dashboard.tsx",
  "src/pages/RequesterDashboard.tsx",
  "src/pages/StaffDashboard.tsx",
].map((file) => [file, readFileSync(file, "utf8")]);

const STYLESHEET = readFileSync("src/styles/zen-green.css", "utf8");
const LAB4_CSS = STYLESHEET.slice(STYLESHEET.indexOf("Lab 4 — docs/lab-04/ui-spec.md"));

describe("Lab 4 Zen Green consistency", () => {
  // STYLE-01 / AC-44
  it("declares no hard-coded colour in the Lab 4 components or the Lab 4 stylesheet section", () => {
    const offenders: string[] = [];
    for (const [file, source] of [...LAB4_SOURCES, ["zen-green.css (Lab 4)", LAB4_CSS] as [string, string]]) {
      const found = [
        ...(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []),
        ...(source.match(/\b(rgb|rgba|hsl|hsla)\(/g) ?? []),
      ];
      if (found.length > 0) offenders.push(`${file}: ${found.join(", ")}`);
    }
    expect(offenders).toEqual([]);
    expect(LAB4_CSS.length).toBeGreaterThan(500);
  });

  it("uses no inline style in the Lab 4 components", () => {
    expect(LAB4_SOURCES.filter(([, source]) => /style=\{\{/.test(source)).map(([file]) => file)).toEqual([]);
  });

  // STYLE-02 / AC-43
  it("labels every action status and the follow-up badge in text", () => {
    const labels: Record<ActionStatus, string> = {
      PLANNED: "Planned",
      IN_PROGRESS: "In Progress",
      COMPLETED: "Completed",
      CANCELLED: "Cancelled",
    };
    for (const [status, label] of Object.entries(labels) as [ActionStatus, string][]) {
      const { unmount } = render(<ActionStatusBadge value={status} />);
      expect(screen.getByText(label)).toHaveClass(`zg-badge-action-${status.toLowerCase().replace(/_/g, "-")}`);
      unmount();
    }
    expect(readFileSync("src/components/ActionsTaken.tsx", "utf8")).toContain(
      '<span className="zg-badge zg-badge-follow-up">Follow-up</span>'
    );
    for (const name of ["planned", "in-progress", "completed", "cancelled"]) {
      expect(STYLESHEET, name).toContain(`.zg-badge-action-${name}`);
    }
  });

  // STYLE-03 / AC-42
  it("names each metric's View link after its metric", () => {
    render(
      <MemoryRouter>
        <MetricCard label="Unassigned" value={4} viewName="unassigned tickets" to="/staff/queue" />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "View unassigned tickets" })).toHaveAttribute("href", "/staff/queue");
    expect(screen.getByRole("region", { name: "Unassigned" })).toHaveClass("zg-card");
  });

  // STYLE-04 / AC-44
  it("puts Performed by on the read-only surface", () => {
    const source = readFileSync("src/components/ActionsTaken.tsx", "utf8");
    const start = source.indexOf("id={`${formId}-performer`}");
    const performer = source.slice(start, start + 200);
    expect(start).toBeGreaterThan(0);
    expect(performer).toContain('className="zg-input zg-readonly"');
    expect(performer).toContain('aria-readonly="true"');
  });
});
