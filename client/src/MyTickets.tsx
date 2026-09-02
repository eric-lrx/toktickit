import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "./components/Badge.js";
import { getMyTickets, RequestedPriority, Ticket } from "./api.js";

type LoadState = "loading" | "loaded" | "error";
type SortField = "createdAt" | "ticketNumber" | "summary";

const PAGE_SIZE = 10;

interface Props {
  requesterId: number;
}

function priorityTone(priority: RequestedPriority): "pale" | "warning" | "danger" {
  if (priority === "HIGH") return "danger";
  if (priority === "MEDIUM") return "warning";
  return "pale";
}

// Issue 9 — My Tickets: search/filter/sort/pagination over the current
// Requester's own Tickets, desktop table + mobile cards (ui-spec.md §4.4).
export default function MyTickets({ requesterId }: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<RequestedPriority | "">("");
  const [sort, setSort] = useState<SortField>("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const filtersActive = Boolean(search.trim() || priority);

  useEffect(() => {
    setPage(1);
  }, [search, priority, requesterId]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    getMyTickets(requesterId, {
      search: search.trim() || undefined,
      requestedPriority: priority || undefined,
      sort,
      order,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setTickets(res.data);
        setTotal(res.meta.total);
        setTotalPages(res.meta.totalPages);
        setState("loaded");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [requesterId, search, priority, sort, order, page]);

  function clearFilters() {
    setSearch("");
    setPriority("");
  }

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
        <div className="d-flex flex-wrap gap-2 align-items-end">
          <div>
            <label htmlFor="search" className="form-label small fw-semibold mb-1">
              Search
            </label>
            <input
              id="search"
              className="form-control"
              placeholder="Ticket number or summary…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="priorityFilter" className="form-label small fw-semibold mb-1">
              Requested Priority
            </label>
            <select
              id="priorityFilter"
              className="form-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as RequestedPriority | "")}
            >
              <option value="">All</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          <div>
            <label htmlFor="sortField" className="form-label small fw-semibold mb-1">
              Sort by
            </label>
            <select
              id="sortField"
              className="form-select"
              value={`${sort}:${order}`}
              onChange={(e) => {
                const [nextSort, nextOrder] = e.target.value.split(":") as [SortField, "asc" | "desc"];
                setSort(nextSort);
                setOrder(nextOrder);
              }}
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="ticketNumber:asc">Ticket Number (A–Z)</option>
              <option value="summary:asc">Summary (A–Z)</option>
            </select>
          </div>
        </div>
        <Link to="/tickets/new" className="btn btn-success">
          Create Ticket
        </Link>
      </div>

      {state === "loading" && <p role="status">Loading tickets…</p>}

      {state === "error" && (
        <p role="alert" style={{ color: "var(--zg-error)" }}>
          Unable to load tickets. Please try again.
        </p>
      )}

      {state === "loaded" && tickets.length === 0 && !filtersActive && (
        <div className="text-center py-5">
          <p className="text-muted mb-3">You haven't created any tickets yet.</p>
          <Link to="/tickets/new" className="btn btn-success">
            Create your first ticket
          </Link>
        </div>
      )}

      {state === "loaded" && tickets.length === 0 && filtersActive && (
        <div className="text-center py-5">
          <p className="text-muted mb-3">No tickets match your search or filters.</p>
          <button className="btn btn-outline-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {state === "loaded" && tickets.length > 0 && (
        <>
          <div className="d-none d-md-block">
            <table className="table">
              <thead>
                <tr>
                  <th>Ticket Number</th>
                  <th>Summary</th>
                  <th>Requested Priority</th>
                  <th>Current Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/tickets/${t.id}`}>{t.ticketNumber}</Link>
                    </td>
                    <td>{t.summary}</td>
                    <td>
                      <Badge tone={priorityTone(t.requestedPriority)}>{t.requestedPriority}</Badge>
                    </td>
                    <td>
                      <Badge tone="pale">{t.status}</Badge>
                    </td>
                    <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="d-md-none d-flex flex-column gap-2">
            {tickets.map((t) => (
              <Link
                key={t.id}
                to={`/tickets/${t.id}`}
                className="text-decoration-none text-reset"
                style={{ background: "var(--zg-surface)", border: "1px solid var(--zg-surface-border)" }}
              >
                <div className="p-3 rounded">
                  <div className="d-flex justify-content-between">
                    <strong>{t.ticketNumber}</strong>
                    <Badge tone={priorityTone(t.requestedPriority)}>{t.requestedPriority}</Badge>
                  </div>
                  <p className="mb-1">{t.summary}</p>
                  <div className="d-flex justify-content-between align-items-center">
                    <Badge tone="pale">{t.status}</Badge>
                    <small className="text-muted">{new Date(t.createdAt).toLocaleDateString()}</small>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="d-flex justify-content-between align-items-center mt-3">
            <small className="text-muted">
              Page {page} of {totalPages} ({total} ticket{total === 1 ? "" : "s"})
            </small>
            <div className="d-flex gap-2">
              <button
                className="btn btn-outline-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="btn btn-outline-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
