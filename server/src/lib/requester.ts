import { Request } from "express";
import { getPrisma } from "../prisma.js";

// The ONLY place that resolves "who is asking" (BR-43).
// Lab 2 reads the X-Requester-Id header, which is a testing mechanism and not
// authentication (BR-05). Lab 3 replaces the body of resolveRequester() with a
// session or token lookup; no route needs to change.

export const REQUESTER_HEADER = "x-requester-id";

export class RequesterError extends Error {
  status: number;
  field?: string;

  constructor(status: number, message: string, field?: string) {
    super(message);
    this.name = "RequesterError";
    this.status = status;
    this.field = field;
  }
}

export interface CurrentRequester {
  id: number;
  name: string;
}

export async function resolveRequester(req: Request): Promise<CurrentRequester> {
  const raw = req.header(REQUESTER_HEADER);
  const id = Number(raw);

  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw new RequesterError(400, "A Development Requester must be selected", "X-Requester-Id");
  }

  const requester = await getPrisma().requesterUser.findFirst({
    where: { id, isActive: true },
    select: { id: true, name: true },
  });

  if (!requester) {
    throw new RequesterError(400, "The selected Development Requester is no longer available");
  }

  return requester;
}
