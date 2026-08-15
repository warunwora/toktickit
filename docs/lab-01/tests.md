# Lab 1 — Test Plan and Evidence

All test files live under `server/tests/lab-01/` and `client/tests/lab-01/`.

| Test | File (`tests/lab-01/`) | Tool | Test description | Result |
|---|---|---|---|---|
| API-01 | `server/tests/lab-01/health.test.ts` | Supertest | `GET /api/health` returns 200 and `{ status: "ok", service: "TokTickIT API" }` | Pass |
| API-02 | `server/tests/lab-01/categories.test.ts` | Supertest | `GET /api/categories` returns the four seeded categories in id order, each with `id` and `name` | Pass |
| UI-01 | `client/tests/lab-01/App.test.tsx` | Vitest | TokTickIT heading renders | Pass |
| UI-02 | `client/tests/lab-01/App.test.tsx` | Vitest | Loading state ("loading" text, button disabled) changes to `Online` + the category list | Pass |
| UI-03 | `client/tests/lab-01/App.test.tsx` | Vitest | API failure displays `Offline` and `Unable to connect to TokTickIT API` | Pass |

## How to run

```bash
cd server && npm test     # API-01, API-02 (requires the DB migrated and seeded)
cd client && npm test     # UI-01, UI-02, UI-03
```

## Passing output (main branch)

```
> toktickit-server@1.0.0 test
> vitest run

 RUN  v2.1.9 .../toktickit/server

 ✓ tests/lab-01/health.test.ts (1 test) 14ms
 ✓ tests/lab-01/categories.test.ts (1 test) 106ms

 Test Files  2 passed (2)
      Tests  2 passed (2)
```

```
> toktickit-client@1.0.0 test
> vitest run

 RUN  v2.1.9 .../toktickit/client

 ✓ tests/lab-01/App.test.tsx (3 tests) 112ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

> Replace the two blocks above with the terminal output captured on `main` after the release PR is
> merged, and attach the screenshot of the same run.

## Notes

- API-02 reads the real PostgreSQL database through Prisma. Run `npx prisma migrate dev` and
  `npm run prisma:seed` before the server tests.
- UI-02 holds the mocked `checkSystem()` promise open so the loading state is asserted
  deterministically before the resolved category list replaces it.
- UI-03 mocks a rejected `checkSystem()`; the same path is what the browser shows when the database
  container is stopped (verified manually with `docker stop toktickit-db`).
