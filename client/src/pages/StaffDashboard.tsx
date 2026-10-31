import { Link } from "react-router-dom";
import { ROLE_LABEL, RoleName } from "../api/auth.js";
import { getStaffDashboard } from "../api/dashboard.js";
import { Priority, TicketStatus } from "../api/tickets.js";
import { DashboardFrame, MetricCard, RecentTickets, useDashboard } from "../components/Dashboard.js";
import { ActionStatusBadge } from "../components/ActionsTaken.js";
import { PriorityBadge } from "../components/Badges.js";
import { formatBangkok } from "../lib/actions.js";
import { STATUS_LABEL } from "../lib/transitions.js";

// IT Staff and Administrator Dashboard — docs/lab-04/ui-spec.md §2.2, §2.3,
// api-spec.md §5.2. One screen for both roles; the Users group appears only
// when the API sends it, which it does for Administrators only (D-09).

const STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];
const PRIORITIES: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const ROLES: RoleName[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];

export default function StaffDashboard() {
  const { state, reload } = useDashboard(getStaffDashboard);
  const data = state.kind === "ready" ? state.data : null;

  return (
    <DashboardFrame state={state} reload={reload}>
      <div className="zg-metric-grid">
        <MetricCard
          label="Unassigned"
          value={data?.metrics.unassigned ?? null}
          viewName="unassigned tickets"
          to={data?.links.unassigned ?? "/staff/queue"}
        />
        <MetricCard
          label="Owned by me"
          value={data?.metrics.ownedByMe ?? null}
          viewName="tickets owned by me"
          to={data?.links.ownedByMe ?? "/staff/queue"}
        />
        <MetricCard
          label="My open actions"
          value={data?.metrics.myOpenActions ?? null}
          viewName="my open actions"
          to="#my-open-actions"
        />
        <MetricCard
          label="Urgent (active)"
          value={data?.metrics.urgentActive ?? null}
          viewName="urgent active tickets"
          to={data?.links.urgentActive ?? "/staff/queue"}
        />
      </div>

      {data?.users ? (
        <section className="zg-card zg-dashboard-users" aria-label="Users">
          <h2 className="zg-section-title">Users</h2>
          <ul className="zg-breakdown">
            {ROLES.map((role) => (
              <li key={role} className="zg-breakdown-row">
                <span>{ROLE_LABEL[role]}</span>
                <span>
                  {data.users![role].active} active · {data.users![role].inactive} inactive
                </span>
                <Link to={data.users![role].link} aria-label={`View ${ROLE_LABEL[role]} users`}>
                  View →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="zg-dashboard-lists">
        <section className="zg-card" aria-label="By status">
          <h2 className="zg-section-title">By status</h2>
          {data ? (
            <ul className="zg-breakdown">
              {STATUSES.map((status) => (
                <li key={status} className="zg-breakdown-row">
                  <span>{STATUS_LABEL[status]}</span>
                  <span className="zg-breakdown-count">{data.byStatus[status]}</span>
                  <Link to={data.links.byStatus[status]} aria-label={`View ${STATUS_LABEL[status]} tickets`}>
                    View →
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="zg-card" aria-label="By IT Priority">
          <h2 className="zg-section-title">By IT Priority (active)</h2>
          {data ? (
            <ul className="zg-breakdown">
              {PRIORITIES.map((priority) => (
                <li key={priority} className="zg-breakdown-row">
                  <PriorityBadge value={priority} />
                  <span className="zg-breakdown-count">{data.byItPriority[priority]}</span>
                  <Link
                    to={data.links.byItPriority[priority]}
                    aria-label={`View active ${priority.toLowerCase()} priority tickets`}
                  >
                    View →
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="zg-card zg-dashboard-list" id="my-open-actions" aria-label="Open actions assigned to me">
          <h2 className="zg-section-title">My open actions</h2>
          {data === null ? null : data.myOpenActionsList.length === 0 ? (
            <p className="zg-empty-line mb-0">No open actions assigned to you.</p>
          ) : (
            <ul className="zg-recent-list">
              {data.myOpenActionsList.map((action) => (
                <li key={action.id} className="zg-recent-item">
                  <Link to={action.link} className="zg-recent-number">
                    {action.ticketNumber}
                  </Link>
                  <span className="zg-recent-summary" title={action.description}>
                    {action.description}
                  </span>
                  <ActionStatusBadge value={action.status} />
                  <time className="zg-muted zg-recent-time" dateTime={action.actionAt}>
                    {formatBangkok(action.actionAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <RecentTickets
          title="Recently updated"
          tickets={data?.recentlyUpdated ?? null}
          ticketPath={(id) => `/staff/tickets/${id}`}
          viewAll={data?.links.recentlyUpdated}
        />
      </div>
    </DashboardFrame>
  );
}
