import { describe, it, expect } from "vitest";
import { BODY_MAX, validateEntryBody } from "../../src/lib/content.js";

// U-16 — docs/lab-03/tests.md §2.1. One rule serves both threads (BR-45).

describe("comment and note body validation", () => {
  it("rejects an empty body", () => {
    expect(validateEntryBody("").value).toBeUndefined();
    expect(validateEntryBody("").errors).toEqual([{ field: "body", message: "Comment is required" }]);
  });

  it("rejects a whitespace-only body", () => {
    expect(validateEntryBody("   \n\t ").value).toBeUndefined();
  });

  it("rejects a non-string body", () => {
    for (const raw of [undefined, null, 42, {}, []]) {
      expect(validateEntryBody(raw).value).toBeUndefined();
    }
  });

  it("accepts one character and exactly the maximum", () => {
    expect(validateEntryBody("k").value).toBe("k");
    expect(validateEntryBody("x".repeat(BODY_MAX)).value).toHaveLength(BODY_MAX);
  });

  it("rejects one character over the maximum", () => {
    const result = validateEntryBody("x".repeat(BODY_MAX + 1));
    expect(result.value).toBeUndefined();
    expect(result.errors[0].message).toContain(String(BODY_MAX));
  });

  it("trims the stored value", () => {
    expect(validateEntryBody("  hello  ").value).toBe("hello");
  });

  it("names the thread in the message so the right composer is blamed", () => {
    expect(validateEntryBody("", "Internal Note").errors[0].message).toBe("Internal Note is required");
  });
});
