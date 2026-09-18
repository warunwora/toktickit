import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { getCategories, ReferenceItem } from "../api/reference.js";
import { QueueQuery, QueueResponse, QueueSortField, getQueue } from "../api/staff.js";
import { Priority, TicketStatus } from "../api/tickets.js";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import { useAuth } from "../context/AuthContext.js";

// IT Staff Ticket Queue — docs/lab-03/ui-spec.md §5.4, api-spec.md §6.1.

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "WAITING_FOR_REQUESTER", label: "Waiting for Requester" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "REOPENED", label: "Reopened" },
  { value: "CANCELLED", label: "Cancelled" },
];

const PRIORITY_OPTIONS: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const PAGE_SIZES = [10, 20, 50];

const COLUMNS: { field: QueueSortField | null; label: string }[] = [
  { field: "ticketNumber", label: "Ticket No." },
  { field: "createdAt", label: "Created" },
  { field: null, label: "Summary" },
  { field: null, label: "Category" },
  { field: null, label: "Req. Priority" },
  { field: "itPriority", label: "IT Priority" },
  { field: "status", label: "Status" },
  { field: null, label: "Owner" },
  { field: "updatedAt", label: "Last Updated" },
];

interface Filters {
  status: TicketStatus | "";
  categoryId: number | "";
  itPriority: Priority | "";
  ownerId: number | "unassigned" | "";
}

const EMPTY_FILTERS: Filters = { status: "", categoryId: "", itPriority: "", ownerId: "" };

