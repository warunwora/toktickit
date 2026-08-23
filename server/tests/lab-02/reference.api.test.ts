import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

// API-29, API-30, API-31 — docs/lab-02/tests.md §2.2
// Requires the database to be migrated and seeded (npm run prisma:seed).

describe("GET /api/categories and /api/related-systems", () => {
  // API-30 / AC-15
  it("returns the seeded active categories from the database", async () => {
    const res = await request(app).get("/api/categories");

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(
      expect.arrayContaining(["Account and Access", "Hardware", "Software", "Network"])
    );
    expect(Object.keys(res.body[0]).sort()).toEqual(["id", "name"]);
  });

  // API-30 / AC-15
  it("returns at least six active related systems in id order", async () => {
    const res = await request(app).get("/api/related-systems");

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
    expect(res.body.map((s: { name: string }) => s.name)).toEqual(
      expect.arrayContaining(["Email", "Campus Wi-Fi", "VPN", "Printer"])
    );

    const ids = res.body.map((s: { id: number }) => s.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});

describe("GET /api/requesters", () => {
  // API-29 / AC-02, BR-06
  it("returns only active Development Requesters", async () => {
    const res = await request(app).get("/api/requesters");

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);

    const names = res.body.map((r: { name: string }) => r.name);
    expect(names).toContain("Napat Srisai");
    expect(names).not.toContain("Anan Tepsiri"); // the seeded inactive requester
  });

  it("exposes the fields the selector needs and nothing else", async () => {
    const res = await request(app).get("/api/requesters");

    expect(Object.keys(res.body[0]).sort()).toEqual(["department", "email", "id", "name"]);
  });
});

describe("safe error handling", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../src/prisma.js");
  });

  // API-31 / BR-28
  it("returns a generic message and leaks no internals when the database fails", async () => {
    vi.resetModules();
    vi.doMock("../../src/prisma.js", () => ({
      getPrisma: () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5432 at PrismaClient._request");
      },
    }));

    const { app: failingApp } = await import("../../src/app.js");
    const res = await request(failingApp).get("/api/requesters");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Unable to load Development Requesters" });
    expect(JSON.stringify(res.body)).not.toMatch(/Prisma|ECONNREFUSED|5432|at |\//);
  });
});
