import { FormEvent, useEffect, useState } from "react";
import FormField from "./components/FormField.js";
import {
  Category,
  createTicket,
  getCategories,
  getRelatedSystems,
  RelatedSystem,
  RequestedPriority,
} from "./api.js";

type Status = "idle" | "submitting" | "success" | "error";

interface Props {
  requesterId: number;
}

// Issue 8 — Create Ticket. Attachments land in Issue 11 (Attachment lifecycle);
// this form only covers the ticket fields for now.
export default function CreateTicket({ requesterId }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [relatedSystemId, setRelatedSystemId] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [requestedPriority, setRequestedPriority] = useState<RequestedPriority>("MEDIUM");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [apiError, setApiError] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
    getRelatedSystems().then(setRelatedSystems).catch(() => {});
  }, []);

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (summary.trim().length < 5) next.summary = "Summary must be at least 5 characters.";
    if (description.trim().length < 10) next.description = "Description must be at least 10 characters.";
    if (!categoryId) next.categoryId = "Category is required.";
    if (!relatedSystemId) next.relatedSystemId = "Related System is required.";
    return next;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setStatus("submitting");
    setApiError("");
    try {
      const ticket = await createTicket(requesterId, {
        categoryId: Number(categoryId),
        relatedSystemId: Number(relatedSystemId),
        summary: summary.trim(),
        description: description.trim(),
        requestedPriority,
      });
      setTicketNumber(ticket.ticketNumber);
      setStatus("success");
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Unable to create ticket.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div style={{ background: "var(--zg-pale)" }} className="p-4 rounded">
        <p className="fw-semibold mb-1">Ticket created</p>
        <p className="mb-0">
          Ticket Number: <strong>{ticketNumber}</strong>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ maxWidth: 560 }}>
      <p className="text-muted small">
        Ticket Date and Ticket Number are assigned by the system after submission.
      </p>

      <FormField id="category" label="Category" required error={errors.categoryId}>
        <select
          id="category"
          className="form-select"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Choose a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField id="relatedSystem" label="Related System" required error={errors.relatedSystemId}>
        <select
          id="relatedSystem"
          className="form-select"
          value={relatedSystemId}
          onChange={(e) => setRelatedSystemId(e.target.value)}
        >
          <option value="">Choose a related system…</option>
          {relatedSystems.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField id="requestedPriority" label="Requested Priority" required>
        <select
          id="requestedPriority"
          className="form-select"
          value={requestedPriority}
          onChange={(e) => setRequestedPriority(e.target.value as RequestedPriority)}
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </FormField>

      <FormField id="summary" label="Summary" required error={errors.summary}>
        <input
          id="summary"
          className="form-control"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </FormField>

      <FormField id="description" label="Description" required error={errors.description}>
        <textarea
          id="description"
          className="form-control"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>

      {status === "error" && (
        <p role="alert" style={{ color: "var(--zg-error)" }}>
          {apiError}
        </p>
      )}

      <button type="submit" className="btn btn-success" disabled={status === "submitting"}>
        {status === "submitting" ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
