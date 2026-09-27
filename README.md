# Pramaan

Pramaan (Hindi for "proof") is a verified impact-evidence platform for NGOs, CSR teams and
funders. Field staff upload photos and videos, Pramaan checks each one and gives it a
transparent Trust Score, and every sentence in a generated impact report links back to the
verified assets it relies on.

## Requirements

- Node 22 (`.nvmrc`) and pnpm 10 (`npm i -g pnpm@10`)
- Docker Desktop, for local Postgres + pgvector

## Getting started

```sh
pnpm install
cp .env.example .env        # then fill in Cloudinary, Gemini and JWT_SECRET
pnpm db:up                  # Postgres on :55432 (dev) and :55433 (tests)
pnpm dev                    # API on :8787, web on http://localhost:5173
```

The API refuses to start if any required variable is missing, and lists them all.
Migrations run automatically when the API starts; `pnpm db:migrate` runs them by hand.

## Scripts

| Command                        | What it does                                                       |
| ------------------------------ | ------------------------------------------------------------------ |
| `pnpm dev`                     | API (tsx watch) and web (Vite) together                            |
| `pnpm lint` / `pnpm typecheck` | ESLint and `tsc` across the workspace                              |
| `pnpm test`                    | Vitest: unit tests plus API integration tests (needs `pnpm db:up`) |
| `pnpm build` then `pnpm e2e`   | Playwright against the production build                            |
| `pnpm db:generate`             | Generate a Drizzle migration from `apps/api/src/db/schema.ts`      |
| `docker compose up --build`    | The production image + database at http://localhost:3000           |

## Layout

```
apps/api         Express API; also serves the built web app in production
apps/web         React 18 + Vite frontend
packages/shared  zod schemas, types, default settings, Trust Score maths
```

## Deploying

One Docker image (see `Dockerfile`) runs on Render with Neon Postgres. The API serves the web
app from the same origin, so cookies and Server-Sent Events need no CORS. Set the variables
from `.env.example` in Render, with `DATABASE_URL` pointing at Neon (`?sslmode=require`).

See `DECISIONS.md` for why things are the way they are, and `PROGRESS.md` for status.
