import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { AuthUser, currentUser, requireRole } from "../lib/auth.js";
import { validateEntryBody } from "../lib/content.js";

// Public Comments, Internal Notes and the Requester resolution indication —
// docs/lab-03/api-spec.md §4.1-§4.3 and §5.
//
// Two visibility rules drive this whole file:
//   * a Requester may only touch their own ticket, and an ownership violation
//     answers 404 so existence is never disclosed (BR-22, decision D-05);
//   * Internal Notes answer 404 to a Requester, not 403, for the same reason
//     (AC-14) — which is why the note routes gate on the role themselves
//     instead of using requireRole.

export const conversationRouter = Router();

const authorSelect = { select: { id: true, name: true, role: true } } as const;
const entrySelect = { id: true, body: true, createdAt: true, author: authorSelect } as const;

const notFound = (res: Response) => res.status(404).json({ error: "Ticket not found" });

function ticketId(req: Request): number | null {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : null;
}

/**
 * Resolves the ticket the caller is allowed to see. A Requester is narrowed to
 * their own ticket in the query itself, so a ticket belonging to someone else
 * and a ticket that does not exist produce the identical `null`.
 */
async function visibleTicket(user: AuthUser, id: number): Promise<{ id: number; status: string } | null> {
  return getPrisma().ticket.findFirst({
    where: { id, ...(user.role === "REQUESTER" ? { requesterId: user.id } : {}) },
    select: { id: true, status: true },
  });
}

// --- Public Comments -------------------------------------------------------

const commentRoles = requireRole("REQUESTER", "IT_STAFF", "ADMINISTRATOR");

conversationRouter.get("/api/tickets/:id/comments", commentRoles, async (req: Request, res: Response) => {
  const id = ticketId(req);
  if (id === null) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  try {
    const ticket = await visibleTicket(currentUser(req), id);
    if (!ticket) {
      notFound(res);
      return;
    }

    const comments = await getPrisma().publicComment.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: "asc" },
      select: entrySelect,
    });

    res.status(200).json({ comments });
  } catch {
    res.status(500).json({ error: "Unable to load the comments" });
  }
});

conversationRouter.post("/api/tickets/:id/comments", commentRoles, async (req: Request, res: Response) => {
  const id = ticketId(req);
  if (id === null) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  const user = currentUser(req);
  const { errors, value } = validateEntryBody(req.body?.body, "Comment");
  if (!value) {
    res.status(400).json({ error: "Validation failed", fields: errors });
    return;
  }

  try {
    const ticket = await visibleTicket(user, id);
    if (!ticket) {
      notFound(res);
      return;
    }

    // BR-44 — the author and the time come from the server; anything the
    // client sent for them is ignored, not merged.
    const comment = await getPrisma().publicComment.create({
      data: { ticketId: id, authorId: user.id, body: value },
      select: entrySelect,
    });

    res.status(201).json(comment);
  } catch {
    res.status(500).json({ error: "Unable to post the comment" });
  }
});

// --- Internal Notes --------------------------------------------------------

/**
 * A Requester must not learn that notes exist, so this gate answers 404 with
 * the ticket message rather than the 403 every other role check uses (AC-14).
 */
function staffOnlyOr404(req: Request, res: Response): AuthUser | null {
  const user = currentUser(req);
  if (user.role === "REQUESTER") {
    notFound(res);
    return null;
  }
  return user;
}

conversationRouter.get("/api/tickets/:id/notes", async (req: Request, res: Response) => {
  const id = ticketId(req);
  if (id === null) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  const user = staffOnlyOr404(req, res);
  if (!user) return;

  try {
    const ticket = await visibleTicket(user, id);
    if (!ticket) {
      notFound(res);
      return;
    }

    const notes = await getPrisma().internalNote.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: "asc" },
      select: entrySelect,
    });

    res.status(200).json({ notes });
  } catch {
    res.status(500).json({ error: "Unable to load the internal notes" });
  }
});

conversationRouter.post("/api/tickets/:id/notes", async (req: Request, res: Response) => {
  const id = ticketId(req);
  if (id === null) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  const user = staffOnlyOr404(req, res);
  if (!user) return;

  const { errors, value } = validateEntryBody(req.body?.body, "Internal Note");
  if (!value) {
    res.status(400).json({ error: "Validation failed", fields: errors });
    return;
  }

  try {
    const ticket = await visibleTicket(user, id);
    if (!ticket) {
      notFound(res);
      return;
    }

    const note = await getPrisma().internalNote.create({
      data: { ticketId: id, authorId: user.id, body: value },
      select: entrySelect,
    });

    res.status(201).json(note);
  } catch {
    res.status(500).json({ error: "Unable to post the internal note" });
  }
});

// --- The Requester resolution indication ------------------------------------

const resolutionSelect = {
  id: true,
  ticketNumber: true,
  status: true,
  requesterResolvedAt: true,
  updatedAt: true,
} as const;

conversationRouter.post(
  "/api/tickets/:id/problem-resolved",
  requireRole("REQUESTER"),
  async (req: Request, res: Response) => {
    const id = ticketId(req);
    if (id === null) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    const requesterId = currentUser(req).id;

    try {
      const prisma = getPrisma();
      const ticket = await prisma.ticket.findFirst({
        where: { id, requesterId },
        select: { id: true, requesterResolvedAt: true },
      });

      if (!ticket) {
        notFound(res);
        return;
      }

      // BR-40 — this records an opinion, never a status. Calling it again keeps
      // the first timestamp, so a double click cannot rewrite history.
      const updated = ticket.requesterResolvedAt
        ? await prisma.ticket.findUniqueOrThrow({ where: { id }, select: resolutionSelect })
        : await prisma.ticket.update({
            where: { id },
            data: { requesterResolvedAt: new Date() },
            select: resolutionSelect,
          });

      res.status(200).json(updated);
    } catch {
      res.status(500).json({ error: "Unable to record that the problem appears resolved" });
    }
  }
);
