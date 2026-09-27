# Progress

Checkpoints per phase of the plan (brief, Section 7). Some work landed before the plan
arrived; it's listed under the phase it belongs to.

## Phase 0 — Scaffold ✅

### Built

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

### Tested

- Gate: `docker compose up --build` → container healthy, `localhost:3000/api/health` returns
  `ok` with pgvector enabled, and the landing page and deep links return 200. The health
  integration test passes.
- `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.

### Known issues

- `docker compose up` needs Cloudinary and Gemini keys in `.env` (the API refuses to start
  without them). The gate was checked with placeholder values in a throwaway override file.
- pnpm prints a harmless "Ignored build scripts" notice for `@google/genai` and `protobufjs`.

## Phase 1 — Auth, orgs, projects, sites, settings ✅

### Built

- **Auth:**
  - sign-up creates the organisation, seeds its settings from `defaults.ts`, and makes the
    user admin
  - sign-in, sign-out, `me`; invites with one-time password-set links
  - role guards, a stricter auth rate limit, and JSON-only writes
- **Team:**
  - list and invite
  - change roles (the last admin can't be demoted)
  - remove, which deactivates and keeps the review history; admins can't remove themselves
  - re-inviting a removed member restores them
- **Organisation:** rename.
- **Projects:** full CRUD. Editing dates re-scores the project's evidence. Renaming or
  deleting a project re-scores evidence in other projects whose duplicate checks point at it.
- **Sites:** full CRUD. Moving, resizing or renaming a site re-scores its evidence. Deleting
  a site keeps its evidence, unassigned and re-scored.
- **Settings:** `GET` for everyone (transparency). `POST /preview` does a dry-run re-score
  ("N assets would change band"). `PUT` saves, re-scores every asset, and logs
  `settings.updated` plus `asset.rescored` events for SSE in Phase 3.
- **Re-scoring service:** runs the real Trust Score engine over stored assets for any scope
  (org, project, site, asset ids), with a dry-run mode.
- **UI:**
  - design system and app shell (sidebar on desktop, bottom tabs at 375px)
  - project detail page with Overview and Sites tabs, and edit/delete
  - site CRUD with a Leaflet + OpenStreetMap picker (click to place, "use my location",
    radius slider), a site map that fits all circles, and dark tiles in dark mode
  - Settings page: deduction sliders, band cut-offs, thresholds, a live debounced preview of
    band changes, save and re-score, restore defaults, the organisation name, and team
    management (invite link with copy, role select, remove)

### Tested

- API integration (58 tests against Postgres): auth, roles and tenancy for every route;
  project and site CRUD; settings preview (no writes), save (re-scores, stores checks, logs
  events) and validation; re-scoring when a site moves or is deleted, and when project dates
  change; duplicate reasons following a project rename or delete; team role and removal
  rules; organisation rename.
- Web component tests (18): project overview figures, 404 project, sites list with viewer
  permissions, site form validation, settings preview (posts the settled draft and shows
  "3 of 12 assets would change band"), band cut-off validation that blocks save, and
  read-only settings for viewers.
- e2e (production build): the admin creates a project, adds a site and edits the project,
  then invites a field teammate. The teammate sets a password through the link, sees the
  project and sites, and gets no admin controls.
- Manual: screenshots of the overview, sites (light, dark, 375px), site picker and settings.
  Found and fixed: circles not in brand colours (react-leaflet only applies `className` as
  a direct prop), and a misaligned slider label.

### Known issues

- The main JS bundle is about 750 kB minified (230 kB gzipped). Leaflet is already split out;
  routes get code-split during Phase 7's performance pass.
- Settings changes don't push live updates yet. The events are logged now and SSE delivers
  them in Phase 3.

## Phase 2 groundwork (done ahead of the phase)

- Drizzle schema for all 12 tables, with the requested indexes (HNSW on
  `embedding vector(768)`).
- `computeTrustScore` and the helpers in `packages/shared`: EXIF GPS and date parsing,
  haversine, pHash/Hamming, eligibility, gap status. 136 unit tests with 100% coverage
  enforced.
- Near/exact duplicate search in SQL (`bit_count(phash # $1)`), tested against Postgres.
