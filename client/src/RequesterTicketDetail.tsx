import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Badge from "./components/Badge.js";
import { getTicket, TicketDetail } from "./api.js";

type LoadState = "loading" | "loaded" | "error";

interface Props {
  requesterId: number;
}

function priorityTone(priority: TicketDetail["requestedPriority"]): "pale" | "warning" | "danger" {
  if (priority === "HIGH") return "danger";
  if (priority === "MEDIUM") return "warning";
  return "pale";
}

// Issue 10 — Requester Ticket Detail: read-only Ticket info (ui-spec.md §4.5).
// No Public Comments, Internal Notes, Actions Taken, or status controls —
// those are explicitly out of scope for Lab 2 (specification.md §3).
export default function RequesterTicketDetail({ requesterId }: Props) {
  const { id } = useParams();
  const [state, setState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    getTicket(requesterId, Number(id))
      .then((t) => {
        if (cancelled) return;
        setTicket(t);
        setState("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Ticket not found.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [requesterId, id]);

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

  return (
    <div style={{ maxWidth: 720 }}>
      <div
        className="p-3 mb-4 rounded"
        style={{ background: "var(--zg-readonly-bg)", border: "1px solid var(--zg-surface-border)" }}
      >
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h2 className="h5 mb-0">{ticket.ticketNumber}</h2>
          <Badge tone="pale">{ticket.status}</Badge>
        </div>
        <small className="text-muted">
          Created {new Date(ticket.createdAt).toLocaleString()} · Updated{" "}
          {new Date(ticket.updatedAt).toLocaleString()}
        </small>
      </div>

      <div className="row mb-4">
        <div className="col-sm-4">
          <p className="small fw-semibold mb-1">Requested Priority</p>
          <Badge tone={priorityTone(ticket.requestedPriority)}>{ticket.requestedPriority}</Badge>
        </div>
      </div>

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

      <hr />

      <div>
        <h3 className="h6">Attachments</h3>
        {ticket.attachments.length === 0 ? (
          <p className="text-muted small">No attachments yet.</p>
        ) : (
          <ul>
            {ticket.attachments.map((a) => (
              <li key={a.id}>{a.originalName}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
