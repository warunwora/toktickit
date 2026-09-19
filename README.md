# TokTickIT

IT service desk application: React + TypeScript + Vite + Bootstrap → Express + TypeScript → Prisma →
PostgreSQL.

| Lab | Increment | Documentation |
|---|---|---|
| Lab 1 | Full-stack vertical slice: health check and the seeded request categories | [docs/lab-01](docs/lab-01) |
| Lab 2 | Requester ticketing MVP: Development Requester context, Create Ticket, My Tickets, Ticket Detail, attachments, Zen Green UI | [docs/lab-02](docs/lab-02) |
| Lab 3 | Real users and roles: authentication, mandatory first-login password change, role-based authorization, IT Staff queue and ticket workflow, Public Comments and Internal Notes, Administrator user management | [docs/lab-03](docs/lab-03) |

**Lab 3 engineering contract:** [specification.md](docs/lab-03/specification.md) ·
[api-spec.md](docs/lab-03/api-spec.md) · [ui-spec.md](docs/lab-03/ui-spec.md) ·
[tests.md](docs/lab-03/tests.md) · [reviewer.md](docs/lab-03/reviewer.md) ·
[ai-use.md](docs/lab-03/ai-use.md)

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
current user is whoever is signed in.

### Local development accounts

Every seeded account uses the password **`ChangeMe!2026`**. These are local development credentials
only, documented here as the handout requires; no real secret is committed.

| Role | Email | Note |
|---|---|---|
| Requester | `napat.sri@kmutt.ac.th` | Owns seeded tickets |
| Requester | `chanya.pho@kmutt.ac.th` | A second requester, for the isolation checks |
| Requester | `kittisak.boo@kmutt.ac.th` | Still on its initial password — signs in to the change-password screen |
| IT Staff | `warin.cha@kmutt.ac.th` | Queue, ticket detail, comments and notes |
| Administrator | `anong.suk@kmutt.ac.th` | User management |
| Requester (inactive) | `anan.tep@kmutt.ac.th` | Shows the "account is not active" message |

## Tests

```bash
cd server && npm test        # unit + API (needs the database migrated and seeded)
cd client && npm test        # UI component + UI style
npx playwright test          # responsive + end-to-end (starts both servers itself)
npx playwright show-report   # the HTML report of the last run
```

**420 automated tests: 244 server, 133 client, 43 Playwright.** 286 of them are Lab 3's own; the rest
are the Lab 1 and Lab 2 suites, kept as regression evidence. Results, the per-suite breakdown and the
acceptance-criterion traceability matrix are in [docs/lab-03/tests.md](docs/lab-03/tests.md).

The Playwright run cleans up after itself: the end-to-end suites create throwaway accounts through
the Administrator API, and a global teardown removes them, because the product deactivates rather
than deletes users.

## API

Identity travels in an HTTP-only session cookie; the `X-Requester-Id` header and `GET /api/requesters`
are gone (BR-61). Full contract, including the authorization matrix:
[api-spec.md](docs/lab-03/api-spec.md).

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Service health check |
| POST | `/api/auth/login` | public | Sign in and receive the session cookie |
| POST | `/api/auth/logout` | any | Destroy the session server-side |
| GET | `/api/auth/me` | any | The authenticated user and role |
| POST | `/api/auth/password` | any | Change your own password |
| GET | `/api/categories`, `/api/related-systems` | any | Reference data |
| POST/GET | `/api/tickets` | Requester | Create a ticket; list your own |
| GET | `/api/tickets/:id` | Requester (own) | One owned ticket with its attachments |
| POST/GET | `/api/tickets/:id/attachments` | Requester (own) | Upload and list attachments |
| GET | `/api/attachments/:id/download` | Requester (own), IT Staff, Administrator | Download an active attachment |
| PATCH | `/api/attachments/:id/remove` | Requester (own) | Soft-remove an attachment with a reason |
| GET/POST | `/api/tickets/:id/comments` | Requester (own), IT Staff, Administrator | Public Comments |
| POST | `/api/tickets/:id/problem-resolved` | Requester (own) | Indicate the problem appears resolved |
| GET/POST | `/api/tickets/:id/notes` | IT Staff, Administrator | Internal Notes — a Requester receives 404 |
| GET | `/api/staff/tickets` | IT Staff, Administrator | The queue: search, filter, sort, paginate |
| GET | `/api/staff/tickets/:id` | IT Staff, Administrator | One ticket with attachments, comments and notes |
| GET | `/api/staff/assignable-users` | IT Staff, Administrator | Active IT Staff, for the Owner select |
| PATCH | `/api/staff/tickets/:id/owner` | IT Staff | Claim, assign, reassign or release ownership |
| PATCH | `/api/staff/tickets/:id` | IT Staff | IT Priority, status and resolution summary |
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
│   └── tests/lab-01, lab-02, lab-03
├── server/
│   ├── prisma/             schema.prisma, migrations, seed.ts
│   ├── scripts/            e2e-cleanup.ts
│   ├── src/                app.ts, lib/, routes/
│   ├── tests/lab-01, lab-02, lab-03
│   └── uploads/            attachment storage (git-ignored)
├── e2e/
│   ├── helpers/            shared sign-in helpers
│   ├── lab-02/             Lab 2 specs, kept as regression evidence
│   └── lab-03/             authentication, staff-ticket-flow, user-administration, responsive
├── artifacts/lab-02, lab-03/   desktop, tablet and mobile screenshots
├── docs/lab-01, lab-02, lab-03/  engineering contract, tests, reviewer, AI use
├── .gitignore
└── README.md
```

## Git workflow

`feature/*` → PR → `labN-staging` → PR → `main`. No direct commits to `main` or a staging branch;
every PR is peer reviewed. `.env`, `node_modules/` and uploaded attachments are never committed.
