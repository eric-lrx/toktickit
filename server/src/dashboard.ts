import type { Express, Response } from "express";
import type { TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { AuthedRequest, requireAuth, requireRole } from "./session.js";
import { ACTIVE_STATUSES } from "./statusFilter.js";
import { OPEN_ACTION_STATUSES } from "./actionStatus.js";

// specification.md §5.1 — every figure comes from an aggregate (count /
// groupBy) or a bounded top-N query, run together; nothing loads a whole
// collection to count it on the server or the client (BR-22). The number of
// SQL statements is fixed, whatever the data volume (PERF-03).

interface Metric {
  key: string;
  label: string;
  count: number;
  drillDown: { path: string; query?: Record<string, string> };
}

const ACTIVE_QUERY = ACTIVE_STATUSES.join(",");

function sendFailure(res: Response) {
  res.status(500).json({ error: { message: "Dashboard data could not be loaded." } });
}

export function registerDashboardRoutes(app: Express) {
  app.get("/api/dashboard/staff", requireAuth, requireRole("IT_STAFF", "ADMINISTRATOR"), async (req: AuthedRequest, res: Response) => {
    const me = req.user!.id;
    const isAdmin = req.user!.role === "ADMINISTRATOR";
    const prisma = getPrisma();
    const openActionsWhere = { assigneeId: me, status: { in: OPEN_ACTION_STATUSES } };

    try {
      const [byStatus, unassigned, myAssigned, highPriority, myOpenActionsTotal, myOpenActions, recent, accounts] = await Promise.all([
        prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.ticket.count({ where: { ticketOwnerId: null, status: { in: ACTIVE_STATUSES } } }),
        prisma.ticket.count({ where: { ticketOwnerId: me, status: { in: ACTIVE_STATUSES } } }),
        prisma.ticket.count({ where: { itPriority: "HIGH", status: { in: ACTIVE_STATUSES } } }),
        prisma.actionTaken.count({ where: openActionsWhere }),
        prisma.actionTaken.findMany({
          where: openActionsWhere,
          orderBy: [{ actionAt: "asc" }, { id: "asc" }],
          take: 10,
          select: { id: true, ticketId: true, description: true, status: true, actionAt: true, ticket: { select: { ticketNumber: true } } },
        }),
        prisma.ticket.findMany({
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 10,
          select: {
            id: true,
            ticketNumber: true,
            summary: true,
            status: true,
            itPriority: true,
            updatedAt: true,
            ticketOwner: { select: { name: true } },
          },
        }),
        isAdmin ? prisma.user.groupBy({ by: ["isActive"], _count: { _all: true } }) : Promise.resolve(null),
      ]);

      const statusCount = (s: TicketStatus) => byStatus.find((row) => row.status === s)?._count._all ?? 0;
      const queue = (query: Record<string, string>) => ({ path: "/queue", query });

      const metrics: Metric[] = [
        { key: "new", label: "New", count: statusCount("NEW"), drillDown: queue({ status: "NEW" }) },
        { key: "open", label: "Open", count: statusCount("OPEN"), drillDown: queue({ status: "OPEN" }) },
        { key: "inProgress", label: "In Progress", count: statusCount("IN_PROGRESS"), drillDown: queue({ status: "IN_PROGRESS" }) },
        {
          key: "waitingForRequester",
          label: "Waiting for Requester",
          count: statusCount("WAITING_FOR_REQUESTER"),
          drillDown: queue({ status: "WAITING_FOR_REQUESTER" }),
        },
        { key: "unassigned", label: "Unassigned", count: unassigned, drillDown: queue({ ownerId: "unassigned", status: ACTIVE_QUERY }) },
        { key: "myAssigned", label: "My Assigned", count: myAssigned, drillDown: queue({ ownerId: String(me), status: ACTIVE_QUERY }) },
        { key: "highPriority", label: "High Priority", count: highPriority, drillDown: queue({ itPriority: "HIGH", status: ACTIVE_QUERY }) },
        { key: "myOpenActions", label: "My Open Actions", count: myOpenActionsTotal, drillDown: { path: "#my-open-actions" } },
      ];

      const accountCount = (active: boolean) => accounts?.find((row) => row.isActive === active)?._count._all ?? 0;

      res.status(200).json({
        data: {
          metrics,
          myOpenActions: {
            total: myOpenActionsTotal,
            items: myOpenActions.map(({ ticket, ...a }) => ({ ...a, ticketNumber: ticket.ticketNumber })),
          },
          recentTickets: recent.map(({ ticketOwner, ...t }) => ({ ...t, ticketOwnerName: ticketOwner?.name ?? null })),
          ...(isAdmin ? { accounts: { active: accountCount(true), inactive: accountCount(false) } } : {}),
        },
      });
    } catch {
      sendFailure(res);
    }
  });

  // BR-23 — every figure is filtered by the session user; the client never
  // names the Requester (AC-02).
  app.get("/api/dashboard/requester", requireAuth, requireRole("REQUESTER"), async (req: AuthedRequest, res: Response) => {
    const requesterId = req.user!.id;
    const prisma = getPrisma();
    const listSelect = { id: true, ticketNumber: true, summary: true, status: true, updatedAt: true, resolvedAt: true } as const;

    try {
      const [byStatus, recent, recentlyResolved] = await Promise.all([
        prisma.ticket.groupBy({ by: ["status"], where: { requesterId }, _count: { _all: true } }),
        prisma.ticket.findMany({ where: { requesterId }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 5, select: listSelect }),
        prisma.ticket.findMany({
          where: { requesterId, status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { not: null } },
          orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
          take: 5,
          select: listSelect,
        }),
      ]);

      const sum = (statuses: TicketStatus[]) =>
        byStatus.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + row._count._all, 0);
      const bucket = (key: string, label: string, statuses: TicketStatus[]): Metric => ({
        key,
        label,
        count: sum(statuses),
        drillDown: { path: "/tickets", query: { status: statuses.join(",") } },
      });

      res.status(200).json({
        data: {
          metrics: [
            bucket("myOpen", "My Open Tickets", ["NEW", "OPEN", "IN_PROGRESS", "REOPENED"]),
            bucket("waitingForMe", "Waiting for Me", ["WAITING_FOR_REQUESTER"]),
            bucket("resolved", "Resolved", ["RESOLVED"]),
            bucket("closed", "Closed", ["CLOSED"]),
          ],
          recentTickets: recent,
          recentlyResolved,
        },
      });
    } catch {
      sendFailure(res);
    }
  });
}
