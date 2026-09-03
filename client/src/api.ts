const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface Requester {
  id: number;
  name: string;
  email: string;
}

// Issue 6 — active Development Requesters for the selector screen.
export async function getActiveRequesters(): Promise<Requester[]> {
  const res = await fetch(`${API_URL}/api/requesters`);
  if (!res.ok) {
    throw new Error("Failed to load requesters");
  }
  return res.json();
}

export interface RelatedSystem {
  id: number;
  name: string;
}

// Issue 8 — reference data for the Create Ticket form.
export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${API_URL}/api/categories`);
  if (!res.ok) throw new Error("Failed to load categories");
  return res.json();
}

export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await fetch(`${API_URL}/api/related-systems`);
  if (!res.ok) throw new Error("Failed to load related systems");
  return res.json();
}

export type RequestedPriority = "LOW" | "MEDIUM" | "HIGH";

export interface Attachment {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  removedAt: string | null;
  removalReason: string | null;
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
  status: "NEW";
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail extends Ticket {
  attachments: Attachment[];
}

export interface CreateTicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
}

// Reads a safe, server-crafted error message (api-spec.md's error.message —
// intentional and safe to show, unlike a raw browser/network string) for a
// non-2xx response. 500s are never trusted verbatim (safe unexpected-error
// behavior) — only 4xx bodies, which this API always writes itself.
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  if (res.status >= 500) return fallback;
  try {
    const body = await res.json();
    if (typeof body?.error?.message === "string") return body.error.message;
  } catch {
    // fall through to the generic fallback
  }
  return fallback;
}

// Issue 8 — POST /api/tickets. requesterId goes in the header, never the body
// (api-spec.md), since ownership always comes from X-Dev-Requester-Id.
// Issue 11 — optional attachments switch the request to multipart/form-data;
// with none, it stays plain JSON (unchanged from Issue 8).
//
// Network/parse errors are mapped to one safe, user-facing message; the real
// detail goes to console.error only — the same leak (raw "Failed to fetch"
// reaching the UI) was flagged on Lab 1's checkSystem() and is worth not
// repeating here.
export async function createTicket(
  requesterId: number,
  input: CreateTicketInput,
  files: File[] = []
): Promise<TicketDetail> {
  let res: Response;
  try {
    if (files.length > 0) {
      const formData = new FormData();
      formData.set("categoryId", String(input.categoryId));
      formData.set("relatedSystemId", String(input.relatedSystemId));
      formData.set("summary", input.summary);
      formData.set("description", input.description);
      formData.set("requestedPriority", input.requestedPriority);
      files.forEach((f) => formData.append("attachments", f));
      res = await fetch(`${API_URL}/api/tickets`, {
        method: "POST",
        headers: { "X-Dev-Requester-Id": String(requesterId) },
        body: formData,
      });
    } else {
      res = await fetch(`${API_URL}/api/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Dev-Requester-Id": String(requesterId) },
        body: JSON.stringify(input),
      });
    }
  } catch (err) {
    console.error(err);
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (!res.ok) {
    const message = await readErrorMessage(res, "Unable to create ticket. Please try again.");
    throw new Error(message);
  }
  const json = await res.json();
  return json.data;
}

// Issue 10 — Requester Ticket Detail, read-only. 404 (owned or not found,
// same response either way — BR-10) is treated as "Ticket not found" by the
// caller; there's no separate "forbidden" case to distinguish.
export async function getTicket(requesterId: number, id: number): Promise<TicketDetail> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${id}`, {
      headers: { "X-Dev-Requester-Id": String(requesterId) },
    });
  } catch (err) {
    console.error(err);
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (res.status === 404) {
    throw new Error("Ticket not found.");
  }
  if (!res.ok) {
    console.error(`getTicket failed with status ${res.status}`);
    throw new Error("Unable to load ticket. Please try again.");
  }
  const json = await res.json();
  return json.data;
}

// Issue 11 — Attachment lifecycle.
export async function addAttachments(requesterId: number, ticketId: number, files: File[]): Promise<Attachment[]> {
  const formData = new FormData();
  files.forEach((f) => formData.append("attachments", f));

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
      method: "POST",
      headers: { "X-Dev-Requester-Id": String(requesterId) },
      body: formData,
    });
  } catch (err) {
    console.error(err);
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (!res.ok) {
    const message = await readErrorMessage(res, "Unable to add attachment. Please try again.");
    throw new Error(message);
  }
  const json = await res.json();
  return json.data;
}

export async function removeAttachment(requesterId: number, attachmentId: number, reason: string): Promise<Attachment> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-Dev-Requester-Id": String(requesterId) },
      body: JSON.stringify({ reason }),
    });
  } catch (err) {
    console.error(err);
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (!res.ok) {
    const message = await readErrorMessage(res, "Unable to remove attachment. Please try again.");
    throw new Error(message);
  }
  const json = await res.json();
  return json.data;
}

// Downloads via fetch + Blob (not a plain <a href>) because the download
// route needs the same X-Dev-Requester-Id header as every other requester-
// scoped route — a bare anchor click can't attach a custom header.
export async function downloadAttachment(requesterId: number, attachmentId: number, filename: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/attachments/${attachmentId}/download`, {
      headers: { "X-Dev-Requester-Id": String(requesterId) },
    });
  } catch (err) {
    console.error(err);
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (!res.ok) {
    throw new Error(res.status === 404 ? "This attachment is not available." : "Unable to download attachment.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Issue 9 — My Tickets: search, filter, sort, paginate the current
// Requester's own Tickets (always server-scoped by X-Dev-Requester-Id, BR-11).
export interface MyTicketsQuery {
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: RequestedPriority;
  sort?: "createdAt" | "ticketNumber" | "summary";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface MyTicketsResult {
  data: Ticket[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export async function getMyTickets(requesterId: number, query: MyTicketsQuery): Promise<MyTicketsResult> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.categoryId !== undefined) params.set("categoryId", String(query.categoryId));
  if (query.relatedSystemId !== undefined) params.set("relatedSystemId", String(query.relatedSystemId));
  if (query.requestedPriority) params.set("requestedPriority", query.requestedPriority);
  if (query.sort) params.set("sort", query.sort);
  if (query.order) params.set("order", query.order);
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 10));

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets?${params.toString()}`, {
      headers: { "X-Dev-Requester-Id": String(requesterId) },
    });
  } catch (err) {
    console.error(err);
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (!res.ok) {
    console.error(`getMyTickets failed with status ${res.status}`);
    throw new Error("Unable to load tickets. Please try again.");
  }
  return res.json();
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  const healthRes = await fetch(`${API_URL}/api/health`);
  if (!healthRes.ok) {
    throw new Error("Backend health check failed");
  }

  const categoriesRes = await fetch(`${API_URL}/api/categories`);
  if (!categoriesRes.ok) {
    throw new Error("Failed to load categories");
  }
  const categories: Category[] = await categoriesRes.json();

  return { online: true, categories };
}
