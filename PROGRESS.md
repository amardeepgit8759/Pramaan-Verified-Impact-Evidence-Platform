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

## Phase 3 — Real-time, metrics, dashboard ✅

### Built

- **`GET /api/stream` (SSE):** authenticated, heartbeat every 20 s, `retry: 3000`, and
  replay from `Last-Event-ID` (the browser sends it on reconnect) with replayed and live
  events merged in order and never duplicated. The `events` table is the source of truth.
  The hub reads new rows when a write request finishes (so only committed data is sent) and
  every 5 s as a safety net, then fans them out per organisation.
- **Event payloads** carry the project and site names and the acting user, so the feed and
  toasts need no extra lookups and nobody is toasted about their own action. All six event
  types are defined; `report.created` and `site.gap_changed` are emitted by later phases.
- **`GET /api/metrics?projectId`**, all live SQL:
  - total, % verified, count per band, average trust, flagged in the last 7 days, needs review
  - uploads per day and bands per day for 30 zero-filled UTC days
  - assets per site
  - sites with documentation gaps (active projects, report-eligible evidence, the org's
    `gapDays`)
  - ready reports
- **`GET /api/events`** (the feed, with paging and a project filter) and
  **`GET /api/review-queue`** (review or flagged with no decision, oldest first).
- **Web:**
  - `useLiveEvents` maps each event type to the query keys it invalidates, toasts other
    people's notable events, and drives a "Live" indicator in the shell
  - dashboard: KPI tiles that count up and glow briefly on change; uploads-per-day area
    chart; trust-band donut; activity feed; needs-review preview; documentation gaps.
    Charts keep the previous render, faded, while refetching
  - both charts follow the dataviz rules: one sans for figures, a 2px line with a 10% wash,
    hairline solid grid, crosshair tooltip with the value first, a 2px surface gap between
    donut segments, a legend with icon + label + count, and a "Show as table" twin
- **Band colours re-derived** so they stay distinguishable under colour-vision deficiency
  (see DECISIONS).
- **An e2e test server** (`apps/api/test/e2e/server.ts`, test-only) runs the real app with a
  fake Cloudinary that accepts real multipart uploads and derives etag, pHash and EXIF from
  the file itself. Browser tests now run without credentials, locally and in CI.

### Tested

- API (9 new tests, real Postgres, a real HTTP server for streaming):
  - the stream needs sign-in
  - confirming an upload pushes `asset.created` with names and actor, and `/api/metrics`
    changes
  - replay after `Last-Event-ID` returns exactly the later events, in order
  - heartbeats arrive
  - organisations never see each other's events
  - the metrics maths (bands, %, average, 7-day flags, 30-day zero-filled series, per-site,
    reports, project scope, other orgs refused), gaps, feed paging and filter, queue order
- Shared: `describeEvent` for every event type (100% coverage kept).
- Web: the dashboard renders KPIs, charts, gaps and queue from the API; a pushed live event
  refetches and the KPI changes; toasts for other people's flags but not your own.
- **e2e (Phase 3 gate):** the dashboard stays open in one browser context while another
  signs in and uploads a real JPEG through the Evidence tab. The first context's "Total
  evidence" goes 0 → 1 and the feed updates, with no reload (asserted: a single navigation).
- Manual: dashboard screenshots with pipeline-generated data (in-range, off-site,
  cross-project copy, out-of-date photos) in light, dark and 375 px. Fixed the chart
  interpolation, a legend wrap, and feed length.

### Known issues

- The e2e and screenshot uploads go through the fake Cloudinary; real-Cloudinary behaviour
  still waits on keys (`pnpm test:live`).
- `site.gap_changed` events (a site entering or leaving a gap) arrive with Phase 5. Gaps
  are already computed live on every metrics read.

## Phase 4 — Evidence UI, asset drawer, map, timeline, review ✅

### Built

