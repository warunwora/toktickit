-- Lab 3 — docs/lab-03/specification.md §7.4.
--
-- This migration is hand-written. The generated version wanted to DROP the
-- RequesterUser table and re-create it as User, which would have destroyed
-- every Requester and orphaned 24 tickets and 7 attachments. Renaming in place
-- keeps every foreign key valid with no data movement (BR-58, decision D-06).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "RoleName" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');

-- The Lab 2 enum held NEW only; the operational lifecycle is added, so the
-- existing rows keep their value and no row is rewritten (BR-33).
ALTER TYPE "TicketStatus" ADD VALUE 'OPEN';
ALTER TYPE "TicketStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "TicketStatus" ADD VALUE 'WAITING_FOR_REQUESTER';
ALTER TYPE "TicketStatus" ADD VALUE 'RESOLVED';
ALTER TYPE "TicketStatus" ADD VALUE 'CLOSED';
ALTER TYPE "TicketStatus" ADD VALUE 'REOPENED';
ALTER TYPE "TicketStatus" ADD VALUE 'CANCELLED';

-- ---------------------------------------------------------------------------
-- RequesterUser becomes User, in place
-- ---------------------------------------------------------------------------

ALTER TABLE "RequesterUser" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "RequesterUser_pkey" TO "User_pkey";
ALTER INDEX "RequesterUser_email_key" RENAME TO "User_email_key";
ALTER SEQUENCE "RequesterUser_id_seq" RENAME TO "User_id_seq";

-- Every migrated Requester receives the documented local development password
-- and must change it at the next login, so no account exists without
-- credentials (BR-59). The default is dropped immediately afterwards so a new
-- row can never be created without an explicit hash.
ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '$2a$10$5vE0yf3xJZvpTjX7/5CpTuL06SkUHtKn4czSK60SD/35qsmVcNY9i',
  ADD COLUMN "role" "RoleName" NOT NULL DEFAULT 'REQUESTER',
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP DEFAULT;

CREATE INDEX "User_role_name_idx" ON "User"("role", "name");

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ticket workflow fields
-- ---------------------------------------------------------------------------

ALTER TABLE "Ticket"
  ADD COLUMN "ownerId" INTEGER,
  ADD COLUMN "itPriority" "Priority",
  ADD COLUMN "resolutionSummary" TEXT,
  ADD COLUMN "requesterResolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3);

-- IT Priority starts as a copy of the Requested Priority (BR-31, BR-60), so
-- the queue can sort one comparable column for every ticket.
UPDATE "Ticket" SET "itPriority" = "requestedPriority";
ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;

CREATE INDEX "Ticket_status_createdAt_idx" ON "Ticket"("status", "createdAt");
CREATE INDEX "Ticket_ownerId_status_idx" ON "Ticket"("ownerId", "status");
CREATE INDEX "Ticket_itPriority_createdAt_idx" ON "Ticket"("itPriority", "createdAt");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Attachment columns now reference the real User model
-- ---------------------------------------------------------------------------

ALTER TABLE "Attachment" RENAME COLUMN "uploadedByRequesterId" TO "uploadedByUserId";
ALTER TABLE "Attachment" RENAME COLUMN "removedByRequesterId" TO "removedByUserId";
ALTER TABLE "Attachment" RENAME CONSTRAINT "Attachment_uploadedByRequesterId_fkey" TO "Attachment_uploadedByUserId_fkey";
ALTER TABLE "Attachment" RENAME CONSTRAINT "Attachment_removedByRequesterId_fkey" TO "Attachment_removedByUserId_fkey";

-- ---------------------------------------------------------------------------
-- Ticket conversation — append only (BR-43)
-- ---------------------------------------------------------------------------

CREATE TABLE "PublicComment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicComment_ticketId_createdAt_idx" ON "PublicComment"("ticketId", "createdAt");

CREATE TABLE "InternalNote" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InternalNote_ticketId_createdAt_idx" ON "InternalNote"("ticketId", "createdAt");

ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
