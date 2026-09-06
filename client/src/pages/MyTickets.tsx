import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCategories, getRelatedSystems, ReferenceItem } from "../api/reference.js";
import { listTickets, TicketListResponse } from "../api/tickets.js";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import { useRequester } from "../context/RequesterContext.js";

// My Tickets — docs/lab-02/ui-spec.md §7.3, api-spec.md §3.2.

const PAGE_SIZES = [5, 10, 20, 50];

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "ticketNumber:asc", label: "Ticket number" },
  { value: "requestedPriority:desc", label: "Priority" },
];

const SEARCH_DEBOUNCE_MS = 300;

interface Filters {
  search: string;
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: string;
  status: string;
  sort: string;
  pageSize: number;
}

const DEFAULT_FILTERS: Filters = {
  search: "",
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  status: "",
  sort: "createdAt:desc",
  pageSize: 10,
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export default function MyTickets() {
  const { version } = useRequester();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [data, setData] = useState<TicketListResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [categories, setCategories] = useState<ReferenceItem[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<ReferenceItem[]>([]);

  const filtersApplied = useMemo(
    () =>
      filters.search !== "" ||
      filters.categoryId !== "" ||
      filters.relatedSystemId !== "" ||
      filters.requestedPriority !== "" ||
      filters.status !== "",
    [filters]
  );

  useEffect(() => {
    Promise.all([getCategories(), getRelatedSystems()])
      .then(([categoryList, systemList]) => {
        setCategories(categoryList);
        setRelatedSystems(systemList);
      })
      .catch(() => {
        // Filters degrade to search-only; the list itself reports its own failure.
      });
  }, []);

  // Typing should not fire a request per keystroke (ui-spec §7.3).
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => (current.search === searchInput ? current : { ...current, search: searchInput }));
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // BR-08 — a requester switch reloads the list for the new identity.
  useEffect(() => {
    setPage(1);
  }, [version]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    const [sort, order] = filters.sort.split(":");
    listTickets({
      search: filters.search,
      categoryId: filters.categoryId,
      relatedSystemId: filters.relatedSystemId,
      requestedPriority: filters.requestedPriority,
      status: filters.status,
      sort,
      order,
      page,
      pageSize: filters.pageSize,
    })
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [filters, page, version, reloadToken]);

  function updateFilter(field: keyof Filters, value: string | number) {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setSearchInput("");
    setPage(1);
  }

  const items = data?.items ?? [];
  const showEmpty = state === "ready" && items.length === 0 && !filtersApplied;
  const showNoResults = state === "ready" && items.length === 0 && filtersApplied;
  const firstIndex = data && data.totalItems > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastIndex = data ? Math.min(data.page * data.pageSize, data.totalItems) : 0;

  return (
    <main className="zg-page">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 className="zg-page-title mb-0">My Tickets</h1>
        <Link className="zg-btn zg-btn-primary" to="/tickets/new">
          Create Ticket
        </Link>
      </div>

      <section className="zg-card zg-toolbar mb-3" aria-label="Ticket filters">
        <div className="zg-field">
          <label className="zg-label" htmlFor="search">
            Search
          </label>
          <input
            id="search"
            className="zg-input"
            type="search"
            placeholder="Ticket number or summary"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        <div className="zg-field">
          <label className="zg-label" htmlFor="filterCategory">
            Category
          </label>
          <select
            id="filterCategory"
            className="zg-select"
            value={filters.categoryId}
            onChange={(event) => updateFilter("categoryId", event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="zg-field">
          <label className="zg-label" htmlFor="filterSystem">
            Related System
          </label>
          <select
            id="filterSystem"
            className="zg-select"
            value={filters.relatedSystemId}
            onChange={(event) => updateFilter("relatedSystemId", event.target.value)}
          >
            <option value="">All related systems</option>
            {relatedSystems.map((system) => (
              <option key={system.id} value={system.id}>
                {system.name}
              </option>
            ))}
          </select>
        </div>

        <div className="zg-field">
          <label className="zg-label" htmlFor="filterPriority">
            Requested Priority
          </label>
          <select
            id="filterPriority"
            className="zg-select"
            value={filters.requestedPriority}
            onChange={(event) => updateFilter("requestedPriority", event.target.value)}
          >
            <option value="">All priorities</option>
            {["LOW", "MEDIUM", "HIGH", "URGENT"].map((priority) => (
              <option key={priority} value={priority}>
                {priority.charAt(0) + priority.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="zg-field">
          <label className="zg-label" htmlFor="filterStatus">
            Status
          </label>
          <select
            id="filterStatus"
            className="zg-select"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="NEW">New</option>
          </select>
        </div>

        <div className="zg-field">
          <label className="zg-label" htmlFor="sort">
            Sort by
          </label>
          <select
            id="sort"
            className="zg-select"
            value={filters.sort}
            onChange={(event) => updateFilter("sort", event.target.value)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="zg-field">
          <label className="zg-label" htmlFor="pageSize">
            Per page
          </label>
          <select
            id="pageSize"
            className="zg-select"
            value={filters.pageSize}
            onChange={(event) => updateFilter("pageSize", Number(event.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="zg-field zg-toolbar-actions">
          <button type="button" className="zg-btn zg-btn-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </section>

      {state === "loading" && (
        <p role="status" aria-live="polite">
          Loading tickets…
        </p>
      )}

      {state === "failed" && (
        <div className="zg-callout zg-callout-error" role="alert">
          <p className="mb-2">Unable to load your tickets.</p>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={() => setReloadToken((t) => t + 1)}>
            Retry
          </button>
        </div>
      )}

      {showEmpty && (
        <div className="zg-callout zg-callout-info" role="status">
          <p className="mb-2">You have not created any tickets yet.</p>
          <Link className="zg-btn zg-btn-primary" to="/tickets/new">
            Create Ticket
          </Link>
        </div>
      )}

      {showNoResults && (
        <div className="zg-callout zg-callout-info" role="status">
          <p className="mb-2">No tickets match these filters.</p>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {state === "ready" && items.length > 0 && (
        <>
          <div className="zg-card zg-table-card">
            <div className="zg-table-wrap">
              <table className="zg-table">
              <caption className="visually-hidden">Tickets belonging to the selected Development Requester</caption>
              <thead>
                <tr>
                  <th scope="col">Ticket Number</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="zg-col-system">
                    Related System
                  </th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ticket) => (
                  <tr key={ticket.id}>
                    <td data-label="Ticket Number">
                      <Link to={`/tickets/${ticket.id}`}>{ticket.ticketNumber}</Link>
                    </td>
                    <td data-label="Summary" title={ticket.summary}>
                      <span className="zg-truncate">{ticket.summary}</span>
                    </td>
                    <td data-label="Category">{ticket.category.name}</td>
                    <td data-label="Related System" className="zg-col-system">
                      {ticket.relatedSystem.name}
                    </td>
                    <td data-label="Priority">
                      <PriorityBadge value={ticket.requestedPriority} />
                    </td>
                    <td data-label="Status">
                      <StatusBadge value={ticket.status} />
                    </td>
                    <td data-label="Last Updated">{formatDate(ticket.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </div>

          <nav className="zg-pagination" aria-label="Ticket list pages">
            <p className="zg-muted mb-0">
              Showing {firstIndex}–{lastIndex} of {data?.totalItems}
            </p>
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="zg-btn zg-btn-secondary"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={(data?.page ?? 1) <= 1}
              >
                Previous
              </button>
              <span aria-current="page">
                Page {data?.page} of {data?.totalPages}
              </span>
              <button
                type="button"
                className="zg-btn zg-btn-secondary"
                onClick={() => setPage((current) => current + 1)}
                disabled={(data?.page ?? 1) >= (data?.totalPages ?? 1)}
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </main>
  );
}
