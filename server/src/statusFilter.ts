import type { TicketStatus } from "@prisma/client";

export const TICKET_STATUS_VALUES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];

// Every status except CLOSED and CANCELLED (specification.md §5.1, "Active").
export const ACTIVE_STATUSES: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "REOPENED"];

// BR-27 — `status` accepts one value or a comma-separated list, so a
// dashboard card's drill-down can apply exactly the card's own filter.
export function parseStatusList(raw: string): { statuses: TicketStatus[] } | { error: string } {
  const parts = raw.split(",").map((p) => p.trim());
  for (const p of parts) {
    if (!TICKET_STATUS_VALUES.includes(p as TicketStatus)) return { error: `invalid status: '${p}'` };
  }
  return { statuses: parts as TicketStatus[] };
}
