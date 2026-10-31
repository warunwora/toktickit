-- Lab 4 — docs/lab-04/specification.md §7.
--
-- Additive only (§7.5): a new enum, a new table, a version column with a
-- default and one index. No existing column is renamed, dropped or rewritten,
-- so every Lab 2 and Lab 3 row stays valid. Legacy Tickets get version 1 from
-- the default and no invented Actions Taken (BR-43).
-- Reverse with prisma/recovery/lab4_down.sql.

CREATE TYPE "ActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- Optimistic concurrency (BR-23, BR-24, DB-2).
ALTER TABLE "Ticket" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "result" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'PLANNED',
    "performedById" INTEGER NOT NULL,
    "assigneeId" INTEGER NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "followUpClearedAt" TIMESTAMP(3),
    "followUpClearedById" INTEGER,
    "attachmentNotes" TEXT,
    "cancelReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- §7.3 — one Ticket's list in stable order and the resolution gate; "my open
-- actions"; "recently updated" on the dashboards.
CREATE INDEX "ActionTaken_ticketId_actionAt_id_idx" ON "ActionTaken"("ticketId", "actionAt", "id");
CREATE INDEX "ActionTaken_assigneeId_status_idx" ON "ActionTaken"("assigneeId", "status");
CREATE INDEX "Ticket_updatedAt_idx" ON "Ticket"("updatedAt");

-- Restrict everywhere: Actions Taken are never deleted (BR-14) and must never
-- disappear with a parent Ticket or a user.
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_followUpClearedById_fkey" FOREIGN KEY ("followUpClearedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
