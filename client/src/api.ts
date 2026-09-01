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

export interface CreateTicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
}

// Issue 8 — POST /api/tickets. requesterId goes in the header, never the body
// (api-spec.md), since ownership always comes from X-Dev-Requester-Id.
//
// Network/parse errors and non-ok responses are both mapped to one safe,
// user-facing message; the real detail goes to console.error only — the same
// leak (raw "Failed to fetch" reaching the UI) was flagged on Lab 1's
// checkSystem() and is worth not repeating here.
export async function createTicket(requesterId: number, input: CreateTicketInput): Promise<Ticket> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Dev-Requester-Id": String(requesterId) },
      body: JSON.stringify(input),
    });
  } catch (err) {
    console.error(err);
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (!res.ok) {
    console.error(`createTicket failed with status ${res.status}`);
    throw new Error("Unable to create ticket. Please try again.");
  }
  const json = await res.json();
  return json.data;
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
