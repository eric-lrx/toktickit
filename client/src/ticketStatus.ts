import { BadgeTone } from "./components/Badge.js";
import { TicketStatus } from "./api.js";

export const STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];

// ui-spec.md §8 — text is always the differentiator between statuses that
// share a badge tone (In Progress vs Waiting for Requester), never color alone.
export const STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

export function statusTone(status: TicketStatus): BadgeTone {
  if (status === "NEW" || status === "OPEN") return "pale";
  if (status === "RESOLVED" || status === "CLOSED") return "success";
  if (status === "CANCELLED") return "neutral";
  return "warning"; // IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED
}

// Mirrors server/src/statusTransitions.ts (BRIEFING_AGENT_LAB03.md) so the
// Status dropdown only ever offers legal targets — a UX nicety, not the
// enforcement: the server re-checks every transition regardless
// (ui-spec.md §5, "hiding a button is not authorization").
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CANCELLED: [],
};

export function allowedTransitions(from: TicketStatus): TicketStatus[] {
  return TRANSITIONS[from];
}
