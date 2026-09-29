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

## Domain model and core logic (2026-09-27)

### Settings

- Defaults follow Section 5.2 exactly (60/40/25-or-40/20/15/10, pHash threshold 6, late upload
  90 days, gap 30 days, bands 80/50). This replaces the scaffold's guessed defaults.
- **Two numbers in the rules that the brief doesn't list as settings are settings anyway:**
  the 7-day duplicate burst window (`duplicate_burst_days`) and the 10× "far away" multiplier
  (`far_location_multiplier`). Rule 1 says no magic numbers, so they're editable like the rest.
- `weights` is a JSON object keyed by check type, plus `wrong_location_far` for the heavier
  location deduction.

### Trust Score rules where the brief left room

- **Exact duplicate, same project:** the burst window is measured on upload time. The file is
  byte-identical, so capture times always match and can't tell a retry from a re-use.
- **Near duplicate ignores exact copies** (same etag), so one copied file isn't penalised twice
  (60 + 40). Exact copies are the exact-duplicate check's job.
- **Checks that need missing data pass as "Not checked"** (wrong location without GPS or a site,
  wrong time and late upload without a capture date). The missing-metadata check alone carries
  that penalty, so missing data costs 15 points, not 15 + 20 + 10.
- **Project end date is inclusive** (anything captured on the end date is in range), and an
  open end date means the project is ongoing.
- **EXIF times have no zone.** `OffsetTimeOriginal` is applied when the camera wrote one;
  otherwise the time is read as UTC. At day-level granularity this only matters at midnight.
- **Missing-metadata wording** always ends "unverified, not necessarily fake".
- **Report eligibility:** a verified asset (unless an admin rejected it), or any asset an admin
  approved. Approval never changes the stored score.
- **Documentation gaps** only apply to `active` projects, and "verified evidence" means
  report-eligible (so an approved asset closes a gap).

### Schema

- **pHash is `bit(64)`.** Cloudinary's 16-hex-digit hash is converted to a bit string, so the
  near-duplicate search is a plain `bit_count(phash # $1) <= threshold` in SQL (tested against
  real Postgres), scoped to the organization and to other projects.
- **Columns added beyond Section 4**, each because a later rule needs it:
  - `users.invite_token_hash`, `invite_expires_at` hold the hashed password-set token for invited users.
  - `assets.original_filename` and `assets.exif` (the raw EXIF fields the capture data came
    from) are there for the asset detail view and transparency.
  - `assets.review_decision` is the latest decision from the append-only `reviews` log. It's
    denormalized so "eligible for reports" is a simple filter.
  - `trust_checks.reason` holds the plain-language sentence each check produces.
  - `reviews.trust_score_at_review` lets the evidence annex show what score the admin saw.
  - `reports.dropped_claims` and `reports.error` record how many model claims failed citation
    checks, and why a generation failed.
  - `report_claims.section` holds the section heading, which Gemini's output has but the table didn't.
- **`trust_checks` holds the current result only** (one row per asset and check type, replaced
  on re-score). The history of score changes lives in `events` (`asset.rescored`).
- **Enums:**
  - `project_status` is `active | completed | archived`.
  - `report_status` is `generating | ready | failed`.
  - `tagging_provider` adds `none` for assets that couldn't be tagged.
- **`events.id` is a bigint identity** so SSE clients can resume from `Last-Event-ID`.
- Deleting an organization cascades to everything. Deleting a site keeps its assets and just
  unassigns them.

## Design system, auth and projects (2026-09-27)

### Auth (Section 5.9)

- **Passwords use Node's built-in `scrypt`** (N=2^15, r=8, p=1, 16-byte salt, stored as
  `scrypt$N$r$p$salt$key`). It's memory-hard like argon2 but needs no native module, so
  installs and Docker builds stay simple on Windows and Linux.
- **The session JWT carries only the user id** (HS256, `SESSION_TTL_DAYS`, default 7). The
  user, role and org are re-read on every request, so a role change or removal takes effect
  immediately rather than when the token expires.
