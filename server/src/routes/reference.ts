import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";

// Reference data used by the Create Ticket form, the My Tickets filters, and the
// Development Requester selector.
// Contract: docs/lab-02/api-spec.md §2.

export const referenceRouter = Router();

// Lab 1 contract preserved: a bare array of { id, name } in id order (D-09).
// Lab 2 only narrows it to active rows.
referenceRouter.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    res.status(200).json(categories);
  } catch {
    res.status(500).json({ error: "Unable to load categories" });
  }
});

referenceRouter.get("/api/related-systems", async (_req: Request, res: Response) => {
  try {
    const relatedSystems = await getPrisma().relatedSystem.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    res.status(200).json(relatedSystems);
  } catch {
    res.status(500).json({ error: "Unable to load related systems" });
  }
});

// Active Development Requesters only (BR-06). This endpoint is the one place the
// tester picks an identity, so it deliberately needs no X-Requester-Id header.
referenceRouter.get("/api/requesters", async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().requesterUser.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, department: true },
      orderBy: { id: "asc" },
    });
    res.status(200).json(requesters);
  } catch {
    res.status(500).json({ error: "Unable to load Development Requesters" });
  }
});