function formatDate(value: string): string {
  // A compact, unambiguous stamp: the queue has nine columns and cannot spend
  // three lines on a date (ui-spec.md §5.4).
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function StaffTicketQueue() {
  const { user } = useAuth();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<QueueSortField>("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [categories, setCategories] = useState<ReferenceItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "failed">("loading");
  const [data, setData] = useState<QueueResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const hasFilters = useMemo(
    () => search !== "" || Object.values(filters).some((value) => value !== ""),
    [search, filters]
  );

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    const query: QueueQuery = { search, ...filters, sort, order, page, pageSize };

    getQueue(query)
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setState(error instanceof ApiError && error.status === 403 ? "forbidden" : "failed");
      });

    return () => {
      cancelled = true;
    };
  }, [search, filters, sort, order, page, pageSize, reloadToken]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function toggleSort(field: QueueSortField) {
    if (sort === field) {
      setOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder("desc");
    }
    setPage(1);
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function ariaSort(field: QueueSortField | null): "ascending" | "descending" | "none" | undefined {
    if (!field) return undefined;
    if (sort !== field) return "none";
    return order === "asc" ? "ascending" : "descending";
  }

  if (state === "forbidden") {
    return (
      <main className="zg-page">
        <h1 className="zg-page-title">Ticket Queue</h1>
        <div className="zg-callout zg-callout-error" role="alert">
          You do not have access to this screen.
        </div>
      </main>
    );
  }

  const tickets = data?.tickets ?? [];
  const showingFrom = data && data.totalItems > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const showingTo = data ? Math.min(data.page * data.pageSize, data.totalItems) : 0;

  return (
    <main className="zg-page">
      <h1 className="zg-page-title">Ticket Queue</h1>

      <section className="zg-card zg-toolbar" aria-label="Ticket filters">
        <div className="row g-3">
          <div className="col-12 col-lg-4 zg-field">
            <label className="zg-label" htmlFor="queue-search">
              Search
            </label>
            <input
              id="queue-search"
              className="form-control zg-input"
              type="search"
              placeholder="Ticket number or summary"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          <div className="col-6 col-lg-2 zg-field">
            <label className="zg-label" htmlFor="queue-status">
              Status
            </label>
            <select
              id="queue-status"
              className="form-select zg-select"
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value as TicketStatus | "")}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-6 col-lg-2 zg-field">
            <label className="zg-label" htmlFor="queue-category">
              Category
            </label>
            <select
              id="queue-category"
              className="form-select zg-select"
              value={filters.categoryId}
              onChange={(event) =>
                updateFilter("categoryId", event.target.value === "" ? "" : Number(event.target.value))
              }
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-6 col-lg-2 zg-field">
            <label className="zg-label" htmlFor="queue-priority">
              IT Priority
            </label>
            <select
              id="queue-priority"
              className="form-select zg-select"
              value={filters.itPriority}
              onChange={(event) => updateFilter("itPriority", event.target.value as Priority | "")}
            >
              <option value="">All priorities</option>
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>
                  {priority.charAt(0) + priority.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="col-6 col-lg-2 zg-field">
            <label className="zg-label" htmlFor="queue-owner">
              Owner
            </label>
            <select
              id="queue-owner"
              className="form-select zg-select"
              value={filters.ownerId}
              onChange={(event) =>
                updateFilter(
                  "ownerId",
                  event.target.value === "" || event.target.value === "unassigned"
                    ? (event.target.value as "" | "unassigned")
                    : Number(event.target.value)
                )
              }
            >
              <option value="">All owners</option>
              <option value="unassigned">Unassigned</option>
              {user ? <option value={user.id}>Assigned to me</option> : null}
            </select>
          </div>

          <div className="col-6 col-lg-2 zg-field">
            <label className="zg-label" htmlFor="queue-page-size">
              Per page
            </label>
            <select
              id="queue-page-size"
              className="form-select zg-select"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-lg-2 d-flex align-items-end">
            <button type="button" className="zg-btn zg-btn-tertiary" onClick={clearFilters} disabled={!hasFilters}>
              Clear filters
            </button>
          </div>
        </div>
      </section>

      {state === "failed" ? (
        <div className="zg-callout zg-callout-error" role="alert">
          <p className="mb-2">The ticket queue could not be loaded.</p>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={() => setReloadToken((t) => t + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      {state === "loading" ? (
        <p role="status" aria-live="polite">
          Loading tickets…
        </p>
      ) : null}

      {state === "ready" && data ? (
        <>
          <p className="zg-result-count" role="status" aria-live="polite">
            {data.totalItems === 0
              ? "No tickets to show"
              : `Showing ${showingFrom} to ${showingTo} of ${data.totalItems} tickets`}
          </p>

          {tickets.length === 0 ? (
            <div className="zg-card zg-empty">
              {hasFilters ? (
                <>
                  <p className="mb-2">No tickets match these filters.</p>
                  <button type="button" className="zg-btn zg-btn-secondary" onClick={clearFilters}>
                    Clear filters
                  </button>
                </>
              ) : (
                <p className="mb-0">No tickets in the queue yet.</p>
              )}
            </div>
          ) : (
            <>
              <div className="zg-card zg-table-card zg-queue-table">
                <div className="zg-table-wrap">
                  <table className="table zg-table">
                    <thead>
                      <tr>
                        {COLUMNS.map((column) => (
                          <th key={column.label} scope="col" aria-sort={ariaSort(column.field)}>
                            {column.field ? (
                              <button
                                type="button"
                                className="zg-sort-button"
                                onClick={() => toggleSort(column.field as QueueSortField)}
                              >
                                {column.label}
                                <span aria-hidden="true">
                                  {sort === column.field ? (order === "asc" ? " ▲" : " ▼") : " ↕"}
                                </span>
                              </button>
                            ) : (
                              column.label
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map((ticket) => (
                        <tr key={ticket.id}>
                          <td>
                            <Link to={`/staff/tickets/${ticket.id}`}>{ticket.ticketNumber}</Link>
                          </td>
                          <td>{formatDate(ticket.createdAt)}</td>
                          <td>{ticket.summary}</td>
                          <td>{ticket.category.name}</td>
                          <td>
                            <PriorityBadge value={ticket.requestedPriority} />
                          </td>
                          <td>
                            <PriorityBadge value={ticket.itPriority} />
                          </td>
                          <td>
                            <StatusBadge value={ticket.status} />
                            {ticket.requesterResolvedAt ? (
                              <span className="zg-badge zg-badge-requester-resolved">Requester says resolved</span>
                            ) : null}
                          </td>
                          <td>
                            {ticket.owner ? (
                              ticket.owner.name
                            ) : (
                              <span className="zg-badge zg-badge-unassigned">Unassigned</span>
                            )}
                          </td>
                          <td>{formatDate(ticket.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <ul className="zg-queue-cards" aria-label="Ticket queue">
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="zg-card zg-queue-card">
                    <div className="zg-queue-card-head">
                      <Link to={`/staff/tickets/${ticket.id}`}>{ticket.ticketNumber}</Link>
                      <StatusBadge value={ticket.status} />
                    </div>
                    <p className="zg-queue-card-summary">{ticket.summary}</p>
                    <dl className="zg-queue-card-grid">
                      <div>
                        <dt>Category</dt>
                        <dd>{ticket.category.name}</dd>
                      </div>
                      <div>
                        <dt>IT Priority</dt>
                        <dd>
                          <PriorityBadge value={ticket.itPriority} />
                        </dd>
                      </div>
                      <div>
                        <dt>Owner</dt>
                        <dd>
                          {ticket.owner ? (
                            ticket.owner.name
                          ) : (
                            <span className="zg-badge zg-badge-unassigned">Unassigned</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Last updated</dt>
                        <dd>{formatDate(ticket.updatedAt)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>

              <nav className="zg-pagination" aria-label="Ticket queue pages">
                <button
                  type="button"
                  className="zg-btn zg-btn-tertiary"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={data.page <= 1}
                >
                  Previous
                </button>
                <span>
                  Page {data.page} of {data.totalPages}
                </span>
                <button
                  type="button"
                  className="zg-btn zg-btn-tertiary"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={data.page >= data.totalPages}
                >
                  Next
                </button>
              </nav>
            </>
          )}
        </>
      ) : null}
    </main>
  );
}