- **Login doesn't reveal which emails exist:** same message for an unknown email and a wrong
  password, and one hash comparison runs either way so timing matches.
- **CSRF:** the cookie is `sameSite=lax`, and every API write must be `application/json`
  (anything else gets 415). A cross-site HTML form can't send JSON without a CORS preflight.
- **Stricter rate limit on sign-in, sign-up and password-set:** 20 per 15 minutes per IP by
  default (`AUTH_RATE_LIMIT_*`).
- **Invites:** a 32-byte random token, stored only as a SHA-256 hash, valid for 7 days, single
  use. The link is logged on the server (the demo has no email) and also returned to the
  inviting admin so they can copy it. It's built from the request's own host, so it works
  behind the Vite proxy and on Render without another env var.
- **Only admins create projects.** Field staff and viewers can see them.
- **A malformed id returns 404**, the same as an id that doesn't exist.

### Landing page

- **The public stats strip is platform-wide:** total verified files, projects, sites and
  ready reports across all organisations, as counts only (no names or media). It's hidden
  when there's no evidence yet.
- **No illustrative "example" evidence** on the landing page. Mock data isn't allowed, so the
  hero is typographic and the explainer describes the checks rather than showing made-up
  scores.

### UI

- **Fonts:** Geist (UI) and Instrument Serif (display headings) from Google Fonts. The CSP
  allows `fonts.googleapis.com` and `fonts.gstatic.com` and nothing else external for styles
  or fonts.
- **Palette:** ink/indigo neutrals, emerald as the only accent, and emerald/amber/rose for
  verified/review/flagged, all as OKLCH tokens in `index.css`. Every text/background pair
  was checked against WCAG AA in both themes (lowest: 4.99:1 for white on emerald buttons).
  Bands always pair colour with an icon and a label.
- **Dark mode** is class-based. The preference (light, dark, system) is saved in
  `localStorage`; it's a per-browser convenience, not user data. A tiny same-origin script
  (`/theme-init.js`) applies it before first paint to avoid a flash; it's an external file
  because the CSP forbids inline scripts.
- **Phones get a bottom tab bar** (thumb-reachable for field staff) and desktops a sidebar.
- **SDG chips use the official UN colours**, as decoration only: the goal number and name are
  always there as text.
- **CSR category** is free text, with suggestions from Schedule VII of India's Companies Act.
- **UI copy uses British/Indian English spelling** ("organisation"), which suits the product's
  audience.
- **Loading states** are skeletons. Only a submit button shows a small inline spinner while
  its request is in flight. Toasts use `sonner`.
- **Animations** stay under 200 ms and respect `prefers-reduced-motion`, both through Framer
  Motion's `MotionConfig` and a CSS fallback.

## Phase 1: CRUD, settings and team (2026-09-27)

