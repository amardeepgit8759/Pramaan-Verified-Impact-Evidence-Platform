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

## Domain model and core logic — 2026-09-27

**Built**

- Drizzle schema and migration for all 12 tables in Section 4, with the requested indexes:
  `(org_id)`, `(project_id, captured_at)`, `etag`, and HNSW (cosine) on `embedding vector(768)`.
- `packages/shared`:
  - `computeTrustScore`, with all six checks and plain-language reasons
  - settings schema and defaults matching Section 5.2
  - EXIF GPS parsing (decimal, DMS, degree-symbol, rational and GPSPosition forms) and EXIF date parsing
  - haversine distance and nearest-site auto-assignment
  - pHash conversion and Hamming distance
  - report eligibility and documentation-gap status
- API services: the near-duplicate / exact-duplicate candidate search in SQL, and org settings
  seeding and loading.

**Tested**

- Shared: 136 tests, with coverage enforced at **100%** for lines, branches, functions and
  statements.
- API: 18 tests, including 8 against real Postgres for the duplicate search (threshold,
  same-project exclusion, etag-only matching for videos, org isolation, excluding the asset
  itself, feeding `computeTrustScore`) and 2 for settings round-trips.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

**Known issues**

- Nothing runs this logic end to end yet. The upload/confirm pipeline, auth and the UI come
  with the phases.

## Design system, auth, landing and projects — 2026-09-27

**Built**

- Auth API:
  - sign-up (creates the organisation, seeds its settings, makes the user admin), sign-in,
    sign-out, `me`
  - admin-only team list and invites, with one-time password-set links
  - role guards, a stricter auth rate limit, and a JSON-only rule for writes
- Projects API (list with live site, file and band counts plus average trust; get; create for
  admins) and `GET /api/public/stats`.
- Design system:
  - tokens for both themes, Geist and Instrument Serif, and a no-flash dark mode toggle that
    follows the system setting
  - shadcn/ui primitives in React 18 form: Button, Card, Badge, Input, Textarea, Label,
    Dialog, DropdownMenu, Skeleton
  - `BandBadge`, `TrustBar`, `SdgChip`, `EmptyState` and accessible form fields
- Pages:
  - landing (hero, real stats strip hidden when empty, three steps, the six checks, CTA)
  - sign-in, sign-up and set-password
  - the app shell (sidebar on desktop, top bar and bottom tabs on phones, account menu with
    theme and sign-out)
  - dashboard and projects, with the create-project dialog and SDG picker
- Guards: `/app` sends signed-out visitors to sign-in and back again afterwards; sign-in and
  sign-up skip ahead when you're already signed in.

**Tested**

- `pnpm lint`, `pnpm typecheck` and `pnpm test` pass:
  - shared: 136 tests, 100% coverage
  - API: 39 tests, including 21 new ones against Postgres for sign-up, sign-in, sign-out,
    invites, roles, tenancy isolation, project counts and public stats
  - web: 11 component tests on the real route tree
- `pnpm e2e` (production build): landing leads to sign-up; an admin signs up, creates a
  project, signs out, is sent back to the page they wanted after signing in; and the 404 page.
- Manual: screenshots of the landing page (light desktop, dark 375px), sign-up, the empty
  dashboard, the create-project dialog, and projects (light, dark, 375px) were reviewed.
  Layout, contrast and the bottom tabs hold up at 375px.

**Known issues**

- Project cards aren't clickable yet. The project detail page (tabs) is the next piece of UI.
- The dashboard shows projects only. KPIs, charts, the activity feed and the review queue
  arrive with `/api/metrics` and SSE.
- Cloudinary and Gemini keys still aren't in `.env`, so uploads can't be built or tested
  end to end yet.
