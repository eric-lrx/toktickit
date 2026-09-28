const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

// Issue 32/33 — every auth call carries the httpOnly session cookie
// cross-port (Vite 5173 -> API 3000); the server's CORS config only accepts
// this because it names an explicit origin (never "*") with credentials:true.
async function readAuthError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error?.message === "string") return body.error.message;
  } catch {
    // fall through to the generic fallback
  }
  return fallback;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    console.error(err);
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (!res.ok) {
    throw new Error(await readAuthError(res, "Unable to sign in. Please try again."));
  }
  const json = await res.json();
  return json.data;
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
  } catch (err) {
    console.error(err);
    // Best-effort: the caller always clears local state regardless.
  }
}

export async function getCurrentUser(): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });
  if (!res.ok) {
    throw new Error("Not authenticated");
  }
  const json = await res.json();
  return json.data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/change-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  } catch (err) {
    console.error(err);
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (!res.ok) {
    throw new Error(await readAuthError(res, "Unable to change password. Please try again."));
  }
}

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

// Issue 35 — grown from Lab 2's NEW-only literal to the full transition
// vocabulary (BRIEFING_AGENT_LAB03.md).
export type TicketStatus =
  | "NEW"
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_REQUESTER"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED";

export interface Ticket {
  id: number;
  ticketNumber: string;
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  // Issue 36 — present on every Ticket row since the Issue 35 migration;
  // typed on the base interface because the Requester's own detail screen
  // reads resolutionSummary/requesterResolutionIndicatedAt too (ui-spec.md
  // §6), not just the IT Staff one.
  resolutionSummary: string | null;
  requesterResolutionIndicatedAt: string | null;
}

// Issue 37 — authorRole lets the UI badge who wrote each comment
// (Requester/IT Staff/Administrator), per ui-spec.md §5.
export interface PublicComment {
  id: number;
  authorName: string;
  authorRole: Role;
  content: string;
  createdAt: string;
}

