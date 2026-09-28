import { FormEvent, useRef, useState } from "react";
import { useIdempotencyKey } from "../idempotencyKey.js";
import { formatDateTime } from "../dates.js";

const ROLE_LABEL: Record<string, string> = { REQUESTER: "Requester", IT_STAFF: "IT Staff", ADMINISTRATOR: "Administrator" };

export interface CommentEntry {
  id: number;
  authorName: string;
  authorRole?: string;
  content: string;
  createdAt: string;
}

interface Props {
  variant: "public" | "internal";
  entries: CommentEntry[];
  // Lab 4 (BR-28) — the key is generated here, once per submission.
  onPost: (content: string, idempotencyKey: string) => Promise<void>;
}

// ui-spec.md §5 — Public Comments and Internal Notes are two visually
// distinct panels, never merged into one list, so posting in the wrong one
// is visually hard to do by accident. Both: text box + Post button,
// append-only (no edit/delete anywhere), newest-at-bottom, timestamp +
// author on every entry.
export default function CommentPanel({ variant, entries, onPost }: Props) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const postingRef = useRef(false);
  const idempotencyKey = useIdempotencyKey();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || postingRef.current) return;
    postingRef.current = true;
    setPosting(true);
    setError("");
    try {
      await onPost(draft.trim(), idempotencyKey.current());
      idempotencyKey.rotate();
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to post. Please try again.");
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }

  const isInternal = variant === "internal";
  const panelStyle = isInternal
    ? { background: "var(--zg-readonly-bg)", border: "1px solid var(--zg-warning-bg)" }
    : { background: "var(--zg-surface)", border: "1px solid var(--zg-surface-border)" };

  return (
    <div
      data-testid={isInternal ? "internal-notes-panel" : "public-comments-panel"}
      className={isInternal ? "internal-notes-panel p-3 rounded" : "public-comments-panel p-3 rounded"}
      style={panelStyle}
    >
      <h3 className="h6 mb-1">{isInternal ? "Internal Notes" : "Public Comments"}</h3>
      {isInternal && (
        <p className="small fw-semibold mb-3" style={{ color: "var(--zg-secondary)" }}>
          Internal — not visible to Requester
        </p>
      )}

      <ul className="list-unstyled mb-3">
        {entries.length === 0 && <li className="text-muted small">Nothing posted yet.</li>}
        {entries.map((entry) => (
          <li key={entry.id} className="mb-2 pb-2" style={{ borderBottom: "1px solid var(--zg-surface-border)" }}>
            <p className="mb-1" style={{ whiteSpace: "pre-wrap" }}>
              {entry.content}
            </p>
            <small className="text-muted">
              {entry.authorName}
              {entry.authorRole ? ` — ${ROLE_LABEL[entry.authorRole] ?? entry.authorRole}` : ""} · {formatDateTime(entry.createdAt)}
            </small>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit}>
        <label htmlFor={`${variant}-comment-input`} className="visually-hidden">
          {isInternal ? "Add an internal note" : "Add a public comment"}
        </label>
        <textarea
          id={`${variant}-comment-input`}
          className="form-control mb-2"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {error && (
          <p role="alert" style={{ color: "var(--zg-error)" }} className="small mb-2">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-sm btn-outline-secondary" disabled={posting || !draft.trim()}>
          {posting ? "Posting…" : "Post"}
        </button>
      </form>
    </div>
  );
}
