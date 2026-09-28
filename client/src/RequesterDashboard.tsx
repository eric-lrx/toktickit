import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "./components/Badge.js";
import MetricCard from "./components/MetricCard.js";
import { useAuth } from "./AuthContext.js";
import { getRequesterDashboard, RequesterDashboardData } from "./api.js";
import { STATUS_LABELS, statusTone } from "./ticketStatus.js";
import { formatDateTime } from "./dates.js";

// ui-spec.md §2.1 — the Requester's own Tickets only; ownership is applied by
// GET /api/dashboard/requester from the session (BR-23), never by the client.
export default function RequesterDashboard() {
  const { user } = useAuth();
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [error, setError] = useState("");
  const [data, setData] = useState<RequesterDashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getRequesterDashboard());
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

  const firstName = user?.name.split(" ")[0] ?? "";

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">Welcome, {firstName}</h1>
          <p className="text-muted mb-0">Here's the latest on your requests.</p>
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
          <div className="zg-metric-grid zg-metric-grid-4" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="zg-metric-card zg-skeleton" />
            ))}
          </div>
        </div>
      )}

      {state === "error" && (
        <div role="alert" className="zg-panel">
          <p className="mb-2" style={{ color: "var(--zg-error)" }}>
            {error}
          </p>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => {
              setState("loading");
              load();
            }}
          >
            Try again
          </button>
        </div>
      )}

      {state === "loaded" && data && (
        <>
          <div className="zg-metric-grid zg-metric-grid-4 mb-4">
            {data.metrics.map((m) => (
              <MetricCard key={m.key} metric={m} emphasis={m.key === "waitingForMe"} />
            ))}
          </div>

          <div className="row g-3">
            <div className="col-lg-8 d-flex flex-column gap-3">
              <section aria-labelledby="recent-heading" className="zg-panel">
                <div className="d-flex justify-content-between align-items-center">
                  <h2 id="recent-heading" className="h6">
                    My Recent Tickets
                  </h2>
                  <Link to="/tickets" className="small">
                    View all
                  </Link>
                </div>
                {data.recentTickets.length === 0 ? (
                  <p className="text-muted small mb-0">No tickets yet</p>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {data.recentTickets.map((t) => (
                      <li key={t.id} className="zg-list-row">
                        <Link to={`/tickets/${t.id}`} className="fw-semibold">
                          {t.ticketNumber}
                        </Link>
                        <span className="zg-truncate" title={t.summary}>
                          {t.summary}
                        </span>
                        <Badge tone={statusTone(t.status)}>{STATUS_LABELS[t.status]}</Badge>
                        <span className="text-muted small">Updated {formatDateTime(t.updatedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="resolved-heading" className="zg-panel">
                <h2 id="resolved-heading" className="h6">
                  Recently Resolved
                </h2>
                {data.recentlyResolved.length === 0 ? (
                  <p className="text-muted small mb-0">Nothing resolved yet</p>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {data.recentlyResolved.map((t) => (
                      <li key={t.id} className="zg-list-row">
                        <Link to={`/tickets/${t.id}`} className="fw-semibold">
                          {t.ticketNumber}
                        </Link>
                        <span className="zg-truncate" title={t.summary}>
                          {t.summary}
                        </span>
                        <Badge tone={statusTone(t.status)}>{STATUS_LABELS[t.status]}</Badge>
                        <span className="text-muted small">Resolved {t.resolvedAt ? formatDateTime(t.resolvedAt) : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="col-lg-4">
              <section aria-labelledby="req-quick-heading" className="zg-panel">
                <h2 id="req-quick-heading" className="h6">
                  Quick Actions
                </h2>
                <div className="d-grid gap-2">
                  <Link to="/tickets/new" className="btn btn-success btn-sm text-start">
                    Create Ticket
                  </Link>
                  <Link to="/tickets" className="btn btn-outline-success btn-sm text-start">
                    View My Tickets
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
