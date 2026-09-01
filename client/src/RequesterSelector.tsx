import { useEffect, useState } from "react";
import { getActiveRequesters, Requester } from "./api.js";

export const REQUESTER_STORAGE_KEY = "toktickit.requesterId";

type LoadState = "loading" | "loaded" | "empty" | "error";

interface Props {
  onSelect: (requesterId: number) => void;
}

// Issue 6 — Development Requester Selection screen (BR-03: testing mechanism, not auth).
export default function RequesterSelector({ onSelect }: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");

  useEffect(() => {
    let cancelled = false;
    getActiveRequesters()
      .then((list) => {
        if (cancelled) return;
        setRequesters(list);
        setState(list.length === 0 ? "empty" : "loaded");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleContinue() {
    if (selectedId === "") return;
    localStorage.setItem(REQUESTER_STORAGE_KEY, String(selectedId));
    onSelect(Number(selectedId));
  }

  return (
    <div className="container py-5" style={{ maxWidth: 480 }}>
      <h1 className="h3 mb-2">TokTickIT</h1>
      <p className="text-muted">
        Select a Development Requester to test requester-specific ticket behavior. This
        is not a login screen. Authentication and role-based access will be introduced
        in Lab 3.
      </p>

      {state === "loading" && <p role="status">Loading requesters…</p>}

      {state === "empty" && (
        <p role="alert">No active Development Requesters — ask an administrator to seed one.</p>
      )}

      {state === "error" && (
        <p role="alert">Unable to load Development Requesters. Please try again.</p>
      )}

      {state === "loaded" && (
        <>
          <label htmlFor="requester-select" className="form-label fw-semibold">
            Development Requester
          </label>
          <select
            id="requester-select"
            className="form-select mb-3"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Choose a Requester…</option>
            {requesters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {r.email}
              </option>
            ))}
          </select>
          <button className="btn btn-success" disabled={selectedId === ""} onClick={handleContinue}>
            Continue
          </button>
        </>
      )}
    </div>
  );
}
