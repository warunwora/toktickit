import { ReactNode, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { RecentTicket } from "../api/dashboard.js";
import { formatBangkok } from "../lib/actions.js";
import { useAuth } from "../context/AuthContext.js";
import { StatusBadge } from "./Badges.js";

// The shared dashboard pattern — docs/lab-04/ui-spec.md §2. Both dashboards
// are this frame with different cards and lists inside it.

export type DashboardState<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "forbidden" }
  | { kind: "failed" };

/** Loads one dashboard and exposes Retry / Refresh; never shows raw error text. */
export function useDashboard<T>(load: () => Promise<T>) {
  const [state, setState] = useState<DashboardState<T>>({ kind: "loading" });
  const [token, setToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    load()
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ kind: error instanceof ApiError && error.status === 403 ? "forbidden" : "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [load, token]);

  const reload = useCallback(() => setToken((t) => t + 1), []);
  return { state, reload };
}

interface FrameProps {
  state: DashboardState<unknown>;
  reload: () => void;
  children?: ReactNode;
}

export function DashboardFrame({ state, reload, children }: FrameProps) {
  const { user } = useAuth();
  const firstName = user?.name.split(" ")[0] ?? "";

  return (
    <main className="zg-page" aria-busy={state.kind === "loading" ? true : undefined}>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 className="zg-page-title mb-0">Welcome back, {firstName}</h1>
        <button type="button" className="zg-btn zg-btn-tertiary" onClick={reload} disabled={state.kind === "loading"}>
          Refresh
        </button>
      </div>

      {state.kind === "loading" ? (
        <p role="status" aria-live="polite" className="visually-hidden">
          Loading dashboard…
        </p>
      ) : null}

      {state.kind === "failed" ? (
        <div className="zg-callout zg-callout-error" role="alert">
          <span>The dashboard could not be loaded.</span>
          <button type="button" className="zg-btn zg-btn-secondary ms-2" onClick={reload}>
            Retry
          </button>
        </div>
      ) : null}

      {state.kind === "forbidden" ? (
        <div className="zg-callout zg-callout-error" role="alert">
          You do not have access to this dashboard.
        </div>
      ) : null}

      {state.kind === "loading" || state.kind === "ready" ? children : null}
    </main>
  );
}

interface MetricProps {
  label: string;
  value: number | null;
  /** Completes "View …" so the link names its metric (ui-spec.md §8). */
  viewName: string;
  to: string;
}

/** A card with label, value and View link; the card itself is not a link (§2). */
export function MetricCard({ label, value, viewName, to }: MetricProps) {
  return (
    <section className="zg-card zg-metric" aria-label={label}>
      <h2 className="zg-metric-label">{label}</h2>
      {value === null ? (
        <span className="zg-metric-skeleton" aria-busy="true" aria-label={`${label} loading`} />
      ) : (
        <p className="zg-metric-value">{value}</p>
      )}
      {value === 0 ? <p className="zg-muted zg-metric-empty">Nothing here right now</p> : null}
      {/* Only once the server's link has arrived: a View followed during
          loading must not open an unfiltered list (BR-36). */}
      {value === null ? null : (
        <Link className="zg-metric-link" to={to} aria-label={`View ${viewName}`}>
          View →
        </Link>
      )}
    </section>
  );
}

interface RecentProps {
  title: string;
  tickets: RecentTicket[] | null;
  ticketPath: (id: number) => string;
  viewAll?: string;
  /** Which timestamp the list is about. */
  dateField?: "updatedAt" | "resolvedAt";
}

export function RecentTickets({ title, tickets, ticketPath, viewAll, dateField = "updatedAt" }: RecentProps) {
  return (
    <section className="zg-card zg-dashboard-list" aria-label={title}>
      <div className="zg-thread-head">
        <h2 className="zg-section-title mb-0">{title}</h2>
        {viewAll ? (
          <Link to={viewAll} aria-label={`View all ${title.toLowerCase()}`}>
            View all →
          </Link>
        ) : null}
      </div>
      {tickets === null ? null : tickets.length === 0 ? (
        <p className="zg-empty-line mb-0">No recent tickets.</p>
      ) : (
        <ul className="zg-recent-list">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="zg-recent-item">
              <Link to={ticketPath(ticket.id)} className="zg-recent-number">
                {ticket.ticketNumber}
              </Link>
              <span className="zg-recent-summary" title={ticket.summary}>
                {ticket.summary}
              </span>
              <StatusBadge value={ticket.status} />
              <time className="zg-muted zg-recent-time" dateTime={ticket[dateField] ?? ticket.updatedAt}>
                {formatBangkok(ticket[dateField] ?? ticket.updatedAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
