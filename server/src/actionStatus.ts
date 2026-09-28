import type { ActionStatus, TicketStatus } from "@prisma/client";

// BR-07 — one lookup table, same pattern as statusTransitions.ts.
const ACTION_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const ACTION_STATUSES = Object.keys(ACTION_TRANSITIONS) as ActionStatus[];

export function allowedActionTransitions(from: ActionStatus): ActionStatus[] {
  return ACTION_TRANSITIONS[from];
}

export function isAllowedActionTransition(from: ActionStatus, to: ActionStatus): boolean {
  return ACTION_TRANSITIONS[from].includes(to);
}

export function isTerminalActionStatus(status: ActionStatus): boolean {
  return ACTION_TRANSITIONS[status].length === 0;
}

// BR-10 — Actions Taken can only be created or changed while the Ticket is
// still being worked; this also keeps the resolution gate's invariant true
// after resolution, not only at the moment of it.
export const ACTIVE_TICKET_STATUSES: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];

// Resolution gate (BR-15): only these block a transition to RESOLVED.
export const OPEN_ACTION_STATUSES: ActionStatus[] = ["PLANNED", "IN_PROGRESS"];
