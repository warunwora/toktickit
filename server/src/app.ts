import express, { Request, Response } from "express";
import cors from "cors";
import { referenceRouter } from "./routes/reference.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // lets the Vite dev server call this API
app.use(express.json());

// Lab 1 — health check.
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// Lab 2 — reference data: categories, related systems, Development Requesters.
app.use(referenceRouter);

export default app;
