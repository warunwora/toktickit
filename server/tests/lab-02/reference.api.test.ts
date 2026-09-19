import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { cleanUpSessions, cookie, prepareCookies } from "../helpers/session.js";

// API-29, API-30, API-31 — docs/lab-02/tests.md §2.2
// Requires the database to be migrated and seeded (npm run prisma:seed).
// Lab 3: reference data now needs a session (docs/lab-03/api-spec.md §4).
// The Lab 2 "GET /api/requesters" cases are gone with the endpoint (BR-61);
// REG-06 in tests/lab-03/requester-regression.api.test.ts proves it answers 404.

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

describe("GET /api/categories and /api/related-systems", () => {
  // API-30 / AC-15
  it("returns the seeded active categories from the database", async () => {
    const res = await request(app).get("/api/categories").set("Cookie", cookie(requesterId));

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(
      expect.arrayContaining(["Account and Access", "Hardware", "Software", "Network"])
    );
    expect(Object.keys(res.body[0]).sort()).toEqual(["id", "name"]);
  });

  // API-30 / AC-15
  it("returns at least six active related systems in id order", async () => {
    const res = await request(app).get("/api/related-systems").set("Cookie", cookie(requesterId));

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
    expect(res.body.map((s: { name: string }) => s.name)).toEqual(
      expect.arrayContaining(["Email", "Campus Wi-Fi", "VPN", "Printer"])
    );

    const ids = res.body.map((s: { id: number }) => s.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});
