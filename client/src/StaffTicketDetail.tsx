import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Badge from "./components/Badge.js";
import ActionsTaken from "./components/ActionsTaken.js";
import CommentPanel from "./components/CommentPanel.js";
import StatusHistory from "./components/StatusHistory.js";
import { useAuth } from "./AuthContext.js";
import {
  ActionTaken,
  ApiError,
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
import { STATUS_LABELS, statusTone } from "./ticketStatus.js";
import { formatDateTime } from "./dates.js";

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
  // Lab 4 (ui-spec.md §4) — conflict feedback and the status announcement.
  const [stale, setStale] = useState(false);
  const [blockedIds, setBlockedIds] = useState<number[]>([]);
  const [actions, setActions] = useState<ActionTaken[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [historyKey, setHistoryKey] = useState(0);

  // Workflow writes run one at a time, each with the latest version the
  // screen knows (from the previous write's response). Without this, a quick
  // "change priority, then status" sent the second request with the version
  // read before the first one landed, and the user conflicted with their
  // own change (found by Lab 3's E2E-04 during Issue 25).
  const versionRef = useRef<number | undefined>(undefined);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  async function load() {
    const [t, users] = await Promise.all([getStaffTicket(Number(id)), getStaffUsers()]);
    versionRef.current = t.version;
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

  function runAction(action: (version: number | undefined) => Promise<{ version?: number } | void>): Promise<boolean> {
    const run = writeQueue.current.then(() => execute(action));
    writeQueue.current = run;
    return run;
  }

  async function execute(action: (version: number | undefined) => Promise<{ version?: number } | void>): Promise<boolean> {
    setActionError("");
    setStale(false);
    setBlockedIds([]);
    try {
      const result = await action(versionRef.current);
      if (result && typeof result.version === "number") versionRef.current = result.version;
      await load();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === "STALE_UPDATE") {
        setStale(true);
      } else if (err instanceof ApiError && err.code === "RESOLUTION_BLOCKED") {
        setBlockedIds(Array.isArray(err.details.blockingActionIds) ? (err.details.blockingActionIds as number[]) : []);
      } else {
        setActionError(err instanceof Error ? err.message : "Unable to save that change.");
      }
      return false;
    }
  }

  async function reload() {
    setStale(false);
    await load();
    setHistoryKey((k) => k + 1);
  }

  async function changeStatus(value: TicketStatus, resolution?: string) {
    if (!ticket) return false;
    const ok = await runAction((version) => setTicketStatus(ticket.id, value, resolution, version));
    if (ok) {
      setAnnouncement(`Status changed to ${STATUS_LABELS[value]}`);
      setHistoryKey((k) => k + 1);
    }
    return ok;
  }

  function handleClaim() {
    if (!ticket || !user) return;
    runAction((version) => setTicketOwner(ticket.id, user.id, version));
  }

  function handleOwnerChange(value: string) {
    if (!ticket) return;
    runAction((version) => setTicketOwner(ticket.id, value === "" ? null : Number(value), version));
  }

  function handlePriorityChange(value: RequestedPriority) {
    if (!ticket) return;
    runAction((version) => setTicketItPriority(ticket.id, value, version));
  }

  function handleStatusChange(value: TicketStatus) {
    if (!ticket) return;
    if (value === "RESOLVED") {
      setConfirmingResolve(true);
      return;
    }
    changeStatus(value);
  }

  function submitResolution() {
    if (!ticket) return;
    changeStatus("RESOLVED", resolutionDraft).then(() => setConfirmingResolve(false));
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

  // The backend's own matrix row — never a client-side copy (api-spec.md).
  const statusOptions = [ticket.status, ...ticket.allowedTransitions];
  // A blocking action completed or cancelled since the refusal stops being named.
  const stillBlocking = actions.filter((a) => blockedIds.includes(a.id) && (a.status === "PLANNED" || a.status === "IN_PROGRESS"));

  return (
    <div style={{ maxWidth: 960 }}>
      <div
        className="p-3 mb-4 rounded"
        style={{ background: "var(--zg-readonly-bg)", border: "1px solid var(--zg-surface-border)" }}
      >
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h2 className="h5 mb-0">{ticket.ticketNumber}</h2>
          <Badge tone={statusTone(ticket.status)}>{STATUS_LABELS[ticket.status]}</Badge>
        </div>
        <small className="text-muted">
          {ticket.categoryName} · Created {formatDateTime(ticket.createdAt)}
        </small>
      </div>

      {actionError && (
        <p role="alert" style={{ color: "var(--zg-error)" }} className="mb-3">
          {actionError}
        </p>
      )}
      {stale && (
        <div role="alert" className="p-2 mb-3 rounded small" style={{ background: "var(--zg-warning-bg)", color: "var(--zg-warning-text)" }}>
          Someone else changed this ticket. Reload to see the latest version.{" "}
          <button type="button" className="btn btn-sm btn-outline-secondary ms-2" onClick={reload}>
            Reload
          </button>
        </div>
      )}
      <p aria-live="polite" className="small mb-2" style={{ color: "var(--zg-secondary)", minHeight: "1.25rem" }}>
        {announcement}
      </p>

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
          {stillBlocking.length > 0 && (
            <div role="alert" className="small mt-2 p-2 rounded" style={{ background: "var(--zg-warning-bg)", color: "var(--zg-warning-text)" }}>
              <p className="mb-1">This ticket still has open actions. Complete or cancel them before resolving.</p>
              <ul className="mb-0 ps-3">
                {stillBlocking.map((a) => (
                  <li key={a.id}>
                    <a href={`#action-${a.id}`}>{a.description}</a>
                  </li>
                ))}
              </ul>
            </div>
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
        <ActionsTaken
          ticketId={ticket.id}
          ticketStatus={ticket.status}
          mode="staff"
          staffUsers={staffUsers}
          highlightIds={stillBlocking.map((a) => a.id)}
          onActionsLoaded={setActions}
        />
      </div>

      <div className="mb-4">
        <StatusHistory ticketId={ticket.id} refreshKey={historyKey} />
      </div>

      <div className="mb-4">
        <CommentPanel
          variant="public"
          entries={ticket.publicComments}
          onPost={async (content, key) => {
            await postComment(ticket.id, content, key);
            await load();
          }}
        />
      </div>

      <div className="mb-4">
        <CommentPanel
          variant="internal"
          entries={ticket.internalNotes}
          onPost={async (content, key) => {
            await postNote(ticket.id, content, key);
            await load();
          }}
        />
      </div>
    </div>
  );
}
