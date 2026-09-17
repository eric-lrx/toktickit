import type { TicketStatus } from "@prisma/client";

// BRIEFING_AGENT_LAB03.md's transition table, as a lookup — not scattered
// `if`s — so PATCH /api/staff/tickets/:id/status has one place to check
// and one place to report "current state + allowed transitions" from.
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CANCELLED: [], // terminal
};

export function allowedTransitions(from: TicketStatus): TicketStatus[] {
  return TRANSITIONS[from];
}

export function isAllowedTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
