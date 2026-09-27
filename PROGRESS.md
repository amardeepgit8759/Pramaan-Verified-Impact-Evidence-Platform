# Progress

## Scaffold (before Phase 1) — 2026-09-27

**Built**

- pnpm monorepo: `apps/api` (Express 5), `apps/web` (React 18 + Vite), `packages/shared`
  (zod schemas, default org settings, Trust Score calculation).
- API: zod-validated env that fails fast, pino logging, helmet CSP, rate limiting, JSON errors,
  Drizzle + pg client, migrations on boot (first one enables pgvector), `GET /api/health`
  reporting DB connectivity, pgvector and latency. Serves the built web app with an SPA
  fallback when `WEB_DIST_DIR` is set.
- Web: Tailwind v4 with shadcn/ui tokens, Button and Card (React 18 `forwardRef` versions),
  React Router, TanStack Query with centralised query keys, a typed `apiGet` that validates
  responses with the shared schemas, a home page with live system status, and 404/error pages.
- Docker Compose (Postgres + pgvector for dev and tests, plus the full app under the `full`
  profile) and a single production Dockerfile.

**Tested**

- `pnpm lint`, `pnpm typecheck` and `pnpm test` all pass: 10 shared unit tests, 5 API unit
  tests, 3 API integration tests against real Postgres, and 3 web component tests.
- `pnpm e2e` (Playwright, production build served by the API): 2 passing.
- Manual: `docker build` succeeds. The container with no env prints every missing variable and
  exits 1. With env it migrates, serves `/api/health` (ok, pgvector enabled), the SPA, deep
  links and JSON 404s, and serves `/assets` as immutable. `pnpm dev` works through the Vite
  proxy.

**Known issues**

- Cloudinary and Gemini credentials aren't in `.env` yet, so `pnpm dev` and `pnpm e2e` exit at
  startup with the missing-variable list until they're added. That's intended.
- pnpm still prints an "Ignored build scripts" notice for `@google/genai` and `protobufjs`.
  Both scripts are no-ops or version notices, so nothing breaks; the notice is cosmetic.
