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
