import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";

// Reference data used by the Create Ticket form and the My Tickets filters.
// Contract: docs/lab-02/api-spec.md §2; every route now requires a session
// (docs/lab-03/api-spec.md §4).

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

// GET /api/requesters is removed in Lab 3 (BR-61): identity now comes from the
// authenticated session, not from a selector.
