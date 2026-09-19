import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { cleanUpSessions, cookie, prepareCookies } from "../helpers/session.js";

// Requires the DB to be migrated and seeded first.
// Lab 3: reference data now requires a session (docs/lab-03/api-spec.md §4).
let requesterId = 0;

beforeAll(async () => {
  const requester = await getPrisma().user.findFirst({
    where: { isActive: true, role: "REQUESTER" },
    orderBy: { id: "asc" },
  });
  requesterId = requester!.id;
  await prepareCookies(requesterId);
});

afterAll(async () => {
  await cleanUpSessions();
});

describe("GET /api/categories", () => {
  it("returns the four seeded categories in id order", async () => {
    const res = await request(app).get("/api/categories").set("Cookie", cookie(requesterId));

    expect(res.status).toBe(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual([
      "Account and Access",
      "Hardware",
      "Software",
      "Network",
    ]);
    expect(res.body[0]).toEqual({ id: expect.any(Number), name: "Account and Access" });
  });
});
