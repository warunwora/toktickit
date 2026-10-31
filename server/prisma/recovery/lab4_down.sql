-- Lab 4 recovery — docs/lab-04/specification.md §7.5 step 3.
--
-- Reverses 20261031090000_lab4_actions_taken without a restore. The migration
-- only added objects, so this loses only Lab 4 data (Actions Taken and Ticket
-- versions); every Lab 2 and Lab 3 row is untouched.
--
--   Take a backup first:  pg_dump -Fc toktickit > before_lab4_down.dump
--   Then run:             npx prisma db execute --file prisma/recovery/lab4_down.sql --schema prisma/schema.prisma
--
-- After running it, check out the Lab 3 code before starting the server.

DROP TABLE IF EXISTS "ActionTaken";
DROP TYPE IF EXISTS "ActionStatus";
DROP INDEX IF EXISTS "Ticket_updatedAt_idx";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "version";

-- Forget the migration so `prisma migrate deploy` can apply it again later.
-- Guarded, because a schema restored outside Prisma has no history table.
DO $$
BEGIN
  IF to_regclass('_prisma_migrations') IS NOT NULL THEN
    DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261031090000_lab4_actions_taken';
  END IF;
END
$$;
