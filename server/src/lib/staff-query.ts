import { PRIORITIES, PriorityValue, FieldError } from "./validation.js";
import { STATUSES, StatusValue } from "./query.js";

// IT Staff queue query contract — docs/lab-03/api-spec.md §6.1.
//
// Decision C-04: a wrong FILTER changes which work is shown, so it fails with
// 400; a wrong SORT or PAGE only changes presentation, so it falls back to the
// documented default rather than blocking a queue someone is waiting on.

export const QUEUE_SORT_FIELDS = ["createdAt", "updatedAt", "ticketNumber", "itPriority", "status"] as const;
export type QueueSortField = (typeof QUEUE_SORT_FIELDS)[number];

export const ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof ORDERS)[number];

export const QUEUE_PAGE_SIZES = [10, 20, 50] as const;
export const DEFAULT_QUEUE_PAGE_SIZE = 10;
export const SEARCH_MAX = 120;

export const UNASSIGNED = "unassigned";

export interface StaffQueueQuery {
  search?: string;
  statuses: StatusValue[];
  categoryId?: number;
  itPriority?: PriorityValue;
  /** A user id, the literal "unassigned", or undefined for every owner. */
  ownerId?: number | typeof UNASSIGNED;
  sort: QueueSortField;
  order: SortOrder;
  page: number;
  pageSize: number;
}

export interface StaffQueueParseResult {
  errors: FieldError[];
  value?: StaffQueueQuery;
}

function values(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
  return typeof raw === "string" ? [raw] : [];
}

function first(raw: unknown): string | undefined {
  return values(raw)[0];
}

function positiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function parseStaffQueueQuery(query: Record<string, unknown>): StaffQueueParseResult {
  const errors: FieldError[] = [];

  const result: StaffQueueQuery = {
    statuses: [],
    sort: "createdAt",
    order: "desc",
    page: 1,
    pageSize: DEFAULT_QUEUE_PAGE_SIZE,
  };

  const search = first(query.search);
  if (search !== undefined) {
    const trimmed = search.trim();
    if (trimmed.length > SEARCH_MAX) {
      errors.push({ field: "search", message: `search must be ${SEARCH_MAX} characters or fewer` });
    } else if (trimmed !== "") {
      result.search = trimmed;
    }
  }

  // status is repeatable: ?status=NEW&status=OPEN
  for (const status of values(query.status)) {
    if (status === "") continue;
    if (!STATUSES.includes(status as StatusValue)) {
      errors.push({ field: "status", message: `status must be one of ${STATUSES.join(", ")}` });
    } else if (!result.statuses.includes(status as StatusValue)) {
      result.statuses.push(status as StatusValue);
    }
  }

  const categoryId = first(query.categoryId);
  if (categoryId !== undefined && categoryId !== "") {
    const id = positiveInt(categoryId);
    if (id === null) errors.push({ field: "categoryId", message: "categoryId must be a positive integer" });
    else result.categoryId = id;
  }

  const itPriority = first(query.itPriority);
  if (itPriority !== undefined && itPriority !== "") {
    if (!PRIORITIES.includes(itPriority as PriorityValue)) {
      errors.push({ field: "itPriority", message: `itPriority must be one of ${PRIORITIES.join(", ")}` });
    } else {
      result.itPriority = itPriority as PriorityValue;
    }
  }

  const ownerId = first(query.ownerId);
  if (ownerId !== undefined && ownerId !== "") {
    if (ownerId === UNASSIGNED) {
      result.ownerId = UNASSIGNED;
    } else {
      const id = positiveInt(ownerId);
      if (id === null) {
        errors.push({ field: "ownerId", message: `ownerId must be a positive integer or "${UNASSIGNED}"` });
      } else {
        result.ownerId = id;
      }
    }
  }

  // Presentation parameters never fail the request (C-04).
  const sort = first(query.sort);
  if (sort !== undefined && QUEUE_SORT_FIELDS.includes(sort as QueueSortField)) {
    result.sort = sort as QueueSortField;
  }

  const order = first(query.order);
  if (order !== undefined && ORDERS.includes(order as SortOrder)) {
    result.order = order as SortOrder;
  }

  const page = first(query.page);
  if (page !== undefined) {
    const parsed = positiveInt(page);
    if (parsed !== null) result.page = parsed;
  }

  const pageSize = first(query.pageSize);
  if (pageSize !== undefined) {
    const parsed = positiveInt(pageSize);
    if (parsed !== null && QUEUE_PAGE_SIZES.includes(parsed as (typeof QUEUE_PAGE_SIZES)[number])) {
      result.pageSize = parsed;
    }
  }

  return errors.length > 0 ? { errors } : { errors, value: result };
}

/** The Prisma `where` the parsed query describes. */
export function staffQueueWhere(query: StaffQueueQuery): Record<string, unknown> {
  return {
    ...(query.statuses.length > 0 ? { status: { in: query.statuses } } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.itPriority ? { itPriority: query.itPriority } : {}),
    ...(query.ownerId === UNASSIGNED
      ? { ownerId: null }
      : query.ownerId !== undefined
        ? { ownerId: query.ownerId }
        : {}),
    ...(query.search
      ? {
          OR: [
            { ticketNumber: { contains: query.search, mode: "insensitive" as const } },
            { summary: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

/**
 * Enum columns sort by their declared order in PostgreSQL, so IT Priority
 * sorts by severity (LOW … URGENT) and status by workflow position, not
 * alphabetically. createdAt is the tie-breaker so a page never reshuffles.
 */
export function staffQueueOrderBy(query: StaffQueueQuery): Record<string, unknown>[] {
  const primary = { [query.sort]: query.order };
  return query.sort === "createdAt" ? [primary] : [primary, { createdAt: "desc" }];
}