- **Changes that affect scores re-score straight away**, synchronously, inside the request:
  - settings (every asset in the org)
  - project dates (that project's assets)
  - project rename or delete (assets in other projects whose duplicate checks cite it)
  - site move, resize, rename or delete (that site's assets)

  At hackathon scale this takes milliseconds, and it means a stored score is never stale.
  If organisations grow to tens of thousands of assets, this moves to a background job.

- **The settings preview is a dry run of the same re-scoring code**, not an estimate.
  `POST /api/settings/preview` runs every check with the proposed settings and reports band
  transitions without writing anything. The UI debounces it (400 ms) and only sends the
  settled draft.
- **Settings are readable by every role.** Showing how scores are worked out is part of the
  product's transparency; only admins can change them.
- **Removing a teammate deactivates them** (`users.deactivated_at`) instead of deleting the
  row. The append-only review log keeps pointing at a real reviewer, and the person can't
  sign in or use an existing session. Re-inviting the same email restores them.
- **An organisation always keeps an admin:** demoting the last admin is refused, and admins
  can't remove themselves.
- **Project and site edits send the whole object** (`PUT`), matching the edit forms. Nothing
  here benefits from partial updates.
- **Deleting a project deletes its sites and evidence** (database cascade). Deleting a site
  keeps its evidence in the project, unassigned. That evidence's location then can't be
  checked, and the check says so.
- **Maps:** Leaflet with OpenStreetMap's standard tiles (`tile.openstreetmap.org`,
  attribution shown, added to the CSP). Dark mode inverts the tile layer with a CSS filter
  rather than using a second provider. Map code loads only on pages that show a map. When
  there's nothing to show yet, maps start on a whole-India view, matching the product's
  audience.
- **"Use my current location"** in the site picker uses the browser's geolocation, so field
  staff can place a site while standing in it.

## Phase 2: ingestion (2026-09-28)

Checked against Cloudinary's Upload, Admin, signature and folder-mode docs, and Gemini's
structured-output, image and embedding docs, on 2026-09-27/28.

- **Auto-tagging runs at confirm time, not in the signed upload.** The brief puts the
  auto-tagging params in the upload signature. But if the add-on isn't enabled (or is out
  of quota), a signed upload that asks for it would probably fail outright, and then there's
  nothing to fall back from. So the server calls the Admin API's `update` with
  `categorization`/`auto_tagging` after the upload. If that throws, or finds no tags, Gemini
  tags the image. After a failure the add-on is skipped for an hour, so every upload doesn't
  pay for the same error. The provider used is stored, logged and shown.
- **Folder mode is detected, not assumed.** Cloudinary accounts created since 2023 use
  dynamic folders, where `folder` is legacy. The server asks the Admin API once
  (`config?settings=true`). Dynamic accounts get `asset_folder` + `public_id_prefix`, fixed
  ones get `folder`. Either way the public id starts with `pramaan/{orgId}/{projectId}/`, and
  confirm refuses anything outside the caller's own project folder.
- **Signed params:** `folder` (or `asset_folder` + prefix), `context`, `phash`,
  `media_metadata`, `allowed_formats` (phone and camera photo and video formats) and
  `timestamp`, sent to `/auto/upload`. `media_metadata` replaces the deprecated
  `image_metadata` and `exif`.
- **Upload time is Cloudinary's `created_at`**, never the browser's clock.
- **Captions come only from Gemini**, as the brief specifies (the add-on returns tags, not
  captions). Alt text falls back to "Photo tagged …" when there's no caption.
- **Gemini calls** use `models.generateContent` with `responseMimeType: application/json`
  and a plain `responseJsonSchema`, validated again with zod. The image goes inline (base64)
  from a width-limited Cloudinary rendition, or for videos an automatically chosen frame,
  which keeps requests well under the 20 MB inline limit.
- **Failures degrade, they don't block.** If tagging fails the asset is stored with no tags
  (`tagging_provider = none`). If embedding fails the vector is null and search falls back
  to keywords. If writing back to Cloudinary fails, it's logged and skipped.
- **Write-back uses context keys prefixed `pramaan_`.** Structured metadata needs fields
  defined in the Cloudinary account first; context works on every account.
- **Duplicate re-scoring:** after a new asset is stored, the new asset and every asset it
  matches are re-scored together. If two copies are confirmed at the same moment, the second
  to finish still sees the first.
- **Scoring is synchronous inside the confirm request**, so the uploader can show the score
  the moment verification finishes.
- **The browser uploads up to three files at a time.** The site picked when files are
  dropped goes with them; "match from GPS" leaves it to the server.
- **The live test generates its image** (jpeg-js + piexifjs) with known EXIF instead of
  committing a binary, uploads it to `pramaan-test/<uuid>`, and deletes it afterwards.

## Phase 3: real-time and dashboard (2026-09-28)

- **SSE reads committed rows from the `events` table.** Postgres LISTEN/NOTIFY would be
  neater, but it doesn't work through Neon's pooled (PgBouncer, transaction-mode)
  connections, and publishing from inside a transaction could announce data that then rolls
  back. Instead, each write request nudges the hub when it finishes, by which point its
  transaction has committed, and a 5 s timer covers anything else. It works with any number
  of API instances, and reconnect replay is simply "rows after Last-Event-ID".
