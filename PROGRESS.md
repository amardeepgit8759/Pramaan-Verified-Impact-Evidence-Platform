# Progress

Checkpoints per phase of the plan (brief, Section 7). Some work landed before the plan
arrived; it's listed under the phase it belongs to.

## Phase 0 — Scaffold ✅

**Built**

- pnpm monorepo: `apps/api` (Express 5), `apps/web` (React 18 + Vite), `packages/shared`.
  TypeScript configs, ESLint (flat config) and Prettier at the root.
- Tailwind v4 + shadcn/ui (React 18 `forwardRef` versions), and a zod env loader that fails
  fast and lists every missing variable.
- Docker Compose: Postgres 17 + pgvector for dev (`:55432`) and a throwaway test database
  (`:55433`). `docker compose up` builds and runs the app at `http://localhost:3000`.
- Drizzle setup with migrations (the first one enables `pgvector`), which run automatically
  when the API boots.
- `GET /api/health` (database, pgvector, latency). The API serves the built web app with an
  SPA fallback, from one origin.
- One production Dockerfile. CI workflow (`.github/workflows/ci.yml`) running lint, typecheck,
  test, build and e2e against a pgvector service container.

**Tested**

- Gate: `docker compose up --build` → container healthy, `localhost:3000/api/health` returns
  `ok` with pgvector enabled, and the landing page and deep links return 200. The health
  integration test passes.
- `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.

**Known issues**

- `docker compose up` needs Cloudinary and Gemini keys in `.env` (the API refuses to start
  without them). The gate was checked with placeholder values in a throwaway override file.
- pnpm prints a harmless "Ignored build scripts" notice for `@google/genai` and `protobufjs`.

## Phase 1 — Auth, orgs, projects, sites, settings (in progress)

**Built so far**

- Auth API:
  - sign-up (creates the organisation, seeds its settings from `defaults.ts`, makes the user
    admin), sign-in, sign-out, `me`
  - invites with one-time password-set links
  - role guards, a stricter auth rate limit, and JSON-only writes
- Projects API: list with live counts, get, create.
- Design system and app shell:
  - tokens for both themes, fonts, and the dark-mode toggle
  - shadcn/ui primitives, `BandBadge`, `TrustBar`, `SdgChip`, `EmptyState`
- Pages: landing, sign-in, sign-up, set-password, dashboard, and projects with the create
  dialog.

**Tested so far**

- API integration tests for auth, roles, tenancy, project counts and public stats.
- Web route tests.
- e2e: sign up, create a project, sign out, sign back in.

## Phase 2 groundwork (done ahead of the phase)

- Drizzle schema for all 12 tables, with the requested indexes (HNSW on
  `embedding vector(768)`).
- `computeTrustScore` and the helpers in `packages/shared`: EXIF GPS and date parsing,
  haversine, pHash/Hamming, eligibility, gap status. 136 unit tests with 100% coverage
  enforced.
- Near/exact duplicate search in SQL (`bit_count(phash # $1)`), tested against Postgres.
