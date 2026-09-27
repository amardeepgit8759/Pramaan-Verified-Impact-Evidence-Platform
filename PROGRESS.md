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

## Phase 2 — Ingestion, Cloudinary, Trust Score (built; live check pending keys)

### Built

- `POST /api/uploads/signature` (admin, field). It signs a direct browser upload to
  Cloudinary's `/auto/upload`. The signed params fix the folder (`pramaan/{orgId}/{projectId}`,
  or `asset_folder` + `public_id_prefix` on dynamic-folder accounts), the context (org,
  project, site, uploader), `phash`, `media_metadata`, the allowed formats and the timestamp.
- `POST /api/assets/confirm`, the Section 5.1 pipeline:
  - checks the upload is in the caller's org/project folder, then re-fetches it from the
    Admin API (etag, pHash, size, format, `media_metadata`, created time)
  - parses EXIF capture time and GPS from flat, prefixed or grouped keys, plus video
    location tags
  - auto-assigns the nearest site whose radius contains the GPS
  - tags with the Cloudinary add-on, falling back to a Gemini caption and 5–15 tags
    (provider stored, logged and returned)
  - embeds caption + tags + project + site + date with Gemini
  - runs the Trust Score, stores the asset and its six checks, logs `asset.created`, then
    re-scores every duplicate it matches (`asset.rescored`)
  - writes project, site and score back to the Cloudinary asset as context, best-effort
- Confirming is idempotent: the same upload returns the same asset.
- `GET /api/assets/:id` (detail with checks and EXIF sources) and
  `GET /api/projects/:id/assets` (filters: site, band, tag, capture-date range).
- Web: an Evidence tab with a drag-and-drop and phone-camera uploader (`capture`),
  per-file progress through sign → upload → verify, a live score reveal, retry on failure,
  and an evidence grid with band badges and alt text from captions or tags.

### Tested

- Unit (shared, 100% coverage): the capture-data extractor (flat, prefixed and nested EXIF;
  QuickTime and ISO 6709 video locations; fallbacks; 0,0 as no fix), embedding text, plus
  every earlier test (every trust check, clamping, bands, custom weights, haversine,
  Hamming, EXIF parser in both formats).
- API integration (16 new tests, Cloudinary and Gemini faked at the service boundary,
  real Postgres):
  - signing: folder and context; viewers refused; other orgs refused
  - the full happy path
  - Gemini fallback when the add-on errors or finds nothing, and `TAGGING_PROVIDER=gemini`
  - both AI calls failing
  - no-EXIF, "unverified" wording
  - off-site photo (far deduction)
  - exact copy across projects re-scoring the earlier upload, with events
  - near-copy at distance 3/64
  - idempotency
  - uploads outside the project folder, missing files, viewers, and foreign sites
  - org isolation and list filters
- Web: the uploader signs, sends the file with the signed params untouched, confirms and
  reveals the score; shows failures with retry; is hidden from viewers.
- `pnpm test:live` exists. It generates a real JPEG with EXIF GPS and date, uploads it with
  a signature exactly like the browser, checks etag, pHash and parsed EXIF from the Admin
  API, tries the tagging add-on, fetches a delivery URL, writes context, captions and embeds
  with Gemini, then deletes the file.

### Known issues

- **Not yet run against real Cloudinary or Gemini:** `.env` has no keys yet. `pnpm test:live`
  stops at startup with the list of missing keys. Two things only a live run can confirm:
  the exact key layout of `media_metadata` (the parser accepts every layout I know of, and
  the live test prints the real keys), and that the configured Gemini models answer.
- No e2e upload yet. That needs real keys and arrives with Phase 3's two-context
  Playwright test.
