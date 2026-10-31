import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";

// REG-01 … REG-04 — docs/lab-04/tests.md §2.6; specification.md §7.5.
//
// The recovery drill runs in a throwaway PostgreSQL schema inside the local
// database: the Lab 1-3 migrations build it, Lab 3 rows are inserted, then the
// Lab 4 migration, the recovery script and the migration again are applied,
// and every Lab 3 row is compared after each step. The real schema is never
// touched by the drill.

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS_DIR = path.join(SERVER_DIR, "prisma/migrations");
const LAB4_MIGRATION = "20261031090000_lab4_actions_taken";
const RECOVERY_SQL = path.join(SERVER_DIR, "prisma/recovery/lab4_down.sql");

const SCHEMA = `lab4_recovery_${Date.now()}`;

// Prisma reads server/.env itself, but the drill needs the URL before any
// client exists, so load it the same way when the shell has not set it.
if (!process.env.DATABASE_URL) process.loadEnvFile(path.join(SERVER_DIR, ".env"));
const scratchUrl = (() => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.searchParams.set("schema", SCHEMA);
  // The drill changes table shapes under the same SELECT; cached plans would break.
  url.searchParams.set("statement_cache_size", "0");
  return url.toString();
})();

const prisma = getPrisma();
let scratch: PrismaClient;

function runSql(file: string): void {
  execFileSync("npx", ["prisma", "db", "execute", "--url", scratchUrl, "--file", file], {
    cwd: SERVER_DIR,
    stdio: "pipe",
  });
}

const migrationFile = (name: string) => path.join(MIGRATIONS_DIR, name, "migration.sql");

/** Every Lab 3 row, in a stable order, without the Lab 4 column. */
async function snapshot() {
  const read = (table: string) => scratch.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${table}" ORDER BY id`);
  const tickets = (await read("Ticket")).map(({ version: _version, ...rest }) => rest);
  return {
    users: await read("User"),
    tickets,
    attachments: await read("Attachment"),
    comments: await read("PublicComment"),
    notes: await read("InternalNote"),
  };
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await scratch.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    SCHEMA,
    table,
    column
  );
  return Number(rows[0].n) > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await scratch.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    SCHEMA,
    table
  );
  return Number(rows[0].n) > 0;
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
  scratch = new PrismaClient({ datasourceUrl: scratchUrl });

  const earlier = readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{14}_/.test(name) && name < LAB4_MIGRATION)
    .sort();
  for (const name of earlier) runSql(migrationFile(name));

  // Lab 3 data: users of every role, a ticket in every column that matters,
  // an attachment, a comment and a note.
  await scratch.$executeRawUnsafe(`INSERT INTO "Category" ("name") VALUES ('Hardware')`);
  await scratch.$executeRawUnsafe(`INSERT INTO "RelatedSystem" ("name") VALUES ('Printer')`);
  await scratch.$executeRawUnsafe(`
    INSERT INTO "User" ("name", "email", "passwordHash", "role", "department", "updatedAt") VALUES
      ('Req One', 'req@lab3.test', 'h', 'REQUESTER', 'Library', now()),
      ('Staff One', 'staff@lab3.test', 'h', 'IT_STAFF', 'Desk', now()),
      ('Admin One', 'admin@lab3.test', 'h', 'ADMINISTRATOR', NULL, now())`);
  await scratch.$executeRawUnsafe(`
    INSERT INTO "Ticket" ("ticketNumber", "requesterId", "ownerId", "categoryId", "relatedSystemId", "summary",
                          "description", "requestedPriority", "itPriority", "status", "resolutionSummary",
                          "resolvedAt", "updatedAt") VALUES
      ('TKT-2026-000001', 1, NULL, 1, 1, 'Printer offline on floor three', 'Shows offline for everyone.', 'HIGH', 'HIGH', 'NEW', NULL, NULL, now()),
      ('TKT-2026-000002', 1, 2, 1, 1, 'Paper jam on duplex printing', 'Jams on every duplex job.', 'LOW', 'MEDIUM', 'RESOLVED', 'Replaced the roller.', now(), now())`);
  await scratch.$executeRawUnsafe(`
    INSERT INTO "Attachment" ("ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes", "uploadedByUserId")
    VALUES (1, 'evidence.png', 'stored-evidence.png', 'image/png', 1234, 1)`);
  await scratch.$executeRawUnsafe(`INSERT INTO "PublicComment" ("ticketId", "authorId", "body") VALUES (1, 2, 'Looking into it.')`);
  await scratch.$executeRawUnsafe(`INSERT INTO "InternalNote" ("ticketId", "authorId", "body") VALUES (2, 3, 'Roller ordered.')`);
}, 120_000);

