import { describe, it, expect } from "vitest";
import { formatTicketNumber, TICKET_NUMBER_PATTERN } from "../../src/lib/ticket-number.js";

// UNIT-01, UNIT-02 — docs/lab-02/tests.md §2.1 (BR-01)

describe("ticket number generator", () => {
  it("returns the required TKT-<year>-<6 digits> format", () => {
    expect(formatTicketNumber(2026, 42)).toBe("TKT-2026-000042");
    expect(formatTicketNumber(2026, 42)).toMatch(TICKET_NUMBER_PATTERN);
  });

  it("pads small ids and keeps long ids intact", () => {
    expect(formatTicketNumber(2026, 1)).toBe("TKT-2026-000001");
    expect(formatTicketNumber(2026, 999999)).toBe("TKT-2026-999999");
    expect(formatTicketNumber(2026, 1234567)).toBe("TKT-2026-1234567");
    expect(formatTicketNumber(2026, 1234567)).toMatch(TICKET_NUMBER_PATTERN);
  });

  it("uses the year it is given", () => {
    expect(formatTicketNumber(2027, 7)).toBe("TKT-2027-000007");
  });
});
