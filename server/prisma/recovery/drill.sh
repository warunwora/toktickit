#!/usr/bin/env bash
# Lab 4 backup-and-recovery drill — docs/lab-04/specification.md §7.5,
# recorded in docs/lab-04/recovery-drill.md.
#
# Runs entirely on a throwaway copy ("toktickit_drill") of the local database,
# so the development database is never changed. Needs the toktickit-db Docker
# container from the README. Usage, from server/:  bash prisma/recovery/drill.sh
set -euo pipefail

CONTAINER="${CONTAINER:-toktickit-db}"
DB_USER="${DB_USER:-toktickit}"
SOURCE_DB="${SOURCE_DB:-toktickit}"
DRILL_DB="toktickit_drill"
BACKUP="/tmp/${SOURCE_DB}_before_lab4_down.dump"

psql_drill() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -qtAU "$DB_USER" -d "$DRILL_DB" "$@"; }
step() { printf '\n== %s\n' "$1"; }

counts() {
  psql_drill -c "SELECT 'users=' || (SELECT count(*) FROM \"User\")
    || ' tickets=' || (SELECT count(*) FROM \"Ticket\")
    || ' attachments=' || (SELECT count(*) FROM \"Attachment\")
    || ' comments=' || (SELECT count(*) FROM \"PublicComment\")
    || ' notes=' || (SELECT count(*) FROM \"InternalNote\")"
  psql_drill -c "SELECT 'actionTaken table=' || (to_regclass('\"ActionTaken\"') IS NOT NULL)
    || ' ticket.version column=' || EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'Ticket' AND column_name = 'version')
    || ' lab4 migration recorded=' || EXISTS (SELECT 1 FROM \"_prisma_migrations\"
         WHERE migration_name = '20261031090000_lab4_actions_taken' AND finished_at IS NOT NULL)"
  psql_drill -c "SELECT 'lab3 fingerprint=' || md5(string_agg(id || ticket_number || status || summary, ',' ORDER BY id))
    FROM (SELECT id, \"ticketNumber\" AS ticket_number, status::text AS status, summary FROM \"Ticket\") t"
}

copy_from_backup() {
  docker exec "$CONTAINER" dropdb -U "$DB_USER" --if-exists "$DRILL_DB"
  docker exec "$CONTAINER" createdb -U "$DB_USER" "$DRILL_DB"
  docker exec "$CONTAINER" pg_restore -U "$DB_USER" -d "$DRILL_DB" --no-owner "$BACKUP"
}

step "1. Back up the database with pg_dump (custom format)"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -Fc -f "$BACKUP" "$SOURCE_DB"
docker exec "$CONTAINER" ls -l "$BACKUP"

step "2. Restore the backup into a throwaway copy and record the starting point"
copy_from_backup
counts
psql_drill -c "SELECT 'actions=' || count(*) FROM \"ActionTaken\""

step "3. Reverse the Lab 4 migration with prisma/recovery/lab4_down.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -qU "$DB_USER" -d "$DRILL_DB" < prisma/recovery/lab4_down.sql
counts

step "4. Re-apply the Lab 4 migration with prisma migrate deploy"
DRILL_URL="$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed "s#/${SOURCE_DB}?#/${DRILL_DB}?#")"
DATABASE_URL="$DRILL_URL" npx prisma migrate deploy 2>&1 | grep -E "Applying|applied|No pending"
counts
psql_drill -c "SELECT 'tickets below version 1=' || count(*) FROM \"Ticket\" WHERE version < 1"

step "5. Full restore from the pg_dump backup"
copy_from_backup
counts
psql_drill -c "SELECT 'actions=' || count(*) FROM \"ActionTaken\""

step "6. Clean up"
docker exec "$CONTAINER" dropdb -U "$DB_USER" "$DRILL_DB"
docker exec "$CONTAINER" rm -f "$BACKUP"
echo "drill database dropped; development database untouched"
