import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Badge from "./components/Badge.js";
import AttachmentSection from "./components/AttachmentSection.js";
import { addAttachments, Attachment, downloadAttachment, getTicket, removeAttachment, TicketDetail } from "./api.js";

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
// Issue 11 — Attachment lifecycle: add, download, soft-remove with reason.
// No Public Comments, Internal Notes, Actions Taken, or status controls —
// those are explicitly out of scope for Lab 2 (specification.md §3).
export default function RequesterTicketDetail({ requesterId }: Props) {
  const { id } = useParams();
  const [state, setState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [pendingRemoveId, setPendingRemoveId] = useState<number | null>(null);
  const [removalReason, setRemovalReason] = useState("");

  async function loadTicket() {
    const t = await getTicket(requesterId, Number(id));
    setTicket(t);
  }

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

  async function handleUpload() {
    if (stagedFiles.length === 0) return;
    setUploading(true);
    setAttachmentError("");
    try {
      await addAttachments(requesterId, Number(id), stagedFiles);
      setStagedFiles([]);
      await loadTicket();
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : "Unable to add attachment.");
    } finally {
      setUploading(false);
    }
  }

  function handleDownload(attachment: Attachment) {
    setAttachmentError("");
    downloadAttachment(requesterId, attachment.id, attachment.originalName).catch((err) => {
      setAttachmentError(err instanceof Error ? err.message : "Unable to download attachment.");
    });
  }

  function startRemove(attachment: Attachment) {
    setPendingRemoveId(attachment.id);
    setRemovalReason("");
    setAttachmentError("");
  }

  async function confirmRemove() {
    if (pendingRemoveId === null || !removalReason.trim()) return;
    try {
      await removeAttachment(requesterId, pendingRemoveId, removalReason.trim());
      setPendingRemoveId(null);
      setRemovalReason("");
      await loadTicket();
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : "Unable to remove attachment.");
    }
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
        <AttachmentSection
          files={stagedFiles}
          onChange={setStagedFiles}
          existing={ticket.attachments}
          onDownload={handleDownload}
          onRemove={startRemove}
        />

        {stagedFiles.length > 0 && (
          <button
            type="button"
            className="btn btn-success btn-sm mt-2"
            onClick={handleUpload}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        )}

        {attachmentError && (
          <p role="alert" style={{ color: "var(--zg-error)" }} className="small mt-2">
            {attachmentError}
          </p>
        )}

        {pendingRemoveId !== null && (
          <div className="mt-3 p-2 rounded" style={{ background: "var(--zg-warning-bg)" }}>
            <label htmlFor="removalReason" className="form-label small fw-semibold">
              Reason for removal
            </label>
            <input
              id="removalReason"
              className="form-control form-control-sm mb-2"
              value={removalReason}
              onChange={(e) => setRemovalReason(e.target.value)}
            />
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={confirmRemove}
                disabled={!removalReason.trim()}
              >
                Confirm removal
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setPendingRemoveId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
