import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { currentUser, requireRole } from "../lib/auth.js";
import { ACTIVE_STATUSES, STATUSES } from "../lib/query.js";
import { PRIORITIES } from "../lib/validation.js";
import {
  LIST_LIMIT,
  RECENT_RESOLVED_DAYS,
  RECENT_UPDATED_DAYS,
  ROLES,
  actionLink,
  requesterLinks,
  staffLinks,
  userLink,
  windowStart,
} from "../lib/dashboard.js";

// Dashboards — docs/lab-04/api-spec.md §5. Every number is a live COUNT on
// every request (BR-30, DB-4); nothing is cached or stored. Responses are
// summaries plus lists of at most five (BR-34, BR-38).

export const dashboardRouter = Router();

const active = { in: [...ACTIVE_STATUSES] };

const recentSelect = {
  id: true,
  ticketNumber: true,
  summary: true,
  status: true,
  updatedAt: true,
} as const;

function failure(res: Response): void {
  res.status(500).json({ error: "Unable to load the dashboard" });
}

dashboardRouter.get("/api/dashboard/requester", requireRole("REQUESTER"), async (req: Request, res: Response) => {
  const me = currentUser(req).id;
  const now = new Date();

  try {
    const prisma = getPrisma();
    // BR-37 — every query is scoped to the session's own tickets.
    const mine = { requesterId: me };

    const [open, waitingForMe, resolved, closed, recentlyUpdated, recentlyResolved] = await Promise.all([
      prisma.ticket.count({ where: { ...mine, status: active } }),
      prisma.ticket.count({ where: { ...mine, status: "WAITING_FOR_REQUESTER" } }),
      prisma.ticket.count({ where: { ...mine, status: "RESOLVED" } }),
      prisma.ticket.count({ where: { ...mine, status: "CLOSED" } }),
      prisma.ticket.findMany({
        where: { ...mine, updatedAt: { gte: windowStart(now, RECENT_UPDATED_DAYS) } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: LIST_LIMIT,
        select: recentSelect,
      }),
      prisma.ticket.findMany({
        where: { ...mine, resolvedAt: { gte: windowStart(now, RECENT_RESOLVED_DAYS) } },
        orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
        take: LIST_LIMIT,
        select: { ...recentSelect, resolvedAt: true },
      }),
    ]);

    res.status(200).json({
      metrics: { open, waitingForMe, resolved, closed },
      recentlyUpdated,
      recentlyResolved,
      links: requesterLinks,
      generatedAt: now.toISOString(),
    });
  } catch {
    failure(res);
  }
});

dashboardRouter.get(
  "/api/dashboard/staff",
  requireRole("IT_STAFF", "ADMINISTRATOR"),
  async (req: Request, res: Response) => {
    const user = currentUser(req);
    const now = new Date();
    const openActionWhere = { assigneeId: user.id, status: { in: ["PLANNED" as const, "IN_PROGRESS" as const] } };

    try {
      const prisma = getPrisma();

      const [unassigned, ownedByMe, myOpenActions, urgentActive, statusGroups, priorityGroups, actions, recentlyUpdated] =
        await Promise.all([
          prisma.ticket.count({ where: { ownerId: null, status: active } }),
          prisma.ticket.count({ where: { ownerId: user.id, status: active } }),
          prisma.actionTaken.count({ where: openActionWhere }),
          prisma.ticket.count({ where: { itPriority: "URGENT", status: active } }),
          prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
          prisma.ticket.groupBy({ by: ["itPriority"], where: { status: active }, _count: { _all: true } }),
          prisma.actionTaken.findMany({
            where: openActionWhere,
            orderBy: [{ actionAt: "asc" }, { id: "asc" }],
            take: LIST_LIMIT,
            select: {
              id: true,
              ticketId: true,
              description: true,
              status: true,
              actionAt: true,
              ticket: { select: { ticketNumber: true } },
            },
          }),
          prisma.ticket.findMany({
            where: { updatedAt: { gte: windowStart(now, RECENT_UPDATED_DAYS) } },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: LIST_LIMIT,
            select: { ...recentSelect, itPriority: true },
          }),
        ]);

      // Every status and priority is present, 0 when nothing matches (BR-35).
      const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<string, number>;
      for (const group of statusGroups) byStatus[group.status] = group._count._all;
      const byItPriority = Object.fromEntries(PRIORITIES.map((priority) => [priority, 0])) as Record<string, number>;
      for (const group of priorityGroups) byItPriority[group.itPriority] = group._count._all;

      const body: Record<string, unknown> = {
        metrics: { unassigned, ownedByMe, myOpenActions, urgentActive },
        byStatus,
        byItPriority,
        myOpenActionsList: actions.map(({ ticket, ...action }) => ({
          ...action,
          ticketNumber: ticket.ticketNumber,
          link: actionLink(action.ticketId),
        })),
        recentlyUpdated,
        links: staffLinks(user.id),
        generatedAt: now.toISOString(),
      };

      // D-09 — the Administrator reuses this endpoint with one extra block;
      // IT Staff never receive the key at all.
      if (user.role === "ADMINISTRATOR") {
        const userGroups = await prisma.user.groupBy({ by: ["role", "isActive"], _count: { _all: true } });
        body.users = Object.fromEntries(
          ROLES.map((role) => {
            const count = (isActive: boolean) =>
              userGroups.find((group) => group.role === role && group.isActive === isActive)?._count._all ?? 0;
            return [role, { active: count(true), inactive: count(false), link: userLink(role) }];
          })
        );
      }

      res.status(200).json(body);
    } catch {
      failure(res);
    }
  }
);
