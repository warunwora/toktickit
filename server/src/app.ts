import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { referenceRouter } from "./routes/reference.js";
import { ticketsRouter } from "./routes/tickets.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { staffRouter } from "./routes/staff.js";
import { requireAuth, requirePasswordChanged } from "./lib/auth.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

// The session cookie only travels if the browser is allowed to send
// credentials, which rules out the wildcard origin (docs/lab-03/api-spec.md §1.1).
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Lab 1 — health check. Public: a monitor must not need credentials.
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// Lab 3 — authentication. Login is public; the rest guard themselves.
app.use(authRouter);

// Everything below this line needs a valid session, and is unreachable while an
// initial password is still in place (BR-02, decision C-02).
app.use(requireAuth, requirePasswordChanged);

// Lab 2 — reference data, tickets and attachments, now under the
// authenticated identity (BR-18).
app.use(referenceRouter);
app.use(ticketsRouter);
app.use(attachmentsRouter);

// Lab 3 — the IT Staff queue and ticket operations.
app.use(staffRouter);

export default app;