- **Review API:** `POST /api/assets/:id/review` (admins only) approves or rejects evidence
  in the review or flagged bands. A note is required. Each decision is appended to the
  `reviews` log with the score at the time; the Trust Score itself never changes. The
  latest decision is kept on the asset, and `asset.reviewed` is emitted. Verified evidence
  can't be reviewed (409).
- **Asset detail** now includes the review history (reviewer, decision, note, score at
  review) and a summary of every asset a duplicate check matched (project, thumbnail,
  band), so the UI can link straight to it.
- **Thumbnails keep the photo's shape** (clamped between 3:4 and 4:3) and are cropped
  around the subject (`c_fill,g_auto,f_auto,q_auto`), for a masonry grid that doesn't jump.
- **Project tabs:** Overview, Evidence, Map, Timeline, Review, Sites.
  - **Evidence:** a filter row (capture-date range, site, band, tag, all in the URL), a
    masonry grid with band badges and alt text, and the uploader.
  - **Asset drawer**, opened from any tab and kept in the URL (`?asset=…`) so it can be
    shared: the image or video, a radial Trust gauge with the org's band cut-offs marked,
    the six checks with pass/fail, deduction, reason and a link to any matched duplicate,
    the admin review form, review history, tags with the provider used, caption, and a
    metadata table (capture and upload time, uploader, GPS linked to OpenStreetMap, format,
    size, the raw EXIF fields used, and the Cloudinary URL with copy).
  - **Map:** sites as radius circles, evidence as pins in band colours; a pin opens a
    preview with "Open details". A legend, and a count of files without GPS.
  - **Timeline:** newest month first, grouped by site, using capture time (upload time
    when there's none).
  - **Review:** the project's queue, oldest first. Each item shows its failed checks'
    reasons and inline approve/reject with a required note; viewers see it read-only.
- The dashboard's needs-review items open the project's Review tab.

### Tested

- API (5 new tests): approving flagged evidence keeps the score, logs the review and emits
  the event; a later rejection is appended, not overwritten; approval removes it from the
  queue; a note, an admin and a non-verified band are all required; other organisations
  get 404. Duplicate matches appear in the detail.
- Web: component tests for the Trust breakdown (all six checks with pass/fail, deduction
  and reason; the 100 − deductions arithmetic; the matched-asset link; icon + word for every
  state, never colour alone) and the gauge's text alternative. Route tests: a card opens
  the drawer with breakdown, provider and EXIF, and the URL carries `?asset=`; the Review
  tab requires a note before posting; viewers get no review controls; timeline grouping.
- **e2e (Phase 4 gate):** upload → flagged → review → approved, through the real UI. A
  photo goes to Phase 1 and verifies. The same file uploaded to Phase 2 is flagged as an
  exact copy. It appears in Phase 2's Review tab with the reason. Approving without a note
  is refused; with a note, the queue empties. The drawer then shows "Approved by admin", the
  history entry and the unchanged score (30: −60 for the copy, −10 because a 2024 photo
  uploaded today is late).

- Manual: screenshots of the evidence grid, drawer (light, dark, 375 px), map, timeline
  and review queue with pipeline-generated data. They surfaced two real bugs, both fixed
  with tests:
  - evidence outside every site skipped the location check (see DECISIONS)
  - EXIF seconds written as "60.00″" were rejected, dropping the photo's GPS
    The map now tones down the basemap and uses larger pins, so OpenStreetMap's own red
    symbols can't be mistaken for flagged evidence.

### Known issues

- The Map and Timeline tabs load every asset in the project in one request. That's fine
  at hackathon scale; paging comes with Phase 7 hardening if needed.

## Phase 5 — Search, before/after compare, gap alerts ✅

### Built

- **Semantic search** (`GET /api/search`, page at `/app/search`, in the main nav). The
  query is embedded with the same Gemini model as the evidence and ranked by pgvector
  cosine distance. Filters: project, Trust band, capture-date range. Keyword matches on
  tags and captions are added after the semantic results, so assets whose embedding failed
  can still be found. If the query itself can't be embedded, search runs on keywords alone
  and the page says so. Each result shows "N% match" or "Keyword match". Example searches
  come from the organisation's own most-used tags (`GET /api/search/suggestions`). The
  query and filters live in the URL, and a result opens the same asset drawer as every
  other view.
- **Before/after compare** (project "Compare" tab, `GET /api/sites/:id/compare`). By default
  it picks the site's earliest and latest report-eligible photos, and you can choose any
  two photos from the site instead. A draggable divider sits on a range input, so it
  works from the keyboard and with screen readers. A downloadable side-by-side image is
  built by Cloudinary from the stored public ids: the before photo is padded to double
  width, the after photo is overlaid on the right, and both carry date labels.
- **Documentation-gap alerts.** Each site's gap state is stored (`sites.gap`, migration 0003) and recomputed after uploads, reviews, settings changes (including the gap
  window), site creation and project edits, plus once an hour for time passing. A change
  emits `site.gap_changed`, which refreshes the dashboard live and shows a warning toast
  when a gap opens. Gaps appear on the dashboard, on the project overview ("Documentation
  gaps") and as a badge on the Sites tab.

### Tested

- API (13 new tests in `phase5.test.ts`):
  - **Search:** "water pump" returns the pump photo first, with scores in descending
    order; the filters work; search falls back to keywords when embedding is down; assets
    whose embedding failed are still found; suggestions return the org's top tags; empty
    queries are rejected and other organisations are kept out.
  - **Compare:** the suggested pair is the earliest and latest photo, with a composite
    URL; explicit picks work, and photos from another site get a 404; a pair needs two
    eligible photos.
  - **Gaps:** a new site's gap is recorded without an event, then evidence closes it with
    an event; time passing opens a gap; changing the gap window re-evaluates it; a project
    that is no longer active has no gaps.
- Web (6 new tests): search results with match scores and URL state, the keyword-mode
  notice, the no-results empty state, the compare slider's keyboard value, the Compare
  tab's suggested pair and composite link, and the Sites tab's gap badge.
- **e2e (`phase5.spec.ts`):** through the real UI, a new site shows "Gap: No verified
  evidence yet". An old photo and a fresh photo are uploaded, the gap closes and the site
  shows 2 files. Compare suggests the pair, the divider moves with the arrow keys, and the
  composite URL returns an image. Search finds both photos and opens the drawer.
- The opt-in live test (`pnpm test:live`) now also checks that Cloudinary renders the
  labelled composite and that Gemini embeddings rank by meaning.
- Manual: screenshots of search (light, dark, 390 px), compare (desktop and mobile dark),
  the Sites gap badge, the overview's gap list and the composite image. They surfaced:
  - **A real bug, fixed with a regression test:** every site reported "0 files". The
    count used a correlated subquery, and Drizzle leaves columns unqualified in a
    single-table select, so the subquery compared `site_id` with its own `id`. It's now a
    join. This also fixes the Compare tab's default choice (the first site with at least
    two files).
  - Search filters wrapped awkwardly on phones and are now a two-column grid.
- Test reliability:
  - e2e sign-ups use random emails; two parallel workers could produce the same
    timestamp-based address.
  - e2e sign-up and sign-in allow 15 s, because every worker hashes a password (scrypt,
    slow on purpose) at the same moment.
  - Web tests allow 15 s each, because full-app route tests in jsdom can exceed 5 s when
    run in parallel.
  - The assertion that checked for no gap badges used an anchored regex that could never
    match, so it passed whatever the page showed; it now counts the badges correctly.

### Known issues

- An asset's embedding includes its project and site names as they were at upload.
  Renaming a project or site doesn't re-embed its evidence, so searching by the new name
  relies on the other words in the query. Re-embedding on rename belongs with the Phase 7
  hardening.
- The composite's text labels and overlay syntax follow Cloudinary's transformation
  reference. The URL is generated by the SDK, and the live test checks that it renders, but
  that check hasn't run yet because the Cloudinary keys are still missing.
