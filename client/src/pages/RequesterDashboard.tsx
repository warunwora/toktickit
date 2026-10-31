import { Link } from "react-router-dom";
import { getRequesterDashboard } from "../api/dashboard.js";
import { DashboardFrame, MetricCard, RecentTickets, useDashboard } from "../components/Dashboard.js";

// Requester Dashboard — docs/lab-04/ui-spec.md §2.1, api-spec.md §5.1.
// Every count is the backend's, for this Requester's own tickets only (BR-37).

export default function RequesterDashboard() {
  const { state, reload } = useDashboard(getRequesterDashboard);
  const data = state.kind === "ready" ? state.data : null;

  return (
    <DashboardFrame state={state} reload={reload}>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <Link className="zg-btn zg-btn-primary" to="/tickets/new">
          Create Ticket
        </Link>
        <Link className="zg-btn zg-btn-secondary" to="/tickets">
          View My Tickets
        </Link>
      </div>

      <div className="zg-metric-grid">
        <MetricCard
          label="Open tickets"
          value={data?.metrics.open ?? null}
          viewName="open tickets"
          to={data?.links.open ?? "/tickets?statusGroup=active"}
        />
        <MetricCard
          label="Waiting for me"
          value={data?.metrics.waitingForMe ?? null}
          viewName="tickets waiting for me"
          to={data?.links.waitingForMe ?? "/tickets?status=WAITING_FOR_REQUESTER"}
        />
        <MetricCard
          label="Resolved"
          value={data?.metrics.resolved ?? null}
          viewName="resolved tickets"
          to={data?.links.resolved ?? "/tickets?status=RESOLVED"}
        />
        <MetricCard
          label="Closed"
          value={data?.metrics.closed ?? null}
          viewName="closed tickets"
          to={data?.links.closed ?? "/tickets?status=CLOSED"}
        />
      </div>

      <div className="zg-dashboard-lists">
        <RecentTickets
          title="Recently updated"
          tickets={data?.recentlyUpdated ?? null}
          ticketPath={(id) => `/tickets/${id}`}
          viewAll={data?.links.recentlyUpdated}
        />
        <RecentTickets
          title="Recently resolved"
          tickets={data?.recentlyResolved ?? null}
          ticketPath={(id) => `/tickets/${id}`}
          dateField="resolvedAt"
        />
      </div>
    </DashboardFrame>
  );
}
