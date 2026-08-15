# TokTickIT — Lab 1

IT service desk vertical slice: React + TypeScript + Vite + Bootstrap → Express + TypeScript → Prisma → PostgreSQL.

Opening the app shows the app name and a `[Check System]` button. Clicking it calls the API for a health
check and the request categories stored in PostgreSQL, then shows `System Status: Online` plus the four
supported categories — or an `Offline` error message when the backend or database is unavailable.

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
   cd server && npm install
   cd ../client && npm install
   ```

4. Migrate and seed the database

   ```bash
   cd server
   npx prisma migrate dev --name init
   npm run prisma:seed
   ```

5. Run the app (two terminals)

   ```bash
   cd server && npm run dev     # http://localhost:3000
   cd client && npm run dev     # http://localhost:5173
   ```

## Tests

```bash
cd server && npm test
cd client && npm test
```

## API

| Method | Path | Response |
|---|---|---|
| GET | `/api/health` | `{ "status": "ok", "service": "TokTickIT API" }` |
| GET | `/api/categories` | `[ { "id": 1, "name": "Account and Access" }, ... ]` |

## Project structure

```
toktickit/
├── client/            React + Vite + Bootstrap frontend
├── server/
│   ├── prisma/        schema.prisma, migrations, seed.ts
│   ├── src/           Express app and routes
│   └── tests/lab-01/  Supertest API tests
├── docs/lab-01/       tests.md, reviewer.md, ai_use.md
├── .gitignore
└── README.md
```

## Git workflow

`feature/*` → PR → `lab1-staging` → PR → `main`. No direct commits to `main` or `lab1-staging`.
Every PR is peer reviewed; `.env` and `node_modules/` are never committed.
