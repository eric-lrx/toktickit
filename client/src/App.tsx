import { useState } from "react";
import { checkSystem } from "./api.js";

// UI states: idle, loading, success, error. Issue 4 adds the category list.
type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleCheck() {
    setState("loading");
    try {
      await checkSystem();
      setState("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button className="btn btn-success" onClick={handleCheck} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      {state === "loading" && (
        <p className="mt-3 text-muted">⏳ Checking system…</p>
      )}

      {state === "success" && (
        <div className="mt-3">
          <p className="fw-semibold text-success">System Status: Online</p>
        </div>
      )}

      {state === "error" && (
        <div className="mt-3">
          <p className="fw-semibold text-danger">System Status: Offline</p>
          <p className="text-muted">Unable to connect to TokTickIT API — {errorMessage}</p>
        </div>
      )}
    </div>
  );
}