afterAll(async () => {
  await scratch?.$disconnect();
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
});

describe("Lab 4 migration and recovery drill", () => {
  // REG-01 (drill half) / REG-02 / REG-03 — AC-39
  it("adds Lab 4 without touching Lab 3 rows, reverses cleanly, and re-applies", async () => {
    const lab3 = await snapshot();
    expect(lab3.tickets).toHaveLength(2);

    runSql(migrationFile(LAB4_MIGRATION));
    expect(await tableExists("ActionTaken")).toBe(true);
    const versions = await scratch.$queryRawUnsafe<{ version: number }[]>(`SELECT "version" FROM "Ticket"`);
    expect(versions.map((row) => row.version)).toEqual([1, 1]);
    expect(await scratch.$queryRawUnsafe(`SELECT * FROM "ActionTaken"`)).toEqual([]);
    expect(await snapshot()).toEqual(lab3);

    // Lab 4 data that the recovery is allowed to lose.
    await scratch.$executeRawUnsafe(`
      INSERT INTO "ActionTaken" ("ticketId", "actionAt", "description", "performedById", "assigneeId", "updatedAt")
      VALUES (1, now(), 'Checked the cable.', 2, 2, now())`);

    runSql(RECOVERY_SQL);
    expect(await tableExists("ActionTaken")).toBe(false);
    expect(await columnExists("Ticket", "version")).toBe(false);
    const enums = await scratch.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = $1 AND t.typname = 'ActionStatus'`,
      SCHEMA
    );
    expect(Number(enums[0].n)).toBe(0);
    expect(await snapshot()).toEqual(lab3);

    runSql(migrationFile(LAB4_MIGRATION));
    expect(await tableExists("ActionTaken")).toBe(true);
    expect(await columnExists("Ticket", "version")).toBe(true);
    expect(await snapshot()).toEqual(lab3);
  }, 120_000);
});

describe("the migrated development database", () => {
  // REG-01 — AC-39
  it("keeps every Ticket valid with version 1 or more, and every child row attached", async () => {
    const [tickets, belowOne, orphans] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ where: { version: { lt: 1 } } }),
      prisma.$queryRawUnsafe<{ n: bigint }[]>(`
        SELECT (SELECT count(*) FROM "Attachment" a LEFT JOIN "Ticket" t ON t.id = a."ticketId" WHERE t.id IS NULL)
             + (SELECT count(*) FROM "PublicComment" c LEFT JOIN "Ticket" t ON t.id = c."ticketId" WHERE t.id IS NULL)
             + (SELECT count(*) FROM "InternalNote" i LEFT JOIN "Ticket" t ON t.id = i."ticketId" WHERE t.id IS NULL) AS n`),
    ]);

    expect(tickets).toBeGreaterThan(0);
    expect(belowOne).toBe(0);
    expect(Number(orphans[0].n)).toBe(0);
  });

  // REG-04 — AC-40
  it("seeds idempotently, with Tickets holding zero, one and several Actions Taken", async () => {
    const seed = () => execFileSync("npx", ["tsx", "prisma/seed.ts"], { cwd: SERVER_DIR, encoding: "utf8" });

    seed();
    const before = await Promise.all([prisma.ticket.count(), prisma.actionTaken.count(), prisma.user.count()]);
    const output = seed();
    const after = await Promise.all([prisma.ticket.count(), prisma.actionTaken.count(), prisma.user.count()]);

    expect(after).toEqual(before);
    expect(output).toContain("Created 0 ticket(s), 0 comment(s), 0 internal note(s) and 0 action(s) taken");

    const perTicket = await prisma.ticket.findMany({ select: { _count: { select: { actionsTaken: true } } } });
    const counts = perTicket.map((ticket) => ticket._count.actionsTaken);
    expect(counts).toContain(0);
    expect(counts).toContain(1);
    expect(counts.some((n) => n > 1)).toBe(true);
  }, 120_000);
});
