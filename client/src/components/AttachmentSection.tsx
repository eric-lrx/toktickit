import { ChangeEvent, useRef, useState } from "react";
import { Attachment } from "../api.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  existing?: Attachment[];
  onDownload?: (attachment: Attachment) => void;
  onRemove?: (attachment: Attachment) => void;
}

function formatSize(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Issue 11 — reusable Attachments section: the staged-file picker (Create
// Ticket) and the existing-attachment list (Ticket Detail) are the same
// component either way. Client-side validation mirrors BR-15 (type/size) so
// the Requester gets immediate feedback; the backend re-validates regardless.
export default function AttachmentSection({ files, onChange, existing = [], onDownload, onRemove }: Props) {
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;

    for (const file of selected) {
      if (!ALLOWED_TYPES.has(file.type)) {
        setError(`${file.name} is not an allowed file type. Use JPG, PNG, WEBP, or PDF.`);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setError(`${file.name} exceeds the 5 MB limit.`);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    }

    setError("");
    onChange([...files, ...selected]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeStaged(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  const activeExisting = existing.filter((a) => !a.removedAt);
  const removedExisting = existing.filter((a) => a.removedAt);

  return (
    <div>
      <label htmlFor="attachments" className="form-label fw-semibold small">
        Attachments
      </label>
      {/* No `accept` filter: it's a UX hint only (trivially bypassed via
          drag-and-drop or "All Files"), not a real gate — the check below is. */}
      <input
        ref={inputRef}
        id="attachments"
        type="file"
        className="form-control"
        multiple
        onChange={handleFileChange}
      />
      {error && (
        <p role="alert" style={{ color: "var(--zg-error)" }} className="small mt-1 mb-0">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <ul className="list-unstyled mt-2 mb-0">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="d-flex justify-content-between align-items-center py-1">
              <span>
                {f.name} <span className="text-muted small">({formatSize(f.size)})</span>
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                aria-label={`Remove ${f.name} from selection`}
                title={`Remove ${f.name} from selection`}
                onClick={() => removeStaged(i)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeExisting.length > 0 && (
        <ul className="list-unstyled mt-3 mb-0">
          {activeExisting.map((a) => (
            <li key={a.id} className="d-flex justify-content-between align-items-center py-1">
              <span>
                {a.originalName} <span className="text-muted small">({formatSize(a.sizeBytes)})</span>
              </span>
              <div className="d-flex gap-2">
                {onDownload && (
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onDownload(a)}>
                    Download
                  </button>
                )}
                {onRemove && (
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onRemove(a)}>
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {removedExisting.length > 0 && (
        <ul className="list-unstyled mt-3 mb-0">
          {removedExisting.map((a) => (
            <li key={a.id} className="text-muted small py-1">
              <span style={{ textDecoration: "line-through" }}>{a.originalName}</span> — removed:{" "}
              {a.removalReason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
