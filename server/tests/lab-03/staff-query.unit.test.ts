import { describe, it, expect } from "vitest";
import {
  DEFAULT_QUEUE_PAGE_SIZE,
  parseStaffQueueQuery,
  staffQueueOrderBy,
  staffQueueWhere,
} from "../../src/lib/staff-query.js";

// U-12 … U-15 — docs/lab-03/tests.md §2.1

function parse(query: Record<string, unknown>) {
  return parseStaffQueueQuery(query);
}

describe("queue sorting and paging fall back instead of failing (C-04)", () => {
  // U-12 / AC-28
  it("defaults to newest first", () => {
    const { value } = parse({});
    expect(value).toMatchObject({ sort: "createdAt", order: "desc", page: 1, pageSize: DEFAULT_QUEUE_PAGE_SIZE });
  });

  it("accepts every documented sort field and both directions", () => {
    for (const sort of ["createdAt", "updatedAt", "ticketNumber", "itPriority", "status"]) {
      expect(parse({ sort, order: "asc" }).value).toMatchObject({ sort, order: "asc" });
    }
  });

  // U-12 / AC-28
  it("falls back to the default for an unknown sort or order", () => {
    const { errors, value } = parse({ sort: "dropTable", order: "sideways" });
    expect(errors).toEqual([]);
    expect(value).toMatchObject({ sort: "createdAt", order: "desc" });
  });

  // U-13 / AC-29
  it("falls back to page 1 and size 10 for unusable paging values", () => {
    expect(parse({ page: "0", pageSize: "7" }).value).toMatchObject({ page: 1, pageSize: 10 });
    expect(parse({ page: "abc", pageSize: "-3" }).value).toMatchObject({ page: 1, pageSize: 10 });
    expect(parse({ page: "3", pageSize: "50" }).value).toMatchObject({ page: 3, pageSize: 50 });
  });

  it("sorts by createdAt as the tie-breaker for every other column", () => {
    expect(staffQueueOrderBy(parse({ sort: "itPriority", order: "desc" }).value!)).toEqual([
      { itPriority: "desc" },
      { createdAt: "desc" },
    ]);
    expect(staffQueueOrderBy(parse({}).value!)).toEqual([{ createdAt: "desc" }]);
  });
});

describe("queue filters are rejected when they are wrong (C-04)", () => {
  // U-15 / AC-27
  it("rejects an unknown status, IT Priority, category or owner", () => {
    expect(parse({ status: "ALMOST_DONE" }).errors[0].field).toBe("status");
    expect(parse({ itPriority: "SOON" }).errors[0].field).toBe("itPriority");
    expect(parse({ categoryId: "abc" }).errors[0].field).toBe("categoryId");
    expect(parse({ ownerId: "nobody" }).errors[0].field).toBe("ownerId");
    expect(parse({ status: "ALMOST_DONE" }).value).toBeUndefined();
  });

  // U-14 / AC-27
  it("accepts a repeated status filter without duplicating it", () => {
    const { value } = parse({ status: ["NEW", "OPEN", "NEW"] });
    expect(value!.statuses).toEqual(["NEW", "OPEN"]);
    expect(staffQueueWhere(value!)).toMatchObject({ status: { in: ["NEW", "OPEN"] } });
  });

  // U-14 / AC-27
  it("turns ownerId=unassigned into a null owner filter", () => {
    expect(staffQueueWhere(parse({ ownerId: "unassigned" }).value!)).toMatchObject({ ownerId: null });
    expect(staffQueueWhere(parse({ ownerId: "26" }).value!)).toMatchObject({ ownerId: 26 });
    expect(staffQueueWhere(parse({}).value!)).not.toHaveProperty("ownerId");
  });

  it("searches ticket number and summary, case-insensitively", () => {
    const where = staffQueueWhere(parse({ search: "  vpn  " }).value!);
    expect(where).toMatchObject({
      OR: [
        { ticketNumber: { contains: "vpn", mode: "insensitive" } },
        { summary: { contains: "vpn", mode: "insensitive" } },
      ],
    });
  });

  it("ignores an empty search and rejects an over-long one", () => {
    expect(staffQueueWhere(parse({ search: "   " }).value!)).not.toHaveProperty("OR");
    expect(parse({ search: "x".repeat(121) }).errors[0].field).toBe("search");
  });

  it("combines several filters into one where clause", () => {
    const { value } = parse({ status: "IN_PROGRESS", categoryId: "2", itPriority: "HIGH", ownerId: "7" });
    expect(staffQueueWhere(value!)).toMatchObject({
      status: { in: ["IN_PROGRESS"] },
      categoryId: 2,
      itPriority: "HIGH",
      ownerId: 7,
    });
  });
});
