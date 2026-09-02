import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import RequesterSelector, { REQUESTER_STORAGE_KEY } from "./RequesterSelector.js";
import Shell from "./Shell.js";
import CreateTicket from "./CreateTicket.js";
import MyTickets from "./MyTickets.js";
import RequesterTicketDetail from "./RequesterTicketDetail.js";
import { getActiveRequesters, Requester } from "./api.js";

function getStoredRequesterId(): number | null {
  const raw = localStorage.getItem(REQUESTER_STORAGE_KEY);
  return raw ? Number(raw) : null;
}

// Issue 6 — gates the app behind the Development Requester Selector (BR-03).
// Issue 7 — wraps the selected Requester in the Zen Green shell + routing.
export default function AppRoot() {
  const [requesterId, setRequesterId] = useState<number | null>(getStoredRequesterId());
  const [requester, setRequester] = useState<Requester | null>(null);

  useEffect(() => {
    if (requesterId === null) {
      setRequester(null);
      return;
    }
    let cancelled = false;
    getActiveRequesters()
      .then((list) => {
        if (!cancelled) setRequester(list.find((r) => r.id === requesterId) ?? null);
      })
      .catch(() => {
        // Resolving the Requester's name failed (e.g. backend unreachable).
        // Fall back to the Selector rather than a permanent "Loading…" —
        // it already has its own tested failure/retry state.
        if (!cancelled) {
          localStorage.removeItem(REQUESTER_STORAGE_KEY);
          setRequesterId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requesterId]);

  if (requesterId === null) {
    return <RequesterSelector onSelect={setRequesterId} />;
  }

  if (!requester) {
    return <p className="text-muted p-4">Loading…</p>;
  }

  return (
    <BrowserRouter>
      <Shell requester={requester} onChangeRequester={() => setRequesterId(null)}>
        <Routes>
          <Route path="/" element={<Navigate to="/tickets" replace />} />
          <Route path="/tickets" element={<MyTickets requesterId={requester.id} />} />
          <Route path="/tickets/new" element={<CreateTicket requesterId={requester.id} />} />
          <Route path="/tickets/:id" element={<RequesterTicketDetail requesterId={requester.id} />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
