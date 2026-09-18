import { describe, it, expect } from "vitest";
import {
  STATUS_VALUES,
  TRANSITIONS,
  TicketStatusValue,
  allowedTransitions,
  canTransition,
  checkTransition,
  isTerminal,
  transitionMessage,
} from "../../src/lib/transitions.js";

// U-08 … U-11 — docs/lab-03/tests.md §2.1.
// The matrix in docs/lab-03/specification.md §5.1 is transcribed here by hand
// so the test fails if the implementation table is edited, rather than
// re-deriving the expectation from the code under test.

const PERMITTED: [TicketStatusValue, TicketStatusValue][] = [
  ["NEW", "OPEN"],
  ["NEW", "IN_PROGRESS"],
  ["NEW", "CANCELLED"],
  ["OPEN", "IN_PROGRESS"],
  ["OPEN", "WAITING_FOR_REQUESTER"],
  ["OPEN", "RESOLVED"],
  ["OPEN", "CANCELLED"],
  ["IN_PROGRESS", "WAITING_FOR_REQUESTER"],
  ["IN_PROGRESS", "RESOLVED"],
  ["IN_PROGRESS", "CANCELLED"],
  ["WAITING_FOR_REQUESTER", "IN_PROGRESS"],
  ["WAITING_FOR_REQUESTER", "RESOLVED"],
  ["WAITING_FOR_REQUESTER", "CANCELLED"],
  ["RESOLVED", "CLOSED"],
  ["RESOLVED", "REOPENED"],
  ["REOPENED", "IN_PROGRESS"],
  ["REOPENED", "WAITING_FOR_REQUESTER"],
  ["REOPENED", "RESOLVED"],
  ["REOPENED", "CANCELLED"],
];

function isPermitted(from: TicketStatusValue, to: TicketStatusValue): boolean {
  return PERMITTED.some(([f, t]) => f === from && t === to);
}

describe("status transition matrix", () => {
  // U-08 / AC-35
  it("allows every transition the specification permits", () => {
    for (const [from, to] of PERMITTED) {
      expect(canTransition(from, to), `${from} → ${to}`).toBe(true);
    }
  });

  // U-09 / AC-35
  it("rejects every transition outside the matrix, including self-transitions", () => {
    const rejected: string[] = [];

    for (const from of STATUS_VALUES) {
      for (const to of STATUS_VALUES) {
        if (isPermitted(from, to)) continue;
        if (canTransition(from, to)) rejected.push(`${from} → ${to}`);
      }
    }

    expect(rejected).toEqual([]);
  });

  it("offers no transition back to New from anywhere", () => {
    for (const from of STATUS_VALUES) {
      expect(allowedTransitions(from)).not.toContain("NEW");
    }
  });

  // U-10 / AC-35
  it("treats Closed and Cancelled as terminal", () => {
    expect(TRANSITIONS.CLOSED).toEqual([]);
    expect(TRANSITIONS.CANCELLED).toEqual([]);
    expect(isTerminal("CLOSED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("NEW")).toBe(false);
  });

  it("names the current status and the reachable ones in the rejection message", () => {
    expect(transitionMessage("NEW")).toBe("This ticket is New; it can move to Open, In Progress or Cancelled.");
    expect(transitionMessage("RESOLVED")).toBe("This ticket is Resolved; it can move to Closed or Reopened.");
    expect(transitionMessage("CLOSED")).toBe("This ticket is Closed; it is final and cannot change status.");
  });
});

describe("checkTransition", () => {
  // U-11 / AC-36
  it("requires a resolution summary for Resolved", () => {
    for (const summary of [undefined, null, "", "   ", "\n\t "]) {
      const result = checkTransition("IN_PROGRESS", "RESOLVED", summary);
      expect(result.errors).toEqual([
        { field: "resolutionSummary", message: "Resolution Summary is required to resolve a ticket" },
      ]);
    }
  });

  it("accepts Resolved with a summary and trims it", () => {
    const result = checkTransition("IN_PROGRESS", "RESOLVED", "  Re-enrolled the VPN certificate.  ");
    expect(result.errors).toEqual([]);
    expect(result.resolutionSummary).toBe("Re-enrolled the VPN certificate.");
  });

  it("rejects a resolution summary longer than 2000 characters", () => {
    const result = checkTransition("OPEN", "RESOLVED", "x".repeat(2001));
    expect(result.errors[0].field).toBe("resolutionSummary");
    expect(checkTransition("OPEN", "RESOLVED", "x".repeat(2000)).errors).toEqual([]);
  });

  it("does not ask for a summary on any other transition", () => {
    expect(checkTransition("NEW", "OPEN", undefined).errors).toEqual([]);
    expect(checkTransition("RESOLVED", "CLOSED", undefined).errors).toEqual([]);
    expect(checkTransition("RESOLVED", "CLOSED", undefined).resolutionSummary).toBeUndefined();
  });

  it("reports a forbidden transition on the status field, not the summary", () => {
    const result = checkTransition("CLOSED", "OPEN", "anything");
    expect(result.errors).toEqual([{ field: "status", message: transitionMessage("CLOSED") }]);
  });
});
