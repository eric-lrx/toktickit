import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Badge from "./components/Badge.js";
import CommentPanel from "./components/CommentPanel.js";
import { useAuth } from "./AuthContext.js";
import {
  getStaffTicket,
  getStaffUsers,
  postComment,
  postNote,
  RequestedPriority,
  setTicketItPriority,
  setTicketOwner,
  setTicketStatus,
  StaffTicketDetail as StaffTicketDetailType,
  StaffUser,
  TicketStatus,
} from "./api.js";
import { allowedTransitions, STATUS_LABELS, statusTone } from "./ticketStatus.js";

type LoadState = "loading" | "loaded" | "error";

function priorityTone(priority: RequestedPriority): "pale" | "warning" | "danger" {
  if (priority === "HIGH") return "danger";
  if (priority === "MEDIUM") return "warning";
  return "pale";
}

// Issue 36 — IT Staff Ticket Detail: Owner (claim/reassign), IT Priority,
// Status (constrained to the transition matrix), Resolution Summary
// (editable, submitted together with a move to Resolved). Issue 37 adds the
// Public Comments and Internal Notes panels (ui-spec.md §5).
export default function StaffTicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [ticket, setTicket] = useState<StaffTicketDetailType | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [actionError, setActionError] = useState("");
  const [resolutionDraft, setResolutionDraft] = useState("");
  const [confirmingResolve, setConfirmingResolve] = useState(false);

  async function load() {
    const [t, users] = await Promise.all([getStaffTicket(Number(id)), getStaffUsers()]);
    setTicket(t);
    setStaffUsers(users);
    setResolutionDraft(t.resolutionSummary ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    load()
      .then(() => {
        if (!cancelled) setState("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Unable to load ticket.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function runAction(action: () => Promise<void>) {
    setActionError("");
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save that change.");
    }
  }

  function handleClaim() {
    if (!ticket || !user) return;
    runAction(() => setTicketOwner(ticket.id, user.id));
  }

  function handleOwnerChange(value: string) {
    if (!ticket) return;
    runAction(() => setTicketOwner(ticket.id, value === "" ? null : Number(value)));
  }

  function handlePriorityChange(value: RequestedPriority) {
    if (!ticket) return;
    runAction(() => setTicketItPriority(ticket.id, value));
  }

  function handleStatusChange(value: TicketStatus) {
    if (!ticket) return;
    if (value === "RESOLVED") {
      setConfirmingResolve(true);
      return;
    }
    runAction(() => setTicketStatus(ticket.id, value));
  }

  function submitResolution() {
    if (!ticket) return;
    runAction(() => setTicketStatus(ticket.id, "RESOLVED", resolutionDraft)).then(() => setConfirmingResolve(false));
  }

  if (state === "loading") {
    return <p role="status">Loading ticket…</p>;
  }
  if (state === "error" || !ticket) {
    return (
      <p role="alert" style={{ color: "var(--zg-error)" }}>
        {errorMessage || "Ticket not found."}
      </p>
    );
  }

  const statusOptions = [ticket.status, ...allowedTransitions(ticket.status)];

  return (
    <div style={{ maxWidth: 720 }}>
      <div
        className="p-3 mb-4 rounded"
        style={{ background: "var(--zg-readonly-bg)", border: "1px solid var(--zg-surface-border)" }}
      >
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h2 className="h5 mb-0">{ticket.ticketNumber}</h2>
          <Badge tone={statusTone(ticket.status)}>{STATUS_LABELS[ticket.status]}</Badge>
        </div>
        <small className="text-muted">
          {ticket.categoryName} · Created {new Date(ticket.createdAt).toLocaleString()}
        </small>
      </div>

      {actionError && (
        <p role="alert" style={{ color: "var(--zg-error)" }} className="mb-3">
          {actionError}
        </p>
      )}

      <div className="row mb-4 g-3">
        <div className="col-sm-6">
          <p className="small fw-semibold mb-1">Requested Priority</p>
          <Badge tone={priorityTone(ticket.requestedPriority)}>{ticket.requestedPriority}</Badge>
        </div>
        <div className="col-sm-6">
          <label htmlFor="itPriority" className="small fw-semibold mb-1 d-block">
            IT Priority
          </label>
          <select
            id="itPriority"
            className="form-select"
            style={{ background: "var(--zg-field-bg)" }}
            value={ticket.itPriority}
            onChange={(e) => handlePriorityChange(e.target.value as RequestedPriority)}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>
      </div>

      <div className="row mb-4 g-3">
        <div className="col-sm-6">
          <label className="small fw-semibold mb-1 d-block">Owner</label>
          {ticket.ticketOwnerId === null ? (
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleClaim}>
              Claim
            </button>
          ) : (
            <select
              aria-label="Owner"
              className="form-select"
              style={{ background: "var(--zg-field-bg)" }}
              value={ticket.ticketOwnerId}
              onChange={(e) => handleOwnerChange(e.target.value)}
            >
              <option value="">Unassigned</option>
              {staffUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="col-sm-6">
          <label htmlFor="status" className="small fw-semibold mb-1 d-block">
            Status
          </label>
          <select
            id="status"
            className="form-select"
            style={{ background: "var(--zg-field-bg)" }}
            value={ticket.status}
            onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {ticket.requesterResolutionIndicatedAt && (
            <Badge tone="pale">Requester indicated this is resolved</Badge>
          )}
        </div>
      </div>

      {confirmingResolve && (
        <div className="mb-4 p-3 rounded" style={{ background: "var(--zg-pale)" }}>
          <label htmlFor="resolutionSummary" className="small fw-semibold mb-1 d-block">
            Resolution Summary
          </label>
          <textarea
            id="resolutionSummary"
            className="form-control mb-2"
            style={{ background: "var(--zg-field-bg)" }}
            rows={3}
            value={resolutionDraft}
            onChange={(e) => setResolutionDraft(e.target.value)}
          />
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-success btn-sm" onClick={submitResolution}>
              Save and mark Resolved
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setConfirmingResolve(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!confirmingResolve && ticket.resolutionSummary && (
        <div className="mb-4">
          <p className="small fw-semibold mb-1">Resolution Summary</p>
          <p style={{ background: "var(--zg-readonly-bg)", whiteSpace: "pre-wrap" }} className="p-2 rounded">
            {ticket.resolutionSummary}
          </p>
        </div>
      )}

      <div className="mb-4">
        <p className="small fw-semibold mb-1">Summary</p>
        <p style={{ background: "var(--zg-readonly-bg)" }} className="p-2 rounded">
          {ticket.summary}
        </p>
      </div>

      <div className="mb-4">
        <p className="small fw-semibold mb-1">Description</p>
        <p style={{ background: "var(--zg-readonly-bg)", whiteSpace: "pre-wrap" }} className="p-2 rounded">
          {ticket.description}
        </p>
      </div>

      {ticket.attachments.length > 0 && (
        <div className="mb-4">
          <p className="small fw-semibold mb-1">Attachments</p>
          <ul className="mb-0">
            {ticket.attachments.map((a) => (
              <li key={a.id}>{a.originalName}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4">
        <CommentPanel
          variant="public"
          entries={ticket.publicComments}
          onPost={async (content) => {
            await postComment(ticket.id, content);
            await load();
          }}
        />
      </div>

      <div className="mb-4">
        <CommentPanel
          variant="internal"
          entries={ticket.internalNotes}
          onPost={async (content) => {
            await postNote(ticket.id, content);
            await load();
          }}
        />
      </div>
    </div>
  );
}
