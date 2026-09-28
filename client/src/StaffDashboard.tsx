import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "./components/Badge.js";
import MetricCard from "./components/MetricCard.js";
import { useAuth } from "./AuthContext.js";
import { DashboardMetric, getStaffDashboard, StaffDashboardData } from "./api.js";
import { STATUS_LABELS, statusTone } from "./ticketStatus.js";
import { ACTION_STATUS_LABELS, actionStatusTone } from "./actionStatus.js";
import { formatDateTime } from "./dates.js";

const ACTIVE = "NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,RESOLVED,REOPENED";

// ui-spec.md §2.2 / §2.3 — IT Staff and Administrator dashboard. Every number
// comes from GET /api/dashboard/staff; nothing is counted in the browser.
export default function StaffDashboard() {
  const { user } = useAuth();
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [error, setError] = useState("");
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getStaffDashboard());
      setState("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dashboard data could not be loaded.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function retry() {
    setState("loading");
    load();
  }

  const firstName = user?.name.split(" ")[0] ?? "";
  const accountMetrics: DashboardMetric[] = data?.accounts
    ? [
        { key: "activeUsers", label: "Active Users", count: data.accounts.active, drillDown: { path: "/admin/users" } },
        { key: "inactiveUsers", label: "Inactive Users", count: data.accounts.inactive, drillDown: { path: "/admin/users" } },
      ]
    : [];

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">Welcome back, {firstName}</h1>
          <p className="text-muted mb-0">Here's what's happening with your queue today.</p>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={refresh} disabled={refreshing || state === "loading"}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {state === "loading" && (
        <div>
          <p role="status" className="visually-hidden">
            Loading dashboard…
          </p>
          <div className="zg-metric-grid" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="zg-metric-card zg-skeleton" />
            ))}
          </div>
        </div>
      )}

      {state === "error" && (
        <div role="alert" className="p-3 rounded" style={{ background: "var(--zg-surface)", border: "1px solid var(--zg-surface-border)" }}>
          <p className="mb-2" style={{ color: "var(--zg-error)" }}>
            {error}
          </p>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {state === "loaded" && data && (
        <>
          <div className="zg-metric-grid mb-4">
            {data.metrics.map((m) => (
              <MetricCard key={m.key} metric={m} emphasis={m.key === "highPriority" || m.key === "unassigned"} />
            ))}
            {accountMetrics.map((m) => (
              <MetricCard key={m.key} metric={m} />
            ))}
          </div>

          <div className="row g-3">
            <div className="col-lg-8 d-flex flex-column gap-3">
              <section id="my-open-actions" aria-labelledby="my-open-actions-heading" className="zg-panel">
                <h2 id="my-open-actions-heading" className="h6">
                  My Open Actions
                </h2>
                {data.myOpenActions.items.length === 0 ? (
                  <p className="text-muted small mb-0">No open actions assigned to you</p>
                ) : (
                  <>
                    <ul className="list-unstyled mb-2">
                      {data.myOpenActions.items.map((a) => (
                        <li key={a.id} className="zg-list-row">
                          <Link to={`/queue/${a.ticketId}`} className="fw-semibold">
                            {a.ticketNumber}
                          </Link>
                          <span className="zg-truncate" title={a.description}>
                            {a.description}
                          </span>
                          <Badge tone={actionStatusTone(a.status)}>{ACTION_STATUS_LABELS[a.status]}</Badge>
                          <span className="text-muted small">{formatDateTime(a.actionAt)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="small text-muted mb-0">
                      Showing {data.myOpenActions.items.length} of {data.myOpenActions.total}
                    </p>
                  </>
                )}
              </section>

              <section aria-labelledby="recent-tickets-heading" className="zg-panel">
                <div className="d-flex justify-content-between align-items-center">
                  <h2 id="recent-tickets-heading" className="h6">
                    Recent Tickets
                  </h2>
                  <Link to="/queue" className="small">
                    View all
                  </Link>
                </div>
                {data.recentTickets.length === 0 ? (
                  <p className="text-muted small mb-0">No tickets yet</p>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {data.recentTickets.map((t) => (
                      <li key={t.id} className="zg-list-row">
                        <Link to={`/queue/${t.id}`} className="fw-semibold">
                          {t.ticketNumber}
                        </Link>
                        <span className="zg-truncate" title={t.summary}>
                          {t.summary}
                        </span>
                        <span className="d-flex gap-1 flex-wrap">
                          <Badge tone={statusTone(t.status)}>{STATUS_LABELS[t.status]}</Badge>
                          <Badge tone={t.itPriority === "HIGH" ? "danger" : t.itPriority === "MEDIUM" ? "warning" : "pale"}>{t.itPriority}</Badge>
                        </span>
                        <span className="text-muted small">
                          {t.ticketOwnerName ?? "Unassigned"} · {formatDateTime(t.updatedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="col-lg-4">
              <section aria-labelledby="quick-actions-heading" className="zg-panel">
                <h2 id="quick-actions-heading" className="h6">
                  Quick Actions
                </h2>
                <div className="d-grid gap-2">
                  <Link to="/queue" className="btn btn-outline-success btn-sm text-start">
                    Open Queue
                  </Link>
                  <Link to={`/queue?${new URLSearchParams({ ownerId: "unassigned", status: ACTIVE })}`} className="btn btn-outline-success btn-sm text-start">
                    Unassigned Tickets
                  </Link>
                  <Link to={`/queue?${new URLSearchParams({ ownerId: String(user?.id ?? ""), status: ACTIVE })}`} className="btn btn-outline-success btn-sm text-start">
                    My Assigned Tickets
                  </Link>
                  {data.accounts && (
                    <Link to="/admin/users" className="btn btn-outline-success btn-sm text-start">
                      Manage Users
                    </Link>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