export interface InternalNote {
  id: number;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  attachments: Attachment[];
  publicComments: PublicComment[];
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

// Issue 34 — ownership comes from the session cookie, never a client-
// supplied id (BR-03); every Requester-scoped call needs credentials:
// "include" so the cookie actually crosses the Vite (5173) -> API (3000)
// ports (specification.md §11), same as the auth calls above.
// Issue 11 — optional attachments switch the request to multipart/form-data;
// with none, it stays plain JSON (unchanged from Issue 8).
//
// Network/parse errors are mapped to one safe, user-facing message; the real
// detail goes to console.error only — the same leak (raw "Failed to fetch"
// reaching the UI) was flagged on Lab 1's checkSystem() and is worth not
// repeating here.
export async function createTicket(input: CreateTicketInput, files: File[] = []): Promise<TicketDetail> {
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
        credentials: "include",
        body: formData,
      });
    } else {
      res = await fetch(`${API_URL}/api/tickets`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
export async function getTicket(id: number): Promise<TicketDetail> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${id}`, { credentials: "include" });
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
export async function addAttachments(ticketId: number, files: File[]): Promise<Attachment[]> {
  const formData = new FormData();
  files.forEach((f) => formData.append("attachments", f));

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
      method: "POST",
      credentials: "include",
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

export async function removeAttachment(attachmentId: number, reason: string): Promise<Attachment> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
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

// Downloads via fetch + Blob (not a plain <a href>) because a bare anchor
// click can't send the session cookie's credentials:"include" itself.
export async function downloadAttachment(attachmentId: number, filename: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/attachments/${attachmentId}/download`, { credentials: "include" });
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
// Requester's own Tickets (always server-scoped by the session, BR-11).
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

export async function getMyTickets(query: MyTicketsQuery): Promise<MyTicketsResult> {
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
    res = await fetch(`${API_URL}/api/tickets?${params.toString()}`, { credentials: "include" });
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

// Issue 35 — IT Staff Ticket Queue: shared across every Requester, so no
// requesterId scoping the way MyTickets has (api-spec.md).
export interface StaffTicket extends Ticket {
  itPriority: RequestedPriority;
  ticketOwnerId: number | null;
  ticketOwnerName: string | null;
  categoryName: string;
}

export interface StaffUser {
  id: number;
  name: string;
}

export async function getStaffUsers(): Promise<StaffUser[]> {
  const res = await fetch(`${API_URL}/api/staff/users`, { credentials: "include" });
  if (!res.ok) throw new Error("Unable to load staff users.");
  const json = await res.json();
  return json.data;
}

export interface StaffQueueQuery {
  search?: string;
  status?: TicketStatus;
  itPriority?: RequestedPriority;
  ownerId?: number | "unassigned";
  categoryId?: number;
  sort?: "createdAt" | "updatedAt" | "itPriority" | "ticketNumber";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface StaffQueueResult {
  data: StaffTicket[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export async function getStaffQueue(query: StaffQueueQuery): Promise<StaffQueueResult> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.itPriority) params.set("itPriority", query.itPriority);
  if (query.ownerId !== undefined) params.set("ownerId", String(query.ownerId));
  if (query.categoryId !== undefined) params.set("categoryId", String(query.categoryId));
  if (query.sort) params.set("sort", query.sort);
  if (query.order) params.set("order", query.order);
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 10));

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/staff/tickets?${params.toString()}`, { credentials: "include" });
  } catch (err) {
    console.error(err);
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (res.status === 403) {
    throw new Error("You do not have access to the ticket queue.");
  }
  if (!res.ok) {
    console.error(`getStaffQueue failed with status ${res.status}`);
    throw new Error("Unable to load the ticket queue. Please try again.");
  }
  return res.json();
}

// Issue 36 — IT Staff Ticket Detail and workflow.
export interface StaffTicketDetail extends StaffTicket {
  categoryName: string;
  attachments: Attachment[];
  publicComments: PublicComment[];
  internalNotes: InternalNote[];
}

async function readStaffError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error?.message === "string") return body.error.message;
  } catch {
    // fall through to the generic fallback
  }
  return fallback;
}

export async function getStaffTicket(id: number): Promise<StaffTicketDetail> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/staff/tickets/${id}`, { credentials: "include" });
  } catch (err) {
    console.error(err);
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (res.status === 403) throw new Error("You do not have access to this ticket.");
  if (res.status === 404) throw new Error("Ticket not found.");
  if (!res.ok) throw new Error("Unable to load ticket. Please try again.");
  const json = await res.json();
  return json.data;
}

export async function setTicketOwner(id: number, ticketOwnerId: number | null): Promise<void> {
  const res = await fetch(`${API_URL}/api/staff/tickets/${id}/owner`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketOwnerId }),
  });
  if (!res.ok) throw new Error(await readStaffError(res, "Unable to update the ticket owner."));
}

export async function setTicketItPriority(id: number, itPriority: RequestedPriority): Promise<void> {
  const res = await fetch(`${API_URL}/api/staff/tickets/${id}/priority`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itPriority }),
  });
  if (!res.ok) throw new Error(await readStaffError(res, "Unable to update IT Priority."));
}

export async function setTicketStatus(id: number, status: TicketStatus, resolutionSummary?: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/staff/tickets/${id}/status`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, resolutionSummary }),
  });
  if (!res.ok) throw new Error(await readStaffError(res, "Unable to update status."));
}

// Requester-only — BR-05: sets the signal, never the formal status.
export async function indicateResolution(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/tickets/${id}/resolution-indicated`, {
    method: "PATCH",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readStaffError(res, "Unable to record your response. Please try again."));
}

// Issue 37 — Public Comments (owning Requester or any IT Staff) and
// Internal Notes (IT Staff only). Both append-only: no update/remove calls
// exist because no such route exists server-side (BR-25).
export async function postComment(ticketId: number, content: string): Promise<PublicComment> {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/comments`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(await readStaffError(res, "Unable to post your comment. Please try again."));
  const json = await res.json();
  return json.data;
}

export async function postNote(ticketId: number, content: string): Promise<InternalNote> {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/notes`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(await readStaffError(res, "Unable to post the internal note. Please try again."));
  const json = await res.json();
  return json.data;
}