- **Heartbeats are SSE comments every 20 s**, with `X-Accel-Buffering: no` and
  `Cache-Control: no-transform` so proxies (Render) don't buffer or close the stream.
- **Event payloads carry names** (project, site, actor), captured at write time. The feed
  reads as it was when the thing happened, and clients skip toasts for their own actions.
- **Live invalidation is by prefix:** `['projects']` covers every project summary, site
  list and evidence list, so a re-score in one project refreshes duplicates in others. Only
  visible queries refetch.
- **Dashboard figures use the UI sans, not the serif**, with proportional digits. The serif
  stays for headings (dataviz rule: hero and stat values are never a display face).
- **Band colours for charts** were validated with the dataviz palette checker. The original
  emerald and rose had the same lightness and were nearly identical under deuteranopia
  (ΔE 4). The "solid" band colours are now separated by lightness: light mode #00704b /
  #efa831 / #f46a86, all-pairs CVD ΔE 12.0; dark mode #009164 / #f9b73f / #ff8fa3, ΔE 11.3.
  The checker's categorical lightness-band rule doesn't apply to a status palette (amber has
  to be light to read as amber). Amber and rose are under 3:1 on white, so every band
  display has an icon, a text label, a count and a table view.
- **A separate indigo series colour** (`--chart-series`) for non-status data such as
  uploads per day, so emerald always means "verified" and never "just a series".
- **The e2e server uses a fake Cloudinary** on the app's own origin (test code only;
  excluded from the Docker image through the API package's `files`). It keeps browser
  tests hermetic and runnable in CI without secrets. Pointing `BASE_URL` at a deployment
  runs the same suite against real services.

## Phase 4: evidence UI and review (2026-09-28)

