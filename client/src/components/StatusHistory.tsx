import { useEffect, useState } from "react";
import Badge, { BadgeTone } from "./Badge.js";
import { getStatusHistory, Role, StatusChange } from "../api.js";
import { STATUS_LABELS } from "../ticketStatus.js";
import { formatDateTime } from "../dates.js";

const ROLE_LABEL: Record<Role, string> = { REQUESTER: "Requester", IT_STAFF: "IT Staff", ADMINISTRATOR: "Administrator" };
const ROLE_TONE: Record<Role, BadgeTone> = { REQUESTER: "pale", IT_STAFF: "warning", ADMINISTRATOR: "outline" };

// ui-spec.md §4 — compact, read-only timeline, oldest first (BR-18). Its
// failure never blocks the rest of the Ticket Detail screen.
export default function StatusHistory({ ticketId, refreshKey = 0 }: { ticketId: number; refreshKey?: number }) {
  const [rows, setRows] = useState<StatusChange[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getStatusHistory(ticketId)
      .then((data) => {
        if (!cancelled) {
          setRows(data);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load the status history.");
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, refreshKey]);

  return (
    <div className="p-3 rounded" style={{ background: "var(--zg-surface)", border: "1px solid var(--zg-surface-border)" }}>
      <h3 className="h6">Status history</h3>
      {error && <p className="small text-muted mb-0">{error}</p>}
      {!error && rows === null && (
        <p role="status" className="small text-muted mb-0">
          Loading history…
        </p>
      )}
      {!error && rows !== null && rows.length === 0 && <p className="small text-muted mb-0">No status changes recorded yet.</p>}
      {!error && rows !== null && rows.length > 0 && (
        <ol aria-label="History of status changes" className="list-unstyled mb-0 small">
          {rows.map((r) => (
            <li key={r.id} className="py-1" style={{ borderBottom: "1px solid var(--zg-surface-border)" }}>
              <span className="fw-semibold">
                {STATUS_LABELS[r.fromStatus]} → {STATUS_LABELS[r.toStatus]}
              </span>{" "}
              · {r.changedByName} <Badge tone={ROLE_TONE[r.changedByRole]}>{ROLE_LABEL[r.changedByRole]}</Badge> ·{" "}
              <span className="text-muted">{formatDateTime(r.changedAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
