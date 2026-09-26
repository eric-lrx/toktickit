import type { TicketStatus } from "@prisma/client";

// BR-16 — set on a move to RESOLVED, kept through CLOSED, cleared on
// REOPENED so "Recently Resolved" only ever shows the latest resolution.
export function nextResolvedAt(target: TicketStatus, current: Date | null, now: Date): Date | null {
  if (target === "RESOLVED") return now;
  if (target === "REOPENED") return null;
  return current;
}
