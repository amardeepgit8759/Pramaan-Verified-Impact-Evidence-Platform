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

## Phase 6 — Reports, PDF/CSV, share links ✅

### Built

- **Report generation** (`POST /api/projects/:id/reports`, admins). It checks the period
  and that there is eligible evidence in it, creates the report as "generating", replies
  202, and writes the report in the background:
  1. Collect eligible evidence from the period, by capture day (upload day if unknown).
  2. Build the facts JSON (counts per site, month and tag, before/after pairs, SDG goals,
     CSR category, and the citable assets with captions).
  3. Ask Gemini for `{summary, sections:[{heading, claims:[{sentence, asset_ids}]}]}`
     under a system instruction to use only these facts and cite every sentence.
  4. Validate: drop claims that cite nothing, cite anything outside the eligible set, or
     assert legal compliance. Log the counts, store the rest in `report_claims`, and emit
     `report.created`.

  Failures are stored with a plain message. A restart marks unfinished reports as
  failed. Only one report per project can be generating at a time (enforced by a
  partial unique index).

- **Report reader** (Reports tab → Read report). Every sentence is a button that opens a
  side panel with the photos it cites: the image, Trust Score, every check with its
  reason, review decisions, "Full details" (the evidence drawer) and the original file.
  It also shows the summary, "N statements removed", and an evidence annex (E1, E2… in
  order of first citation).
- **Exports.**
  - **PDF** (`@react-pdf/renderer`): a branded cover with SDG and CSR chips, counts and
    the "aligned to, not legal compliance" statement; the summary and numbered statements
    with [E1, E2] references; thumbnails of the cited photos after each section; and an
    evidence annex with each file's asset id, link, Trust Score, failed checks and review
    decisions, plus page numbers.
  - **CSV:** the evidence annex, one row per cited file, with 17 documented columns.
- **Funder share links** (Share tab, admins). Links last 7, 30 or 90 days, can be copied
  and revoked, and show when they expire.
- **Public page** (`/share/:token`, no sign-in): the organisation and project, SDG and CSR
  chips, metrics, ready reports (readable, with PDF and CSV downloads), a map of sites
  and evidence, and a gallery of eligible evidence where each item opens its checks.
  Expired links get 410 and a clear message; unknown or revoked links get 404. The page
  and API are marked `noindex` and `no-store`, and uploader names are left out.
