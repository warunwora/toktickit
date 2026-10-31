# TokTickIT

IT service desk application: React + TypeScript + Vite + Bootstrap → Express + TypeScript → Prisma →
PostgreSQL.

| Lab | Increment | Documentation |
|---|---|---|
| Lab 1 | Full-stack vertical slice: health check and the seeded request categories | [docs/lab-01](docs/lab-01) |
| Lab 2 | Requester ticketing MVP: Development Requester context, Create Ticket, My Tickets, Ticket Detail, attachments, Zen Green UI | [docs/lab-02](docs/lab-02) |
| Lab 3 | Real users and roles: authentication, mandatory first-login password change, role-based authorization, IT Staff queue and ticket workflow, Public Comments and Internal Notes, Administrator user management | [docs/lab-03](docs/lab-03) |
| Lab 4 | Actions Taken on every ticket, the resolution gate, stale-update protection, Administrators operating like IT Staff, role dashboards with drill-down, final hardening and a recorded recovery drill | [docs/lab-04](docs/lab-04) |

**Lab 4 engineering contract:** [specification.md](docs/lab-04/specification.md) ·
[api-spec.md](docs/lab-04/api-spec.md) · [ui-spec.md](docs/lab-04/ui-spec.md) ·
[tests.md](docs/lab-04/tests.md) · [recovery-drill.md](docs/lab-04/recovery-drill.md) ·
[reviewer.md](docs/lab-04/reviewer.md) · [ai-use.md](docs/lab-04/ai-use.md)

## Requirements

- Node.js 20+
- Docker (or a local PostgreSQL 16)
- Git

## Setup

1. Start the database

   ```bash
   docker run -d --name toktickit-db \
     -e POSTGRES_USER=toktickit \
     -e POSTGRES_PASSWORD=toktickit \
     -e POSTGRES_DB=toktickit \
     -p 5432:5432 postgres:16
   ```

2. Copy the environment files

   ```bash
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   ```

3. Install dependencies

   ```bash
   npm install                      # Playwright, for the E2E and responsive suites
   cd server && npm install
   cd ../client && npm install
   npx playwright install chromium
   ```

4. Migrate and seed the database

   ```bash
   cd server
   npx prisma migrate dev
   npm run prisma:seed
   ```

   The seed is idempotent and inserts 4 categories, 7 related systems and 10 users: 4 active
   Requesters, 3 active IT Staff, 1 Administrator and 2 inactive accounts, together with a spread of
   tickets, comments and internal notes.

5. Run the app (two terminals)

   ```bash
   cd server && npm run dev     # http://localhost:3000
   cd client && npm run dev     # http://localhost:5173
   ```

Opening the app shows the **login screen**. The Development Requester selector is gone (BR-61): the
current user is whoever is signed in. After sign-in each role lands on its **Dashboard** (Lab 4).

`/system-check` is the Lab 1 diagnostic page (API and database round trip). It is linked from no
screen and needs no sign-in; open it by URL when checking a fresh setup.

### Local development accounts

Every seeded account uses the password **`ChangeMe!2026`**. These are local development credentials
only, documented here as the handout requires; no real secret is committed.

| Role | Email | Note |
|---|---|---|
| Requester | `napat.sri@kmutt.ac.th` | Owns seeded tickets |
| Requester | `chanya.pho@kmutt.ac.th` | A second requester, for the isolation checks |
| Requester | `kittisak.boo@kmutt.ac.th` | Still on its initial password — signs in to the change-password screen |
| IT Staff | `warin.cha@kmutt.ac.th` | Queue, ticket detail, Actions Taken, comments and notes |
| IT Staff | `pimchanok.rat@kmutt.ac.th` | A second IT Staff member, for actions assigned to someone else |
| IT Staff | `thanakrit.mee@kmutt.ac.th` | Has no open actions, to show a zero dashboard metric |
| Administrator | `anong.suk@kmutt.ac.th` | User management, and IT Staff work since Lab 4 |
| Requester (inactive) | `anan.tep@kmutt.ac.th` | Shows the "account is not active" message |

## Tests

```bash
cd server && npm test        # unit, API, workflow, dashboard, PERF, migration (needs the database migrated and seeded)
cd client && npm test        # UI component + UI style
npx playwright test          # responsive + end-to-end (starts both servers itself)
npx playwright show-report   # the HTML report of the last run
```

**582 automated tests: 332 server, 186 client, 64 Playwright.** 162 of them are Lab 4's own; the rest
are the Lab 1–3 suites, kept as regression evidence. Results, the per-suite breakdown and the
acceptance-criterion traceability matrix are in [docs/lab-04/tests.md](docs/lab-04/tests.md).

The Lab 4 migration only adds. `server/prisma/recovery/lab4_down.sql` reverses it, and
`server/prisma/recovery/drill.sh` runs the full backup, reverse, re-apply and restore drill on a copy
of the database — see [recovery-drill.md](docs/lab-04/recovery-drill.md).

