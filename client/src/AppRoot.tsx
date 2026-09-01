import { useState } from "react";
import RequesterSelector, { REQUESTER_STORAGE_KEY } from "./RequesterSelector.js";

function getStoredRequesterId(): number | null {
  const raw = localStorage.getItem(REQUESTER_STORAGE_KEY);
  return raw ? Number(raw) : null;
}

// Issue 6 — gates the app behind the Development Requester Selector (BR-03).
// Ticket screens (Create Ticket, My Tickets, Ticket Detail) land in later Issues;
// this placeholder just proves the context + Change Requester behavior end to end.
export default function AppRoot() {
  const [requesterId, setRequesterId] = useState<number | null>(getStoredRequesterId());

  function handleChangeRequester() {
    localStorage.removeItem(REQUESTER_STORAGE_KEY);
    setRequesterId(null);
  }

  if (requesterId === null) {
    return <RequesterSelector onSelect={setRequesterId} />;
  }

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <p>Development Requester #{requesterId} selected.</p>
      <button className="btn btn-outline-secondary btn-sm" onClick={handleChangeRequester}>
        Change Requester
      </button>
      <p className="text-muted mt-3">
        Ticket screens (Create Ticket, My Tickets, Ticket Detail) land in later Issues.
      </p>
    </div>
  );
}