- **Live updates:** `report.created` refreshes report lists and pages, and toasts
  everyone, including whoever started the report ("New report generated" or "A report
  couldn't be generated").

### Tested

- Shared (11 new tests, still 100% coverage):
  - **Facts builder:** grouping; before/after pairs from photos only; the size caps that
    always keep pair photos.
  - **Claim validation:** uncited, ineligible, empty and compliance-claiming sentences
    are dropped, and positions are renumbered; compliance sentences are also removed from
    the summary.
  - **Other helpers:** evidence order; CSV formula neutralising; annex rows.
- API (16 new tests):
  - **`reports.test.ts`:**
    - Validation drops uncited and ineligible claims, and the model is never shown
      ineligible evidence.
    - Admin-approved evidence is included and marked in the facts.
    - The period filter works; empty periods get 422, bad periods 400, a concurrent run
      409, non-admins 403, and other organisations 404.
    - Model failures and "nothing usable" are recorded; interrupted reports are failed.
    - Listing, reading and deleting work.
    - **The PDF renders and isn't empty:** it's parsed with PDF.js to check the title,
      three pages, cover text, cited sentences, [E1, E2] references, the annex with asset
      ids, embedded thumbnails, and that the dropped sentence is absent. It still renders
      when thumbnails are unavailable.
    - **The CSV columns are exactly the documented ones:** checked with csv-parse, along
      with the BOM, one row per cited file, and the values.
    - Only finished reports download.
  - **`share.test.ts`:**
    - Admin-only create, list and revoke.
    - The public view shows only eligible evidence and ready reports, without uploader
      names, and PDF/CSV downloads work.
    - Other projects' and unfinished reports are unreachable through a link.
    - **A link expires (410)**, and unknown or revoked ones are 404.
    - **A link cannot change data:** every write method returns 405 with
      `Allow: GET, HEAD`, the token isn't a session, and row counts are unchanged.
- Web (10 new tests): the Reports tab (statuses, links, generate dialog defaults and
  request, server refusal message, viewer view); the reader (a sentence opens its
  evidence with checks and reviews, the dropped-statement note, download links, the
  generating state); the Share tab (create, list, expired, revoke); and the public page
  (content without any app API calls, the evidence panel, expired and revoked links, and
  a shared report with share-scoped downloads).
- **e2e (`phase6.spec.ts`):** upload two photos, generate a report from the UI, and watch
  it turn Ready live (2 cited statements, 1 uncited removed). A sentence opens its
  evidence. The PDF starts with `%PDF-` and the CSV has the annex header. A share link
  opens the project and report in a fresh, signed-out browser context, and revoking it
  breaks the link immediately.
- The opt-in live test now also asks Gemini for a report and checks that validated claims
  cite only the given evidence.
- Manual: screenshots of the Reports tab, generate dialog, reader and evidence panel,
  Share tab, and the public page (light, dark, 390 px, broken link). The PDF pages were
  rendered to images with PDF.js in Chromium. This surfaced and fixed:
  - **A real bug:** every map tile was OpenStreetMap's "Access blocked" 403, because
    helmet's default `Referrer-Policy: no-referrer` stripped the Referer that OSM's tile
    policy requires. It's now `strict-origin-when-cross-origin` (tested).
  - In the PDF, react-pdf's automatic hyphenation ("administra- tor") is turned off; long
    annex URLs overflowed the page and now wrap; and the cover's default font size and
    stat line heights were corrected.
  - Share links show their exact expiry date rather than "next month".
- **e2e reliability.** With the eighth spec, local runs started timing out across the
  board. A CPU profile of the e2e server showed it mostly idle, and Postgres was almost
  never busy. The cause was memory pressure: six Chromium workers, the Docker VM (3.7 GB)
  and a desktop browser left about 2 GB free. Local runs now use 3 workers (override with
  `E2E_WORKERS`; CI keeps Playwright's default), and assertions allow 10 s. The suite
  passes consistently in about 50 s, the same wall time as before.

### Known issues

- The PDF uses the built-in Helvetica and Times fonts, so text in non-Latin scripts (a
  Hindi site name, for example) won't render correctly. Bundling a Noto font is a small
  Phase 7 task.
- The annex shows each file's current Trust Score and review state, not a snapshot from
  when the report was generated. Files that stopped counting as verified are marked as
  such in the reader and the PDF.
- The report and PDF are checked with the fake model and fake Cloudinary. The live test
  covers the real Gemini call, but it hasn't run yet because the keys are still missing.

## Phase 7 — Polish, seed, hardening, deploy (local work done; deploy waits for credentials)

### Built

- **Demo data and seed.**
  - `demo-data/` holds 14 freely licensed photos from Wikimedia Commons and one
    near-duplicate made from them. Licences were checked against an allowlist (CC0,
    public domain, CC BY, CC BY-SA), original metadata was stripped, and
    `demo-data/README.md` lists the credits and the role of each file.
  - `pnpm seed:demo` creates a demo organisation with three projects and six sites
    through the real HTTP API only: signed upload, confirm, review and report. It writes
    capture dates and GPS into each photo at seed time, relative to today.
  - Planted problems: an exact duplicate across projects (the original is then approved
    with a note), a resized near-duplicate, an off-site photo, a photo with no EXIF, and
    two documentation gaps.
  - `pnpm demo:images` re-fetches the photos.
- **Errors, 404/500 and toasts.**
  - A page that crashes inside the app shows an in-place error with Reload, and the
    navigation keeps working.
  - Outside the app, a full-page 500 appears; the 404 pages remain.
  - Chunks missing after a deploy are recognised and the page asks the person to reload.
  - Any action without its own error handling now shows a toast, and network failures
    read "Can't reach Pramaan…" instead of "Failed to fetch".
- **Rate limits on AI endpoints.** Search and upload confirmation are limited per user
  (120 a minute) and report generation per organisation (10 an hour), both configurable.
  These sit on top of the existing global and sign-in limits.
- **Metadata.** OpenGraph and Twitter tags, a generated 1200×630 share image, and an Apple
  touch icon. Absolute image URLs come from `PUBLIC_URL`, or `RENDER_EXTERNAL_URL` on
  Render.
- **Deploy configuration.** `render.yaml` (Docker web service, Singapore, health check,
  secrets prompted, `JWT_SECRET` generated). README deploy steps, and Neon guidance to
  use the direct connection string with `sslmode=verify-full`. The Dockerfile was already
  multi-stage, and migrations already ran on start.
- **Performance.**
  - Each page is now its own chunk, so the entry bundle fell from 1.2 MB to about 31 kB.
  - Dashboard charts load after the figures, and framer-motion loads only on the landing
    and upload pages: the KPI count-up now uses `requestAnimationFrame` and the Web
    Animations API.
  - Responses are gzipped (Server-Sent Events excluded).
  - The two fonts are self-hosted and preloaded, replacing Google Fonts, and the CSP now
    allows fonts from our own origin only.
  - The session request starts while page code is still loading, and icons are grouped
    into one chunk.

### Tested

- API (7 new tests):
  - AI rate limits: per user for search, a teammate keeps their own allowance, upload
    confirmations count, and report generation is limited per organisation with a
    readable 429.
  - Serving the web app: absolute preview URLs, SPA fallback, `noindex` on share pages,
    gzipped long-cached assets, and unknown `/api` routes still return 404.
- Web (4 new tests): failed actions toast unless they handle their own errors, the
  network-error message, and aborted requests stay aborted. Dashboard tests now wait for
  the lazily loaded charts.
- **Seed dry run** against the e2e server (real API and database, fake Cloudinary and
  Gemini): all 16 uploads go through the pipeline, and exactly the planted problems are
  caught:
  - Exact duplicate: flagged at 0; its original is approved.
  - Near-duplicate: distance 0/64.
  - Off-site photo: 41.1 km from the nearest site.
  - No-EXIF photo: 85, "missing metadata".
  - Documentation gaps: Bhondsi and Damdama.

  One report is generated. Screenshots of the dashboard, evidence grid, compare view and
  review queue with the real photos looked right.

- **Lighthouse on the dashboard**, signed in, measured against a local production build
  with seeded data:

  | Profile | Performance  | Accessibility | Best practices | SEO |
  | ------- | ------------ | ------------- | -------------- | --- |
  | Desktop | 94           | 100           | 96             | 92  |
  | Mobile  | 49 (from 30) | 100           | 96             | 92  |

- Full gate: lint, typecheck, shared (200 tests, 100% coverage), API (126), web (53),
  build, and e2e 8/8 on two consecutive runs.
- What the manual checks found and fixed:
  - The e2e fake's 8×8 average hash reported a false near-duplicate between two unrelated
    demo photos. The fake now uses a DCT perceptual hash, like Cloudinary's, and serves
    downsized thumbnails, so local measurements aren't distorted by full-size images.

### Known issues

- **Deploy is not done yet.** It needs the Cloudinary, Gemini and Neon credentials and
  access to Render (see below). The live pipeline test, the seed against real
  Cloudinary/Gemini, and the Playwright run against `BASE_URL` all wait on this.
- **Mobile performance is 49** under Lighthouse's simulated slow 4G and 4× CPU throttling.
  Most of what remains is React rendering a signed-in, data-heavy page on the throttled
  CPU. Getting it much higher would need server rendering of the first view. Desktop
  scores 94.
- The near-duplicate in the demo relies on Cloudinary's real pHash treating a half-size,
  recompressed copy as close (it's 0/64 with the fake). Confirm this on the first real
  seed.
- Still open from earlier phases: non-Latin text in PDFs, re-embedding on rename, and
  paging for the map and timeline.

### Deliverables and definition-of-done checks (brief Sections 8 and 9)

- **README for judges.** It covers:
  - the problem and solution, with screenshots;
  - two Mermaid diagrams (the architecture, and the upload-to-live-dashboard sequence),
    both checked by rendering them;
  - how Pramaan uses Cloudinary (signed uploads, re-fetch, etag, pHash, media metadata,
    auto-tagging, context write-back, and the thumbnail, preview, composite and PDF
    transformations);
  - the Trust Score table, a three-command local setup, env vars, deploy steps and tests;
  - credits for every library, with licences, and for every API and data source.
- **`docs/demo-script.md`:** a timed 4-minute walkthrough of the Section 9 journey, with a
  preparation checklist and fallbacks. Its UI labels were checked against the app.
- **Fresh clone check.** Clone, add `.env`, `docker compose up --build` (as a separate
  Compose project): the health check reports the database and pgvector, migrations ran,
  pages are served gzipped, sign-up works, and the Playwright smoke spec passes against
  the container. It found a real problem, now fixed: the Dockerfile didn't copy the new
  `scripts` workspace package, so the frozen install would have failed on a fresh clone.
- **No mock data in shipped code.** The web tests moved from `apps/web/src` to
  `apps/web/test`, like the API's, and a decoy password hash was renamed.
  `grep -rniE "mock|lorem|faker|dummy|fake" apps/web/src apps/api/src` now finds only the
  landing-page promise that missing metadata is "never 'fake'".
- **Git history:** one or more commits per phase, from the scaffold through Phase 7.

Still to do once the credentials arrive:

- Retake the screenshots with real Gemini captions. The current ones come from a local run
  in which a test double stands in for Gemini, so the views chosen avoid showing captions.
- Deploy, then walk the deployed URL end to end (phone upload, live laptop dashboard, the
  planted duplicate, review, a cited report, the PDF and the share link).

### Live verification with real credentials (2026-09-29)

- `pnpm test:live` passes 9/9 against real Cloudinary and Gemini:
  - signed upload;
  - etag, pHash and EXIF read back;
  - auto-tagging (or a clean "unavailable");
  - delivery URLs;
  - the labelled before/after composite rendered by Cloudinary;
  - context write-back;
  - Gemini captions, embeddings and ranking by meaning;
  - a cited report.
- Gemini was overloaded (503) during the first runs, so calls now retry and fall back to
  other models (see DECISIONS). In the passing run, captioning fell back to
  `gemini-3.5-flash-lite` and the report to `gemini-2.5-flash`, each logged. Five new unit
  tests cover retries, fallbacks and which errors count as capacity problems.
- **Demo seeded through the real pipeline** (local API with real keys):
  - All 16 photos went through Cloudinary and Gemini, and the planted problems came out
    exactly as designed:
    - the reused tank: flagged 0;
    - the resized copy: near-duplicate at **2/64** by Cloudinary's real pHash;
    - the off-site photo: 60;
    - the no-EXIF photo: 85;
    - everything else: verified 100.
  - Gemini wrote accurate captions, and it did all the tagging, because the Free plan has
    no Cloudinary tagging add-on enabled (the fallback working as designed).
  - The generated report kept 10 cited statements and dropped 2 whose citations weren't
    eligible, so the validator is catching real model output.
- The README screenshots were retaken on this real data, and the README now shows a
  before/after composite rendered by Cloudinary from a single URL. The PDF with real
  Cloudinary stills rendered in 1.6 s (5 pages).
