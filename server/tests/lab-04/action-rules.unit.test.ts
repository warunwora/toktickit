import { describe, it, expect } from "vitest";
import {
  ACTION_STATUS_VALUES,
  ActionFields,
  ActionStatusValue,
  EMPTY_ACTION,
  canActionTransition,
  isFinal,
  mergeActionFields,
  validateActionFields,
} from "../../src/lib/action-rules.js";

// U-01 … U-06 — docs/lab-04/tests.md §2.1.
// The matrix in docs/lab-04/specification.md §5.2 is transcribed by hand so an
// edit to the implementation table fails here.

const PERMITTED: [ActionStatusValue, ActionStatusValue][] = [
  ["PLANNED", "IN_PROGRESS"],
  ["PLANNED", "COMPLETED"],
  ["PLANNED", "CANCELLED"],
  ["IN_PROGRESS", "COMPLETED"],
  ["IN_PROGRESS", "CANCELLED"],
];

const NOW = new Date("2026-10-30T10:00:00.000Z");
const TICKET_CREATED = new Date("2026-10-29T10:00:00.000Z");
const context = { now: NOW, ticketCreatedAt: TICKET_CREATED };

const VALID = { actionAt: "2026-10-30T09:00:00.000Z", description: "Replaced the print head." };

/** Validates a create body the way the API does: merge onto an empty action, then check. */
function check(body: Record<string, unknown>) {
  const fields = mergeActionFields(EMPTY_ACTION, body);
  return { fields, errors: validateActionFields(fields, body, context) };
}

const fieldsOf = (body: Record<string, unknown>) => check(body).errors.map((error) => error.field);

describe("Action Description (BR-06)", () => {
  // U-01 / AC-06
  it("rejects empty and whitespace, accepts 2000 characters and rejects 2001", () => {
    expect(fieldsOf({ ...VALID, description: "" })).toEqual(["description"]);
    expect(fieldsOf({ ...VALID, description: "   \n " })).toEqual(["description"]);
    expect(fieldsOf({ ...VALID, description: "x".repeat(2000) })).toEqual([]);
    expect(fieldsOf({ ...VALID, description: "x".repeat(2001) })).toEqual(["description"]);
  });
});

describe("Action Date/Time (BR-05)", () => {
  const minutesFromNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

  // U-02 / AC-06
  it("rejects 6 minutes ahead, accepts 4 minutes ahead, rejects before the ticket and missing", () => {
    expect(fieldsOf({ ...VALID, actionAt: minutesFromNow(6) })).toEqual(["actionAt"]);
    expect(fieldsOf({ ...VALID, actionAt: minutesFromNow(4) })).toEqual([]);
    expect(fieldsOf({ ...VALID, actionAt: "2026-10-29T09:59:59.000Z" })).toEqual(["actionAt"]);
    // The same minute as the ticket is not "before" it: the control holds whole minutes.
    expect(validateActionFields(mergeActionFields(EMPTY_ACTION, VALID), VALID, {
      now: NOW,
      ticketCreatedAt: new Date("2026-10-30T09:00:40.000Z"),
    })).toEqual([]);
    expect(fieldsOf({ description: VALID.description })).toEqual(["actionAt"]);
  });

  it("rejects a value that is not a date", () => {
    expect(fieldsOf({ ...VALID, actionAt: "yesterday-ish" })).toEqual(["actionAt"]);
    expect(fieldsOf({ ...VALID, actionAt: 1_700_000_000_000 })).toEqual(["actionAt"]);
  });
});

describe("Follow-up (BR-08)", () => {
  // U-03 / AC-06
  it("rejects Follow-Up Required without a note and clears a note sent with false", () => {
    expect(fieldsOf({ ...VALID, followUpRequired: true })).toEqual(["followUpNote"]);
    expect(fieldsOf({ ...VALID, followUpRequired: true, followUpNote: "  " })).toEqual(["followUpNote"]);

    const off = check({ ...VALID, followUpRequired: false, followUpNote: "Call back on Monday." });
    expect(off.errors).toEqual([]);
    expect(off.fields.followUpNote).toBeNull();
  });

  it("limits the note to 1000 characters and Attachment Notes to 500", () => {
    expect(fieldsOf({ ...VALID, followUpRequired: true, followUpNote: "n".repeat(1000) })).toEqual([]);
    expect(fieldsOf({ ...VALID, followUpRequired: true, followUpNote: "n".repeat(1001) })).toEqual(["followUpNote"]);
    expect(fieldsOf({ ...VALID, attachmentNotes: "a".repeat(500) })).toEqual([]);
    expect(fieldsOf({ ...VALID, attachmentNotes: "a".repeat(501) })).toEqual(["attachmentNotes"]);
  });

  it("rejects a Follow-Up Required that is not a boolean", () => {
    expect(fieldsOf({ ...VALID, followUpRequired: "yes", followUpNote: "x" })).toEqual(["followUpRequired"]);
  });
});

describe("Result and cancel reason (BR-07, BR-13)", () => {
  // U-04 / AC-08
  it("rejects Completed without a Result and Cancelled without a reason or with 2 characters", () => {
    expect(fieldsOf({ ...VALID, status: "COMPLETED" })).toEqual(["result"]);
    expect(fieldsOf({ ...VALID, status: "COMPLETED", result: "  " })).toEqual(["result"]);
    expect(fieldsOf({ ...VALID, status: "COMPLETED", result: "Printed a test label." })).toEqual([]);

    const open: ActionFields = { ...mergeActionFields(EMPTY_ACTION, VALID) };
    for (const cancelReason of [undefined, "", "no"]) {
      const body = { status: "CANCELLED", cancelReason };
      const fields = mergeActionFields(open, body);
      expect(validateActionFields(fields, body, context).map((e) => e.field), String(cancelReason)).toEqual([
        "cancelReason",
      ]);
    }

    const body = { status: "CANCELLED", cancelReason: "Not needed" };
    expect(validateActionFields(mergeActionFields(open, body), body, context)).toEqual([]);
  });

  it("allows an open action without a Result, and limits Result to 2000 characters", () => {
    expect(fieldsOf({ ...VALID, status: "IN_PROGRESS" })).toEqual([]);
    expect(fieldsOf({ ...VALID, status: "COMPLETED", result: "r".repeat(2000) })).toEqual([]);
    expect(fieldsOf({ ...VALID, status: "COMPLETED", result: "r".repeat(2001) })).toEqual(["result"]);
  });

  it("drops a cancel reason sent with any status other than Cancelled", () => {
    expect(check({ ...VALID, cancelReason: "stray" }).fields.cancelReason).toBeNull();
  });
});

describe("action status matrix (§5.2)", () => {
  // U-05 / AC-07
  it("allows every permitted transition", () => {
    for (const [from, to] of PERMITTED) expect(canActionTransition(from, to), `${from} → ${to}`).toBe(true);
  });

  // U-06 / AC-09
  it("rejects every other transition, including anything out of Completed and Cancelled", () => {
    const wronglyAllowed: string[] = [];
    for (const from of ACTION_STATUS_VALUES) {
      for (const to of ACTION_STATUS_VALUES) {
        const permitted = PERMITTED.some(([f, t]) => f === from && t === to);
        if (!permitted && canActionTransition(from, to)) wronglyAllowed.push(`${from} → ${to}`);
      }
    }
    expect(wronglyAllowed).toEqual([]);
    expect(isFinal("COMPLETED")).toBe(true);
    expect(isFinal("CANCELLED")).toBe(true);
    expect(isFinal("PLANNED")).toBe(false);
    expect(isFinal("IN_PROGRESS")).toBe(false);
  });
});
