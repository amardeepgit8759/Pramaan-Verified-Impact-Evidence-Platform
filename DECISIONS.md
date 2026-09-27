# Decisions

Choices made without asking, per the working agreement ("ask only for credentials").
Newest at the bottom. Each entry says what was decided and why, so it can be revisited.

## Scaffold (2026-09-27)

### Runtime and tooling

- **Node 22 LTS instead of Node 20.** Node 20 reached end-of-life on 2026-04-30 and no longer
  gets security fixes, which is not acceptable for a public server. Current tooling has also
  dropped it (Vitest 5 needs Node ≥ 22.12). The code has nothing Node-22-specific beyond
  `process.loadEnvFile`; the Docker base image is `node:22-slim` and `.nvmrc` says 22.
- **pnpm 10.34.5**, installed with `npm i -g` because `corepack enable` can't write to
  `C:\Program Files\nodejs` without admin rights. Pinned via `packageManager`.
- **TypeScript 5.9, not 7.** typescript-eslint 8 only supports TypeScript `<6.1`.
- **ESLint 10 flat config** at the root, one config for the whole monorepo; Prettier for format.

### Frontend (React 18 is fixed by the spec, which drives several version picks)

- **React Router 7**, not 8: React Router 8 requires React ≥ 19.2.
- **react-leaflet 4**, not 5: react-leaflet 5 requires React 19.
- **shadcn/ui components are written by hand in their `React.forwardRef` form.** The current
  shadcn CLI generates React 19 components (ref as a prop, no `forwardRef`), which silently
  drop refs on React 18 and break Radix `asChild` triggers. Styling, tokens and `data-slot`
  attributes follow current shadcn/ui on Tailwind CSS v4.
- **Framer Motion 13** (`framer-motion` package), lucide-react, Recharts 3 — all support React 18.
- **Vite 8** with a dev proxy for `/api`, so dev is same-origin like production (cookies and SSE
  need no CORS).

### Backend

- **Express 5**, zod 4, pino + pino-http (request logs trimmed to method/url/status; cookies and
  auth headers redacted), helmet with a CSP that allows Cloudinary media/uploads and OpenStreetMap
  tiles, express-rate-limit (300 requests/min per IP on `/api`, both configurable by env).
- **Env validation fails fast** with every missing/invalid variable listed at once.
  Gemini model names are **required** env vars with no code defaults, so the only place a model
  id lives is `.env` (current ids are pre-filled in `.env.example`).
- **`packages/shared` ships TypeScript source.** Vite and Vitest consume it directly; the API
  production build bundles it with tsup (`noExternal`), so there's no separate build step.
- **Migrations run on API boot** before the server listens. Render runs a single instance, so
  there's no race, and deploys can't forget to migrate. `pnpm db:migrate` exists for manual runs.
- **Drizzle ORM 0.45 / drizzle-kit 0.31** (latest stable; 1.0 is still a release candidate).
  The first migration only enables `pgvector`; tables arrive with the phases that need them.

### Database

- **Postgres 17** (`pgvector/pgvector:pg17`), matching Neon's default major version.
- **Local ports 55432 (dev) and 55433 (test)**, overridable with `PRAMAAN_DB_PORT` /
  `PRAMAAN_TEST_DB_PORT`. 5432–5434 were already taken by other projects' containers here.
- **Dev API port 8787** (default in the env schema and `.env.example`). Port 8080 is taken by a
  local Java service. The Docker image sets `PORT=8080`; Render injects its own `PORT`.
- **Integration tests use a throwaway tmpfs database** (`db-test`) and run files serially,
  since they share it.

### AI (Gemini)

Checked against https://ai.google.dev/gemini-api/docs/models on 2026-09-27:

- Vision captioning/tagging: `gemini-3.5-flash` (stable).
- Report generation: `gemini-3.8-flash` (stable; Gemini 3.1 Pro is still preview-only).
- Embeddings: `gemini-embedding-2` (stable) at **768 dimensions**. pgvector's HNSW index only
  supports up to 2,000 dimensions, and 768 is one of Google's recommended sizes; Embedding 2
  re-normalizes truncated vectors itself.

### Trust Score model (in `packages/shared`)

- **Score = 100 − the configured penalty for each failed check**, floored at 0. Every check
  appears in the breakdown with its penalty, so the UI can show exactly why an asset scored
  what it did.
- **Bands:** `verified` at or above the verified cut-off, `review` at or above the review
  cut-off, otherwise `flagged`. The schema rejects a verified cut-off that isn't above review.
- **Two extra settings** beyond those the brief lists, because the checks can't run without
  them: `gpsRadiusMeters` (how far from the site counts as the wrong location) and
  `captureDateToleranceDays` (how far outside the project timeline counts as the wrong date).
  Both live in the same per-org settings and are editable.