// Issue 38 — Administrator user management.
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface AdminUserQuery {
  search?: string;
  role?: Role;
}

export interface AdminUserInput {
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export async function getAdminUsers(query: AdminUserQuery): Promise<AdminUser[]> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.role) params.set("role", query.role);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/admin/users?${params.toString()}`, { credentials: "include" });
  } catch (err) {
    console.error(err);
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (res.status === 403) throw new Error("You do not have access to user management.");
  if (!res.ok) throw new Error("Unable to load users. Please try again.");
  const json = await res.json();
  return json.data;
}

export async function createAdminUser(input: AdminUserInput & { initialPassword: string }): Promise<AdminUser> {
  const res = await fetch(`${API_URL}/api/admin/users`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readStaffError(res, "Unable to create the user. Please try again."));
  const json = await res.json();
  return json.data;
}

export async function updateAdminUser(id: number, input: Partial<AdminUserInput>): Promise<AdminUser> {
  const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readStaffError(res, "Unable to save this user. Please try again."));
  const json = await res.json();
  return json.data;
}

export async function setAdminUserPassword(id: number, newPassword: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/users/${id}/password`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) throw new Error(await readStaffError(res, "Unable to set the new password. Please try again."));
}

// Lab 4 — carries the API's error code (STALE_UPDATE, RESOLUTION_BLOCKED, ...)
// and extra fields (current, blockingActionIds) so screens can react to a
// specific conflict instead of only showing a message.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

async function toApiError(res: Response, fallback: string): Promise<ApiError> {
  if (res.status >= 500) return new ApiError(res.status, fallback);
  try {
    const body = await res.json();
    const { message, code, ...details } = body?.error ?? {};
    return new ApiError(res.status, typeof message === "string" ? message : fallback, code, details);
  } catch {
    return new ApiError(res.status, fallback);
  }
}

async function sendJson(url: string, method: string, body: unknown, fallback: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(err);
    throw new ApiError(0, "Unable to reach the server. Please try again.");
  }
  if (!res.ok) throw await toApiError(res, fallback);
  return res;
}

// Lab 4, Issue 24 — Actions Taken (docs/lab-04/api-spec.md).
export type ActionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface ActionTaken {
  id: number;
  ticketId: number;
  actionAt: string;
  description: string;
  result: string | null;
  status: ActionStatus;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  performedById: number;
  performedByName: string;
  assigneeId: number | null;
  assigneeName: string | null;
  assigneeActive: boolean | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActionInput {
  description: string;
  actionAt?: string;
  result?: string | null;
  assigneeId?: number | null;
  status?: ActionStatus;
  followUpRequired?: boolean;
  followUpNote?: string | null;
  attachmentNotes?: string | null;
}

export async function getTicketActions(ticketId: number): Promise<ActionTaken[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${ticketId}/actions`, { credentials: "include" });
  } catch (err) {
    console.error(err);
    throw new ApiError(0, "Unable to reach the server. Please try again.");
  }
  if (!res.ok) throw await toApiError(res, "Unable to load actions. Please try again.");
  const json = await res.json();
  return json.data;
}

export async function createTicketAction(ticketId: number, input: ActionInput): Promise<ActionTaken> {
  const res = await sendJson(`${API_URL}/api/tickets/${ticketId}/actions`, "POST", input, "Unable to save the action. Please try again.");
  const json = await res.json();
  return json.data;
}

export async function updateTicketAction(
  actionId: number,
  input: Partial<ActionInput> & { version: number }
): Promise<ActionTaken> {
  const res = await sendJson(`${API_URL}/api/actions/${actionId}`, "PATCH", input, "Unable to save the action. Please try again.");
  const json = await res.json();
  return json.data;
}