- **Only review and flagged evidence can be reviewed** (the brief's wording). Verified
  evidence returns 409; there's nothing for an admin to decide.
- **Reviews never change the score.** The decision is appended to the `reviews` log with the
  score the admin saw, and the latest decision is kept on the asset for filtering. Changing
  your mind adds a new entry; nothing is edited or deleted.
- **The asset drawer lives in the URL** (`?asset=<id>`) on every project tab, so a reviewer
  can send a colleague a link to one piece of evidence, and the browser Back button closes
  it.
- **Duplicate checks link to what they matched.** The detail response includes a small
  summary of each matched asset (project, thumbnail, band) so the drawer can show and open
  it without another request.
- **Masonry thumbnails keep the photo's shape**, clamped between 3:4 and 4:3, and are cropped
  around the subject by Cloudinary (`g_auto`). The web app computes the same ratio to
  reserve space, so the grid doesn't jump while images load. The helper lives in
  `packages/shared` so the API and web can't disagree.
- **Evidence filters live in the URL** (capture-date range, site, band, tag), so a filtered
  view can be shared or bookmarked. Date filters use the capture date, because that's what
  "when was this evidence from" means.
- **The Review tab shows why each item scored low** (its failed checks' reasons) next to the
  approve/reject controls, so most decisions don't need the drawer at all.
- **Alt text drops the caption's final full stop**, so it joins cleanly into longer
  screen-reader labels ("A hand pump. Flagged, score 30. Open details").
- **Evidence outside every site is still location-checked.** Found while testing the map:
  a photo uploaded with "match from GPS" that falls outside every site's radius was left
  unassigned, so its location check said "not checked" and it could score 100 from anywhere
  in the world. Now unassigned evidence with GPS is compared with the project's closest
  site. It stays unassigned (it genuinely isn't at a site), and the reason says so: "Taken
  5.6 km from the nearest site, Village Rampur". Only a project with no sites, or a file
  with no GPS, skips the check (and missing GPS already costs points under missing
  metadata).
- **"60.00″" is a valid EXIF seconds value.** ExifTool prints seconds to two decimals, so a
  camera's 59.996″ is written as 60.00″. The parser used to reject it and treat the photo as
  having no GPS. It now accepts up to 60 seconds and still rejects anything above.

## Phase 5: search, compare, gaps (2026-09-28)

- **Hybrid search.** Semantic ranking comes first (pgvector cosine, `1 − distance` shown
  as "N% match"). Keyword matches on tags and captions are appended afterwards, never
  mixed in, because keyword and cosine scores aren't comparable. The keyword pass is what
  finds evidence whose embedding failed at upload. If the query can't be embedded,
  keywords answer it alone and the response says `mode: "keyword"`, so the UI can be
  honest about it.
- **Search is organisation-wide** with optional project, band and capture-date filters,
  because funders ask across projects ("show me every borewell"). Result counts are capped
  (24 by default, at most 60) rather than paged, since the best matches come first.
- **Example searches are the organisation's own top tags**, not a hard-coded list, so the
  page never suggests something that returns nothing.
- **Embedding text** is the caption, tags, project, site and capture day joined into one
  sentence, so a query like "Rampur borewell 2024" can match on place and time as well as
  content.
- **Tests use a bag-of-words fake embedder** (each word hashed to a dimension). It's
  deterministic and enough to test ranking, filtering and fallbacks against real pgvector.
  Real semantic quality ("hand pump" ≈ "borewell", not "classroom") is covered by the live
  Gemini test.
- **Compare suggests the site's earliest and latest report-eligible photos.** Only
  eligible photos are suggested, so the default pair is always one a funder can trust.
  Any image from the site can still be picked by hand, and the picker shows each photo's
  band and score.
- **The side-by-side image is a Cloudinary transformation, not a server render.** The
  before photo is padded to 1600×600, the after photo (at 800×600, `g_auto`) is overlaid on
  the right, and "Before · date" and "After · date" labels are added as text layers. It's
  built from public ids stored in the database, never from client input, and the
  CDN caches it. Labels use the unambiguous "1 Feb 2024" format, which also avoids
  commas, which text layers would need to escape.
- **Gap state is stored** (`sites.gap`), not only computed on read, so a change can be
  announced exactly once (`site.gap_changed`) rather than on every page load. It's
  recomputed after anything that can change it, and hourly for the passage of time
  (`GAP_REFRESH_MS`). A site's first computation is quiet: creating a site doesn't raise
  an alert that it has no evidence yet, although the badge shows it.
- **Gap events only toast when a gap opens.** A gap closing just updates the lists.
- **Site file counts use a join, not a correlated subquery.** Drizzle leaves column names
  unqualified in a single-table select, so a subquery that refers to the outer table's
  column silently binds to its own. Aggregates over related tables are written as joins.

## Phase 6: reports, exports, sharing (2026-09-28)

- **Reports are generated in the background.** `POST` replies 202 with a "generating"
  report, and `report.created` (plus a 5-second poll while anything is generating) moves
  the UI on. A model call can take tens of seconds, which is too long to hold a request
  open behind a proxy. A partial unique index allows only one generating report per
  project, and on startup any report still "generating" is marked failed ("Interrupted by
  a server restart").
- **A claim is dropped if any id it cites is ineligible**, not just trimmed down to its
  eligible ids. A sentence that is partly supported by unverified evidence isn't a
  verified claim. Empty sentences are dropped too. If nothing survives, the report fails
  with a clear message instead of being published empty.
- **Compliance guard.** Sentences that assert legal, regulatory or statutory compliance
  ("complies with", "compliant", "statutory", "legally") are dropped from claims and from
  the uncited summary, on top of the prompt telling the model not to write them. The
  brief's rule is "never claim legal compliance", and a prompt alone can't guarantee
  that.
- **The model sees only facts built from eligible evidence.** Ineligible ids never
  appear in the prompt, so validation is a second line of defence, not the only one.
  Large projects are capped at 150 listed assets and 20 ids per group; before/after
  photos are always listed.
- **"Tag clusters" are the top 12 tags** with their asset ids. Tags are already
  normalised lower-case keywords, so this is enough for the model to group work by theme
  without a separate clustering step.
- **Report model call.** Gemini's docs now lead with the Interactions API, but
  `models.generateContent` is still in `@google/genai` 2.24 with no deprecation notice,
  and it accepts `systemInstruction` and `responseJsonSchema`. It's used here, as for
  vision in Phase 2, and the output is validated with zod before citations are checked.
- **Evidence references (E1, E2…)** follow the order of first citation and are the same
  in the reader, the PDF and the CSV, so a funder can cross-check them.
- **The annex lists cited files only**, with their current checks and full review
  history. A file that stopped counting as verified after the report was generated is
  marked as such rather than hidden.
- **PDF:** `@react-pdf/renderer`'s `renderToBuffer` on the server, with the built-in
  Helvetica and Times fonts, so nothing is downloaded at render time. Thumbnails are
  fetched as explicit 480×360 JPEG stills (react-pdf embeds only JPEG and PNG, and
  `f_auto` could serve WebP), six at a time with a 10-second timeout each; a missing
  image becomes a placeholder rather than failing the PDF. Hyphenation is off.
- **CSV:** `csv-stringify` with a UTF-8 BOM so Excel opens it correctly. Free-text cells
  that start with `= + - @` get a leading `'`, so a caption or note can't run as a
  spreadsheet formula.
- **Share tokens** are 24 random bytes (32 URL-safe characters) stored as-is, so admins
  can copy a link again later. Revoking deletes the row. Expired links return 410 and
  unknown ones 404, so the page can tell people which it is. Every non-GET request under
  `/api/share/:token` returns 405; the token is never a session.
- **The public view shows only report-eligible evidence and ready reports**, without
  uploader names. Reviewer names and notes stay in the annex, because accountable review
  is part of the evidence. It includes "% of all uploads verified automatically", so
  funders see how much evidence needed review or was left out, not only the best of it.
  Responses are `no-store`, and pages and API responses carry `X-Robots-Tag: noindex`.
- **Referrer-Policy is `strict-origin-when-cross-origin`** instead of helmet's
  `no-referrer`. OpenStreetMap blocks tile requests that carry no Referer, and this policy
  sends other sites only our origin, never a path, so share tokens don't leak.
- **Report toasts go to everyone, including the author**, because the author may have
  moved on while the report was being written.
- **Playwright runs 3 workers locally** (`E2E_WORKERS` overrides; CI uses Playwright's
  default) and waits up to 10 s per assertion. Every worker is a full Chromium, and on a
  16 GB laptop that also runs Docker, six of them starved memory and slowed every test.
  Uploads verify and reports render on a real server pipeline, so 10 s also leaves room
  for the Phase 7 runs against a deployed `BASE_URL`.

## Phase 7: hardening, demo data, deploy (2026-09-29)

- **Demo photos are real and freely licensed**, from Wikimedia Commons: scenes of the work,
  not identifiable people. Licences were checked against an allowlist, and each file's
  author and licence are credited in `demo-data/README.md`. CC BY-SA files, including the
  derived near-duplicate, stay CC BY-SA. The photos are committed (about 5 MB), so seeding
  works offline.
- **Demo metadata is written at seed time.** Original EXIF (camera, place, date) is
  stripped. The seed writes a capture date and GPS relative to the day it runs, so the
  timeline, late-upload rule and gap alerts always look like an ongoing project. This is
  stated plainly in the demo README.
- **The seed only uses the public HTTP API** (sign up, signed upload, confirm, review,
  report), so it exercises the real pipeline and works against local, e2e and deployed
  servers alike. It refuses to seed an email that already has an account rather than
  duplicate the organisation.
- **The e2e fake Cloudinary computes a DCT pHash and serves 480 px thumbnails.** Its
  earlier average hash called two different demo photos near-duplicates. The fake should
  behave like the real service wherever a test or a demo depends on it.
- **AI endpoints are rate-limited separately:** 120 requests a minute per user for search
  and upload confirmation, and 10 reports an hour per organisation. These calls cost money
  and share one Gemini quota. Both limits are environment settings.
- **Mutations without their own error handling toast by default** (`MutationCache`).
  Forms that show errors inline opt out with `meta.handlesErrors`. So no failure is
  silent, and none is reported twice.
- **Crashes inside the app are caught per page**: the navigation stays usable, and Reload
  and Back-to-dashboard are offered. After a deploy, a tab that asks for page chunks that
  no longer exist is told to reload rather than shown an error.
- **Performance choices.**
  - Routes load lazily. Charts load after the KPIs.
  - framer-motion isn't loaded app-wide: the dashboard's count-up and glow use
    `requestAnimationFrame` and the Web Animations API.
  - gzip for everything except Server-Sent Events, which would otherwise be buffered.
  - Fonts are self-hosted, with preloaded Latin files at stable URLs.
  - Only the icons are grouped into one chunk. Grouping all UI code was tried and made
    LCP worse, because every page then loaded every component; HTTP/2 makes many small
    chunks cheap in production.
- **Lighthouse ≥ 90 is met on desktop (94) but not on mobile (49).** Reaching 90 on
  throttled mobile would need server-side rendering of the first view, which is out of
  scope for this build. Accessibility is 100 on both.
- **OpenGraph image URLs are made absolute when the page is served**, from `PUBLIC_URL`
  or Render's `RENDER_EXTERNAL_URL`, because crawlers ignore relative `og:image` URLs.
- **Neon over TLS with `sslmode=verify-full`.** `pg` 8.23 treats `require` as
  `verify-full` but prints a security warning, and Neon's certificates are publicly
  trusted. Use the direct (unpooled) connection string: the app keeps its own pool, and
  migrations run on start.
- **`render.yaml` targets Singapore**, the Render region closest to NGOs in India. Secrets
  are marked `sync: false` so Render asks for them, and `JWT_SECRET` is generated.

## Live Gemini behaviour (2026-09-29)

- **Gemini calls retry, then fall back to other models.** The first live run hit "503: this
  model is currently experiencing high demand" on both the vision and report models. The
  SDK's backoff is now switched on (2 attempts per model, jittered, 2 s then up to 8 s;
  30 s per attempt, 120 s for reports). If a model is still over capacity (408, 429, 5xx
  or a timeout), the next model in `GEMINI_VISION_FALLBACK_MODELS` or
  `GEMINI_REPORT_FALLBACK_MODELS` is tried, and each switch is logged. Errors another
  model wouldn't fix, such as a bad request or key, fail straight away.
- **Fallback choices** come from the models this key can use (listed through the API) and
  from which of them answered during the outage: vision falls back to
  `gemini-3.5-flash-lite`, then `gemini-2.5-flash`; reports to `gemini-3.7-flash`, then
  `gemini-2.5-flash`. The primaries stay as documented. The fallbacks are configuration,
  so they can change without a deploy of new code.
- **Tags, captions and search embeddings are added after an upload is scored, not before.**
  The first run of the browser tests against real services failed 4 of 8, because upload
  confirmation waited for Gemini and Gemini was busy. The Trust Score uses none of the AI's
  output (only etag, pHash, EXIF, sites and dates), so confirm now stores and scores the
  file and answers straight away. Tagging, the caption and the embedding follow in the
  background and are saved with an `asset.enriched` event. The live stream carries that
  event so open screens refresh search, evidence and the review queue. The activity feed
  leaves it out, because it is housekeeping, not something a person did. If enrichment
  fails, the file keeps its score and stays untagged, and the error is logged. API tests
  wait for enrichment (`awaitEnrichment`) so their assertions stay simple; one test covers
  the real order with the AI held back. The browser-test server and production don't wait.
