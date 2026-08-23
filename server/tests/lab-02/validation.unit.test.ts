import { describe, it, expect } from "vitest";
import { validateCreateTicket } from "../../src/lib/validation.js";

// UNIT-03, UNIT-04 — docs/lab-02/tests.md §2.1 (BR-15, BR-16)

const valid = {
  categoryId: 2,
  relatedSystemId: 7,
  summary: "Laptop battery drains fast",
  description: "The corporate laptop discharges from full to empty in under an hour while idle.",
  requestedPriority: "MEDIUM",
};

function fieldsOf(body: unknown): string[] {
  return validateCreateTicket(body).errors.map((e) => e.field);
}

describe("create ticket validation", () => {
  it("accepts valid input and returns trimmed values", () => {
    const result = validateCreateTicket({
      ...valid,
      summary: "   Laptop battery drains fast   ",
    });

    expect(result.errors).toEqual([]);
    expect(result.value?.summary).toBe("Laptop battery drains fast");
  });

  it("rejects whitespace-only text as missing", () => {
    const result = validateCreateTicket({ ...valid, summary: "      ", description: "   " });

    expect(fieldsOf({ ...valid, summary: "      ", description: "   " })).toEqual([
      "summary",
      "description",
    ]);
    expect(result.errors.every((e) => /required/i.test(e.message))).toBe(true);
    expect(result.value).toBeUndefined();
  });

  it("enforces the summary length boundaries", () => {
    expect(fieldsOf({ ...valid, summary: "a".repeat(9) })).toEqual(["summary"]);
    expect(fieldsOf({ ...valid, summary: "a".repeat(10) })).toEqual([]);
    expect(fieldsOf({ ...valid, summary: "a".repeat(120) })).toEqual([]);
    expect(fieldsOf({ ...valid, summary: "a".repeat(121) })).toEqual(["summary"]);
  });

  it("enforces the description length boundaries", () => {
    expect(fieldsOf({ ...valid, description: "a".repeat(19) })).toEqual(["description"]);
    expect(fieldsOf({ ...valid, description: "a".repeat(20) })).toEqual([]);
    expect(fieldsOf({ ...valid, description: "a".repeat(4000) })).toEqual([]);
    expect(fieldsOf({ ...valid, description: "a".repeat(4001) })).toEqual(["description"]);
  });

  it("rejects an unknown priority and accepts the four valid ones", () => {
    expect(fieldsOf({ ...valid, requestedPriority: "CRITICAL" })).toEqual(["requestedPriority"]);
    for (const priority of ["LOW", "MEDIUM", "HIGH", "URGENT"]) {
      expect(fieldsOf({ ...valid, requestedPriority: priority })).toEqual([]);
    }
  });

  it("reports every offending field at once, not just the first", () => {
    expect(fieldsOf({})).toEqual([
      "categoryId",
      "relatedSystemId",
      "summary",
      "description",
      "requestedPriority",
    ]);
  });

  it("rejects non-integer reference ids", () => {
    expect(fieldsOf({ ...valid, categoryId: "abc" })).toEqual(["categoryId"]);
    expect(fieldsOf({ ...valid, relatedSystemId: 0 })).toEqual(["relatedSystemId"]);
  });
});
