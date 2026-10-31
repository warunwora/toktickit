import { describe, it, expect } from "vitest";
import { GateAction, blockReason, resolutionBlockers } from "../../src/lib/resolution-gate.js";

// U-07, U-08 — docs/lab-04/tests.md §2.1.

function action(overrides: Partial<GateAction>): GateAction {
  return {
    id: 1,
    description: "Checked the cable.",
    status: "COMPLETED",
    followUpRequired: false,
    followUpClearedAt: null,
    ...overrides,
  };
}

describe("resolution gate (BR-19)", () => {
  // U-07 / AC-14
  it("blocks Planned, In Progress and an open follow-up; allows a cleared follow-up, Cancelled and none", () => {
    expect(blockReason(action({ status: "PLANNED" }))).toBe("INCOMPLETE");
    expect(blockReason(action({ status: "IN_PROGRESS" }))).toBe("INCOMPLETE");
    expect(blockReason(action({ followUpRequired: true }))).toBe("FOLLOW_UP_OPEN");
    expect(blockReason(action({ followUpRequired: true, followUpClearedAt: new Date() }))).toBeNull();
    expect(blockReason(action({ status: "CANCELLED" }))).toBeNull();
    expect(resolutionBlockers([])).toEqual([]);
  });

  // U-08 / AC-14
  it("lists each blocking action with its reason, in the order given", () => {
    const blockers = resolutionBlockers([
      action({ id: 4, status: "IN_PROGRESS", description: "Replace the print head" }),
      action({ id: 5, status: "COMPLETED" }),
      action({ id: 6, followUpRequired: true, description: "Check the driver" }),
      action({ id: 7, status: "CANCELLED", followUpRequired: true }),
    ]);

    expect(blockers).toEqual([
      { id: 4, description: "Replace the print head", status: "IN_PROGRESS", reason: "INCOMPLETE" },
      { id: 6, description: "Check the driver", status: "COMPLETED", reason: "FOLLOW_UP_OPEN" },
    ]);
  });
});