The Playwright run cleans up after itself: the end-to-end suites create throwaway accounts through
the Administrator API, and a global teardown removes them, because the product deactivates rather
than deletes users.

## API

Identity travels in an HTTP-only session cookie; the `X-Requester-Id` header and `GET /api/requesters`
are gone (BR-61). Full contract, including the authorization matrix:
[Lab 3 api-spec.md](docs/lab-03/api-spec.md), extended by [Lab 4 api-spec.md](docs/lab-04/api-spec.md).

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Service health check |
| POST | `/api/auth/login` | public | Sign in and receive the session cookie |
| POST | `/api/auth/logout` | any | Destroy the session server-side |
| GET | `/api/auth/me` | any | The authenticated user and role |
| POST | `/api/auth/password` | any | Change your own password |
| GET | `/api/categories`, `/api/related-systems` | any | Reference data |
| POST/GET | `/api/tickets` | Requester | Create a ticket; list your own (`statusGroup=active` since Lab 4) |
| GET | `/api/tickets/:id` | Requester (own) | One owned ticket with its attachments |
| POST/GET | `/api/tickets/:id/attachments` | Requester (own) | Upload and list attachments |
| GET | `/api/attachments/:id/download` | Requester (own), IT Staff, Administrator | Download an active attachment |
| PATCH | `/api/attachments/:id/remove` | Requester (own) | Soft-remove an attachment with a reason |
| GET/POST | `/api/tickets/:id/comments` | Requester (own), IT Staff, Administrator | Public Comments |
| POST | `/api/tickets/:id/problem-resolved` | Requester (own) | Indicate the problem appears resolved |
| GET/POST | `/api/tickets/:id/notes` | IT Staff, Administrator | Internal Notes — a Requester receives 404 |
| GET | `/api/staff/tickets` | IT Staff, Administrator | The queue: search, filter (incl. `statusGroup=active`), sort, paginate |
| GET | `/api/staff/tickets/:id` | IT Staff, Administrator | One ticket with attachments, comments and notes |
| GET | `/api/staff/assignable-users` | IT Staff, Administrator | Active IT Staff and Administrators, for the Owner and assignee selects |
| PATCH | `/api/staff/tickets/:id/owner` | IT Staff, Administrator | Claim, assign, reassign or release ownership; needs `version` |
| PATCH | `/api/staff/tickets/:id` | IT Staff, Administrator | IT Priority, status, resolution summary; needs `version`; Resolved passes the resolution gate |
| GET | `/api/tickets/:id/actions` | Requester (own), IT Staff, Administrator | Actions Taken, oldest first |
| POST | `/api/tickets/:id/actions` | IT Staff, Administrator | Record an Action Taken |
| PATCH | `/api/actions/:id` | IT Staff, Administrator | Edit, start, complete or cancel an action; needs `version` |
| PATCH | `/api/actions/:id/follow-up` | IT Staff, Administrator | Mark a completed action's follow-up done |
| GET | `/api/dashboard/requester` | Requester | Own ticket metrics and recent lists |
| GET | `/api/dashboard/staff` | IT Staff, Administrator | Service desk metrics, my open actions; user counts for Administrators |
| GET/POST | `/api/admin/users` | Administrator | List and create users |
| PATCH | `/api/admin/users/:id` | Administrator | Name, email, role and activation state |
| POST | `/api/admin/users/:id/password` | Administrator | Set a new initial password |

Every protected operation is enforced in the backend. A hidden or disabled control is feedback, not
authorization.

## Project structure

```
toktickit/
├── client/                 React + Vite + Bootstrap frontend
│   ├── src/                api/, components/, context/, pages/, styles/
│   └── tests/lab-01 … lab-04
├── server/
│   ├── prisma/             schema.prisma, migrations, seed.ts, recovery/ (lab4_down.sql, drill.sh)
│   ├── scripts/            e2e-cleanup.ts
│   ├── src/                app.ts, lib/, routes/
│   ├── tests/lab-01 … lab-04
│   └── uploads/            attachment storage (git-ignored)
├── e2e/
│   ├── helpers/            shared sign-in and API setup helpers
│   ├── lab-02/, lab-03/    earlier specs, kept as regression evidence
│   └── lab-04/             actions-taken-flow, ticket-resolution, dashboards, responsive
├── artifacts/lab-02 … lab-04/  desktop, tablet and mobile screenshots; lab-04/recovery drill log
├── docs/lab-01 … lab-04/   engineering contract, tests, reviewer, AI use
├── .gitignore
└── README.md
```

## Git workflow

`feature/*` → PR → `labN-staging` → PR → `main`. No direct commits to `main` or a staging branch;
every PR is peer reviewed. `.env`, `node_modules/` and uploaded attachments are never committed.
