import { PRIORITIES, PriorityValue, FieldError } from "./validation.js";

// Ticket-list query contract — docs/lab-02/api-spec.md §3.2 (BR-21 … BR-27).
// Unknown or malformed parameters are rejected, never silently ignored (BR-25).

export const SORT_FIELDS = ["createdAt", "updatedAt", "ticketNumber", "requestedPriority"] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof ORDERS)[number];

export const STATUSES = ["NEW"] as const;
export type StatusValue = (typeof STATUSES)[number];

export const PAGE_SIZES = [5, 10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;
export const SEARCH_MAX = 120;

const ALLOWED_PARAMS = new Set([
  "search",
  "categoryId",
  "relatedSystemId",
  "requestedPriority",
  "status",
  "sort",
  "order",
  "page",
  "pageSize",
]);

export interface TicketListQuery {
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: PriorityValue;
  status?: StatusValue;
  sort: SortField;
  order: SortOrder;
  page: number;
  pageSize: number;
}

export interface QueryParseResult {
  errors: FieldError[];
  value?: TicketListQuery;
}

function firstValue(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) return typeof raw[0] === "string" ? raw[0] : undefined;
  return typeof raw === "string" ? raw : undefined;
}

function parsePositiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function parseTicketListQuery(query: Record<string, unknown>): QueryParseResult {
  const errors: FieldError[] = [];

  for (const name of Object.keys(query)) {
    if (!ALLOWED_PARAMS.has(name)) {
      errors.push({ field: name, message: `Unknown query parameter "${name}"` });
    }
  }

  const result: TicketListQuery = {
    sort: "createdAt",
    order: "desc",
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  };

  const search = firstValue(query.search);
  if (search !== undefined) {
    const trimmed = search.trim();
    if (trimmed.length > SEARCH_MAX) {
      errors.push({ field: "search", message: `search must be ${SEARCH_MAX} characters or fewer` });
    } else if (trimmed !== "") {
      result.search = trimmed;
    }
  }

  for (const field of ["categoryId", "relatedSystemId"] as const) {
    const raw = firstValue(query[field]);
    if (raw === undefined || raw === "") continue;
    const id = parsePositiveInt(raw);
    if (id === null) {
      errors.push({ field, message: `${field} must be a positive integer` });
    } else {
      result[field] = id;
    }
  }

  const priority = firstValue(query.requestedPriority);
  if (priority !== undefined && priority !== "") {
    if (!PRIORITIES.includes(priority as PriorityValue)) {
      errors.push({
        field: "requestedPriority",
        message: `requestedPriority must be one of ${PRIORITIES.join(", ")}`,
      });
    } else {
      result.requestedPriority = priority as PriorityValue;
    }
  }

  const status = firstValue(query.status);
  if (status !== undefined && status !== "") {
    if (!STATUSES.includes(status as StatusValue)) {
      errors.push({ field: "status", message: `status must be one of ${STATUSES.join(", ")}` });
    } else {
      result.status = status as StatusValue;
    }
  }

  const sort = firstValue(query.sort);
  if (sort !== undefined && sort !== "") {
    if (!SORT_FIELDS.includes(sort as SortField)) {
      errors.push({ field: "sort", message: `sort must be one of ${SORT_FIELDS.join(", ")}` });
    } else {
      result.sort = sort as SortField;
    }
  }

  const order = firstValue(query.order);
  if (order !== undefined && order !== "") {
    if (!ORDERS.includes(order as SortOrder)) {
      errors.push({ field: "order", message: `order must be one of ${ORDERS.join(", ")}` });
    } else {
      result.order = order as SortOrder;
    }
  }

  const page = firstValue(query.page);
  if (page !== undefined && page !== "") {
    const parsed = parsePositiveInt(page);
    if (parsed === null) {
      errors.push({ field: "page", message: "page must be a positive integer" });
    } else {
      result.page = parsed;
    }
  }

  const pageSize = firstValue(query.pageSize);
  if (pageSize !== undefined && pageSize !== "") {
    const parsed = parsePositiveInt(pageSize);
    if (parsed === null || !PAGE_SIZES.includes(parsed as (typeof PAGE_SIZES)[number])) {
      errors.push({ field: "pageSize", message: `pageSize must be one of ${PAGE_SIZES.join(", ")}` });
    } else {
      result.pageSize = parsed;
    }
  }

  return errors.length > 0 ? { errors } : { errors, value: result };
}
