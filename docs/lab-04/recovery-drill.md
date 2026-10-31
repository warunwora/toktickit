# Lab 4 Backup and Recovery Drill

Executes the procedure in [specification.md](specification.md) §7.5 once, end to end, on a real copy
of the local database. The automated test REG-02 covers the same path on every build in a throwaway
schema; this drill adds the `pg_dump` backup and the full restore that a test cannot reasonably run.

- **Script:** [`server/prisma/recovery/drill.sh`](../../server/prisma/recovery/drill.sh) (run from `server/`)
- **Recovery script under test:** [`server/prisma/recovery/lab4_down.sql`](../../server/prisma/recovery/lab4_down.sql)
- **Log of the recorded run:** [`artifacts/lab-04/recovery/drill.log`](../../artifacts/lab-04/recovery/drill.log)
- **Run:** 2026-10-31 04:15 UTC, PostgreSQL 16 (`toktickit-db` container), branch `feature/lab4-6-hardening`

## Safety

Every step after the backup runs on `toktickit_drill`, a database restored from that backup. The
development database `toktickit` is only read by `pg_dump`; the drill database and the dump file are
deleted at the end.

## Steps and results

"Lab 3 fingerprint" is an MD5 over every Ticket's id, number, status and summary, so a single changed,
missing or extra row would change it.

| # | Step | Users | Tickets | Attachments | Comments | Notes | Actions Taken | `Ticket.version` | Fingerprint |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `pg_dump -Fc` backup (69 KB) | — | — | — | — | — | — | — | — |
| 2 | Restore backup into the drill copy | 10 | 42 | 6 | 12 | 11 | 11 | present | `90cd1421…f533` |
| 3 | Apply `lab4_down.sql` | 10 | 42 | 6 | 12 | 11 | table gone | gone | `90cd1421…f533` |
| 4 | `prisma migrate deploy` again | 10 | 42 | 6 | 12 | 11 | table back, empty | present, every row ≥ 1 | `90cd1421…f533` |
| 5 | Full restore from the backup | 10 | 42 | 6 | 12 | 11 | 11 | present | `90cd1421…f533` |

Step 3 also removed the migration's row from `_prisma_migrations` ("lab4 migration recorded=false"),
which is why step 4 could apply it again.

## Conclusions

1. Reversing the Lab 4 migration loses only Lab 4 data — the 11 Actions Taken and the Ticket
   versions — and leaves every Lab 2 and Lab 3 row byte-for-byte unchanged (AC-39).
2. The migration can be re-applied after a reversal; legacy Tickets come back with version 1 and no
   invented actions (BR-43).
3. A `pg_dump` taken before a risky change restores the whole database, Lab 4 data included.

## How to repeat it

```bash
cd server
bash prisma/recovery/drill.sh | tee ../artifacts/lab-04/recovery/drill.log
```
