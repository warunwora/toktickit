# TokTickIT

IT service desk application: React + TypeScript + Vite + Bootstrap → Express + TypeScript → Prisma →
PostgreSQL.

| Lab | Increment | Documentation |
|---|---|---|
| Lab 1 | Full-stack vertical slice: health check and the seeded request categories | [docs/lab-01](docs/lab-01) |
| Lab 2 | Requester ticketing MVP: Development Requester context, Create Ticket, My Tickets, Ticket Detail, attachments, Zen Green UI | [docs/lab-02](docs/lab-02) |

**Lab 2 engineering contract:** [specification.md](docs/lab-02/specification.md) ·
[api-spec.md](docs/lab-02/api-spec.md) · [ui-spec.md](docs/lab-02/ui-spec.md) ·
[tests.md](docs/lab-02/tests.md)

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

   The seed is idempotent and inserts 4 categories, 7 related systems, 4 active Development
   Requesters and 1 inactive one.

5. Run the app (two terminals)

   ```bash
   cd server && npm run dev     # http://localhost:3000
   cd client && npm run dev     # http://localhost:5173
   ```

Opening the app shows the **Development Requester Selection** screen. It is a Lab 2 testing
mechanism, not a login: pick a seeded Requester and every ticket screen then works in that identity.
Authentication arrives in Lab 3.

## Tests

```bash
cd server && npm test        # unit + API (needs the database migrated and seeded)
cd client && npm test        # UI component + UI style
npx playwright test          # responsive + end-to-end (starts both servers itself)
npx playwright show-report   # the HTML report of the last run
```

140 automated tests: 73 server, 57 client, 10 Playwright. Results and the acceptance-criterion
traceability matrix are in [docs/lab-02/tests.md](docs/lab-02/tests.md).

## API

Identity travels in the `X-Requester-Id` header — the Lab 2 testing mechanism, replaced by real
authentication in Lab 3. Full contract: [api-spec.md](docs/lab-02/api-spec.md).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Service health check |
| GET | `/api/categories` | Active ticket categories |
| GET | `/api/related-systems` | Active related systems |
| GET | `/api/requesters` | Active Development Requesters |
| POST | `/api/tickets` | Create one validated ticket |
| GET | `/api/tickets` | The selected Requester's tickets — search, filter, sort, paginate |
| GET | `/api/tickets/:id` | One owned ticket with its attachments |
| POST | `/api/tickets/:id/attachments` | Upload one permitted attachment |
| GET | `/api/tickets/:id/attachments` | Attachment metadata for one owned ticket |
| GET | `/api/attachments/:id/download` | Download an active attachment |
| PATCH | `/api/attachments/:id/remove` | Soft-remove an attachment with a reason |

## Project structure

```
toktickit/
├── client/                 React + Vite + Bootstrap frontend
│   ├── src/                api/, components/, context/, pages/, styles/
│   └── tests/lab-01, lab-02
├── server/
│   ├── prisma/             schema.prisma, migrations, seed.ts
│   ├── src/                app.ts, lib/, routes/
│   ├── tests/lab-01, lab-02
│   └── uploads/            attachment storage (git-ignored)
├── e2e/lab-02/             Playwright end-to-end and responsive specs
├── artifacts/lab-02/       desktop, tablet and mobile screenshots
├── docs/lab-01, lab-02/    engineering contract, tests, reviewer, AI use
├── .gitignore
└── README.md
```

## Git workflow

`feature/*` → PR → `labN-staging` → PR → `main`. No direct commits to `main` or a staging branch;
every PR is peer reviewed. `.env`, `node_modules/` and uploaded attachments are never committed.
