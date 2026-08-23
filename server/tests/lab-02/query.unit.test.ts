import { describe, it, expect } from "vitest";
import { parseTicketListQuery, DEFAULT_PAGE_SIZE } from "../../src/lib/query.js";

// UNIT-05 — docs/lab-02/tests.md §2.1 (BR-24, BR-25)

describe("ticket list query parsing", () => {
  it("applies the documented defaults when nothing is supplied", () => {
    const { errors, value } = parseTicketListQuery({});

    expect(errors).toEqual([]);
    expect(value).toEqual({ sort: "createdAt", order: "desc", page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it("accepts every permitted page size and rejects the rest", () => {
    for (const size of ["5", "10", "20", "50"]) {
      expect(parseTicketListQuery({ pageSize: size }).value?.pageSize).toBe(Number(size));
    }

    const rejected = parseTicketListQuery({ pageSize: "7" });
    expect(rejected.value).toBeUndefined();
    expect(rejected.errors[0].field).toBe("pageSize");
  });

  it("rejects an unknown query parameter instead of ignoring it", () => {
    const { errors, value } = parseTicketListQuery({ pagesize: "50" });

    expect(value).toBeUndefined();
    expect(errors[0].field).toBe("pagesize");
    expect(errors[0].message).toMatch(/unknown query parameter/i);
  });

  it("rejects malformed numbers and unknown enum values", () => {
    expect(parseTicketListQuery({ page: "0" }).errors[0].field).toBe("page");
    expect(parseTicketListQuery({ page: "abc" }).errors[0].field).toBe("page");
    expect(parseTicketListQuery({ categoryId: "-2" }).errors[0].field).toBe("categoryId");
    expect(parseTicketListQuery({ requestedPriority: "CRITICAL" }).errors[0].field).toBe("requestedPriority");
    expect(parseTicketListQuery({ sort: "summary" }).errors[0].field).toBe("sort");
    expect(parseTicketListQuery({ order: "sideways" }).errors[0].field).toBe("order");
    expect(parseTicketListQuery({ status: "CLOSED" }).errors[0].field).toBe("status");
  });

  it("keeps valid filters, trims search, and ignores empty values", () => {
    const { value } = parseTicketListQuery({
      search: "  laptop  ",
      categoryId: "2",
      relatedSystemId: "7",
      requestedPriority: "HIGH",
      status: "NEW",
      sort: "updatedAt",
      order: "asc",
      page: "3",
      pageSize: "20",
    });

    expect(value).toEqual({
      search: "laptop",
      categoryId: 2,
      relatedSystemId: 7,
      requestedPriority: "HIGH",
      status: "NEW",
      sort: "updatedAt",
      order: "asc",
      page: 3,
      pageSize: 20,
    });

    expect(parseTicketListQuery({ search: "   ", categoryId: "" }).value).toEqual({
      sort: "createdAt",
      order: "desc",
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it("rejects a search term longer than the documented limit", () => {
    expect(parseTicketListQuery({ search: "a".repeat(121) }).errors[0].field).toBe("search");
    expect(parseTicketListQuery({ search: "a".repeat(120) }).errors).toEqual([]);
  });
});
