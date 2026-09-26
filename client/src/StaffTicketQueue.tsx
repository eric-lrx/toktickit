import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Badge from "./components/Badge.js";
import { getStaffQueue, getStaffUsers, RequestedPriority, StaffTicket, StaffUser } from "./api.js";
import { STATUS_LABELS, STATUSES, statusTone } from "./ticketStatus.js";

type LoadState = "loading" | "loaded" | "forbidden" | "error";
type SortField = "createdAt" | "updatedAt" | "itPriority" | "ticketNumber";

const PAGE_SIZE = 10;
// Lab 4 — the dashboards' "active" drill-down set (specification.md §5.1).
const ACTIVE = "NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,RESOLVED,REOPENED";

function priorityTone(priority: RequestedPriority): "pale" | "warning" | "danger" {
  if (priority === "HIGH") return "danger";
  if (priority === "MEDIUM") return "warning";
  return "pale";
}

// Issue 35 — the shared IT Staff Ticket Queue: search/filter/sort/pagination
// over every Ticket (not scoped to the caller), desktop table + mobile cards
// (ui-spec.md §4).
export default function StaffTicketQueue() {
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [tickets, setTickets] = useState<StaffTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);

  // Lab 4 — filters start from the URL so a dashboard card lands on exactly
  // its own filtered list (BR-27), and stay in the URL as they change.
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [itPriority, setItPriority] = useState<RequestedPriority | "">((params.get("itPriority") as RequestedPriority | null) ?? "");
  // Owner filter (Lab 3 ui-spec §4 listed it; the Lab 3 screen never had it).
  const [ownerId, setOwnerId] = useState(params.get("ownerId") ?? "");
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [sort, setSort] = useState<SortField>("updatedAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [reloadToken, setReloadToken] = useState(0);

  const filtersActive = Boolean(search.trim() || status || itPriority || ownerId);

  useEffect(() => {
    getStaffUsers()
      .then(setStaffUsers)
      .catch(() => setStaffUsers([]));
  }, []);

  useEffect(() => {
    setPage(1);
    const next = new URLSearchParams();
    if (search.trim()) next.set("search", search.trim());
    if (status) next.set("status", status);
    if (itPriority) next.set("itPriority", itPriority);
    if (ownerId) next.set("ownerId", ownerId);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, itPriority, ownerId]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    getStaffQueue({
      search: search.trim() || undefined,
      status: status || undefined,
      itPriority: itPriority || undefined,
      ownerId: ownerId || undefined,
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
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to load the ticket queue.";
        setErrorMessage(message);
        setState(message.toLowerCase().includes("access") ? "forbidden" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [search, status, itPriority, ownerId, sort, order, page, reloadToken]);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setItPriority("");
    setOwnerId("");
  }

  const isKnownStatus = status === "" || status === ACTIVE || STATUSES.includes(status as (typeof STATUSES)[number]);

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
            <label htmlFor="statusFilter" className="form-label small fw-semibold mb-1">
              Status
            </label>
            <select
              id="statusFilter"
              className="form-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value={ACTIVE}>Active (not closed or cancelled)</option>
              {!isKnownStatus && <option value={status}>Several statuses</option>}
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="itPriorityFilter" className="form-label small fw-semibold mb-1">
              IT Priority
            </label>
            <select
              id="itPriorityFilter"
              className="form-select"
              value={itPriority}
              onChange={(e) => setItPriority(e.target.value as RequestedPriority | "")}
            >
              <option value="">All</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          <div>
            <label htmlFor="ownerFilter" className="form-label small fw-semibold mb-1">
              Owner
            </label>
            <select id="ownerFilter" className="form-select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">All</option>
              <option value="unassigned">Unassigned</option>
              {staffUsers.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name}
                </option>
              ))}
              {ownerId && ownerId !== "unassigned" && !staffUsers.some((u) => String(u.id) === ownerId) && (
                <option value={ownerId}>Selected owner</option>
              )}
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
              <option value="updatedAt:desc">Last updated</option>
              <option value="createdAt:desc">Newest first</option>
              <option value="itPriority:desc">IT Priority (High–Low)</option>
              <option value="ticketNumber:asc">Ticket Number (A–Z)</option>
            </select>
          </div>
        </div>
      </div>

      {state === "loading" && <p role="status">Loading tickets…</p>}

      {state === "forbidden" && (
        <p role="alert" style={{ color: "var(--zg-error)" }}>
          {errorMessage}
        </p>
      )}

      {state === "error" && (
        <div>
          <p role="alert" style={{ color: "var(--zg-error)" }} className="mb-2">
            {errorMessage}
          </p>
          <button className="btn btn-outline-secondary" onClick={() => setReloadToken((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}

      {state === "loaded" && tickets.length === 0 && !filtersActive && (
        <p className="text-muted text-center py-5">No tickets yet.</p>
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
                  <th>Created</th>
                  <th>Summary</th>
                  <th className="d-none d-lg-table-cell">Category</th>
                  <th>Requested</th>
                  <th>IT Priority</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/queue/${t.id}`}>{t.ticketNumber}</Link>
                    </td>
                    <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td>{t.summary}</td>
                    <td className="d-none d-lg-table-cell">{t.categoryName}</td>
                    <td>
                      <Badge tone={priorityTone(t.requestedPriority)}>{t.requestedPriority}</Badge>
                    </td>
                    <td>
                      <Badge tone={priorityTone(t.itPriority)}>{t.itPriority}</Badge>
                    </td>
                    <td>
                      <Badge tone={statusTone(t.status)}>{STATUS_LABELS[t.status]}</Badge>
                    </td>
                    <td>{t.ticketOwnerName ?? "Unassigned"}</td>
                    <td>{new Date(t.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="d-md-none d-flex flex-column gap-2">
            {tickets.map((t) => (
              <Link
                key={t.id}
                to={`/queue/${t.id}`}
                className="text-decoration-none text-reset"
                style={{ background: "var(--zg-surface)", border: "1px solid var(--zg-surface-border)" }}
              >
                <div className="p-3 rounded">
                  <div className="d-flex justify-content-between">
                    <strong>{t.ticketNumber}</strong>
                    <Badge tone={statusTone(t.status)}>{STATUS_LABELS[t.status]}</Badge>
                  </div>
                  <p className="mb-1">{t.summary}</p>
                  <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
                    <div className="d-flex gap-1">
                      <Badge tone={priorityTone(t.requestedPriority)}>{t.requestedPriority}</Badge>
                      <Badge tone={priorityTone(t.itPriority)}>{t.itPriority}</Badge>
                    </div>
                    <small className="text-muted">{t.ticketOwnerName ?? "Unassigned"}</small>
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
