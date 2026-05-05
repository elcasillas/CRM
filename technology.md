# Technology Stack

## Overview

An internal CRM web application for a software company's sales and service teams. Built as a Next.js 15 App Router application with TypeScript, deployed on Coolify via Docker. The frontend uses React server components for data-fetching pages and client components for interactive UIs. Supabase provides the Postgres database, row-level security enforcement, and email/password authentication. Business logic (deal health scoring, ACV/TCV calculations, deal inspection) runs in both PostgreSQL functions and TypeScript utilities. AI-generated deal summaries and 15-point deal inspection reports are produced via the OpenRouter API using Anthropic's Claude model. A Financial Worksheet provides a live multi-currency recurring revenue model using the exchangerate.host API. An Account Health Index (AHI) module tracks partner/account health scores and snapshots. There is no separate backend server — all server-side logic runs in Next.js route handlers and server components.

---

## Languages

| Language | Version | Usage |
|---|---|---|
| TypeScript | 5.9.3 | All application code — pages, components, API routes, utilities |
| SQL (PostgreSQL) | 15 (Supabase-managed) | Migrations, RPCs, triggers, RLS policies |
| CSS | — | Tailwind utility classes + minimal global CSS (`app/globals.css`) |

TypeScript config targets `ES2017`, strict mode enabled, `moduleResolution: bundler`.

---

## Frontend

| Technology | Version | Notes |
|---|---|---|
| React | 18.3.1 | UI rendering; server components (RSC) + client components |
| Next.js | 15.5.12 | App Router; server-side rendering, route handlers, middleware |
| Tailwind CSS | 3.4.19 | All styling — utility classes only, no custom CSS framework |
| PostCSS | 8.5.6 | Tailwind processing pipeline |
| Autoprefixer | 10.4.24 | Vendor prefix injection via PostCSS |

**UI approach:** No component library (no shadcn, Radix, MUI, etc.). All UI components are hand-built with Tailwind. Light theme (white/gray palette). No charting library — the pipeline bar chart on the Overview page is pure CSS/Tailwind.

**State management:** No Redux, Zustand, or Context API for global state. Each client component manages its own local `useState` with grouped state objects. Data flows from server components as typed props.

**Routing:** Next.js App Router file-based routing. Path aliases configured as `@/*` → root.

---

## Backend

| Technology | Version | Notes |
|---|---|---|
| Next.js Route Handlers | 15.5.12 | Serverless API endpoints under `app/api/` |
| Node.js | 24.13.1 (local) | Runtime for Next.js dev server and build |
| Supabase JS SDK | 2.97.0 | Client for all DB queries, auth, and RPC calls |
| @supabase/ssr | 0.5.2 | Cookie-based session management for Next.js SSR |

**API routes** (`app/api/`):
- `/api/admin/users` — user management (admin only)
- `/api/admin/health-score-config` — health score config read/write + recalculate trigger
- `/api/admin/inspection-config` — inspection check severity/enabled config (admin only)
- `/api/admin/dc-cluster-mappings` — DC Location → Cluster ID mappings CRUD (admin only)
- `/api/admin/partner-health-config` — partner health config read/write + recalculate (admin only)
- `/api/deals/import` — CSV import with server-side parsing
- `/api/deals/[id]/summarize` — AI deal summary generation and retrieval
- `/api/deals/[id]/inspect` — 15-point deal inspection run and retrieval
- `/api/deals/[id]/compose-email` — AI-generated targeted manager email
- `/api/exchange-rate` — proxy to exchangerate.host; monthly in-process cache
- `/api/partners` — partner list and creation
- `/api/partners/[id]` — partner read/update/delete
- `/api/partners/[id]/metrics` — partner metrics read/write
- `/api/products/import` — products CSV import
- `/api/invite` — Supabase invite email dispatch
- `/auth/callback` — PKCE code exchange for invite links

**Middleware** (`middleware.ts`): Runs on every non-static request. Refreshes session cookies via `@supabase/ssr`. Handles auth redirects (unauthenticated → `/login`, authenticated at `/login` → `/dashboard`).

**No ORM.** All queries use the Supabase JS client's query builder (PostgREST-based) and named RPC calls directly.

---

## Database / Storage

| Technology | Version / Plan | Notes |
|---|---|---|
| PostgreSQL | 15 (Supabase-managed) | Primary datastore — all business data |
| Supabase | Cloud (linked project) | Hosts Postgres, Auth, Storage, realtime |
| Row Level Security (RLS) | — | Enforced on every table via Postgres policies |

**Schema managed via:** `supabase/migrations/` — ordered SQL files, applied with `supabase db push`. 48 migrations to date.

**Key tables:** `profiles`, `accounts`, `contacts`, `contact_roles`, `hid_records`, `contracts`, `deal_stages`, `deals`, `notes`, `deal_stage_history`, `deal_summary_cache`, `health_score_config`, `inspection_config`, `products`, `dc_cluster_mappings`, `partners`, `partner_metrics`, `partner_health_snapshots`, `partner_health_config`, `partner_ai_summaries`.

**Key Postgres functions:**
- `get_deals_page()` — main deals query RPC (joins 5 tables + lateral aggregation; includes `region`, `deal_type`)
- `recompute_deal_health_score(deal_id)` — 6-component health score computation
- `recompute_all_deal_health_scores()` — bulk recalculation
- `get_partners_page()` — AHI list query RPC
- `handle_new_user()` — trigger: creates `profiles` row on auth user creation
- `is_admin()`, `can_view_account()` — RLS helper functions

**Caching:** `deal_summary_cache` table caches AI-generated deal summaries keyed on SHA-256 hash of canonical note content + model tag. Exchange rates are cached monthly: in-process memory in the route handler (reset on cold start) and `localStorage` in the browser (`fw_fx_cache` key). No Redis cache.

**File storage:** None. CSV files are parsed in memory within the import route handler and discarded — no file persistence.

**Type generation:** `lib/supabase/database.types.ts` is auto-generated from the live schema via `supabase gen types typescript --linked`. Must be re-run after schema changes.

---

## Infrastructure & DevOps

| Service | Usage |
|---|---|
| Coolify | Hosting — Docker container, automatic HTTPS |
| GitHub | Source control; `master` branch auto-deploys to Coolify via integration |
| Supabase Cloud | Managed Postgres + Auth; migrations applied separately from deploys |
| Supabase CLI | 2.75.0 — local development, migration management, type generation |

**Deployment flow:**
1. Push to `master` → Coolify builds Docker image and deploys
2. DB migrations applied independently: `supabase db push` (Coolify does not run migrations)

**Environment config:** `.env.local` for local dev. Production env vars set in Coolify service environment panel. See `.env.local.example` for the full list (Supabase keys, OpenRouter, Slack team ID, exchangerate.host API key).

**Build constraints:** `node_modules` are Windows-native. `npm run build` and `npm run lint` must be run from a Windows terminal, not WSL. `supabase` CLI commands work from WSL.

**Docker:** `next.config.ts` sets `output: 'standalone'`. The multi-stage `Dockerfile` at the repo root produces the production image.

**No CI pipeline** (GitHub Actions, CircleCI, etc.). Quality gate is `npm run build` passing locally before merge.

---

## External Services & Integrations

| Service | Purpose | Auth Method |
|---|---|---|
| Supabase Auth | Email/password authentication, invite emails, PKCE flow | Built into Supabase SDK |
| OpenRouter | AI deal summaries, 15-point inspection, manager email generation | `Authorization: Bearer` header (`OPENROUTER_API_KEY`) |
| Anthropic Claude (via OpenRouter) | LLM for summaries, inspection checks, email drafts | Accessed through OpenRouter; model: `anthropic/claude-haiku-4-5` (override via `OPENROUTER_MODEL`) |
| exchangerate.host | CAD conversion rates for Financial Worksheet | `EXCHANGERATE_API_KEY`; proxied via `/api/exchange-rate` (never exposed to browser) |
| Slack | Deep-link to user profiles (`slack://user?team=...`) | No API calls; `NEXT_PUBLIC_SLACK_TEAM_ID` env var only |
| Coolify | Build, deploy, CDN | GitHub integration, auto-deploy on push |

**OpenRouter integration detail:** `POST https://openrouter.ai/api/v1/chat/completions`. Model configurable via `OPENROUTER_MODEL` env var. Summary responses cached in `deal_summary_cache` table; cache busted by changing the `MODEL_TAG` constant in the summarize route. Claude models via OpenRouter do not support `response_format: { type: 'json_object' }` — JSON is extracted from markdown-fenced responses using an `extractJSON()` helper.

**exchangerate.host integration detail:** `GET http://api.exchangerate.host/live` — USD-based quotes. Rate to CAD is derived as `USDCAD / USDx`. Monthly cache: in-process variable in the route handler (persists across requests in the Docker container) + `localStorage` in the browser (`fw_fx_cache`). Falls back to stale localStorage cache if the API is unreachable.

**No analytics, no error tracking** (no Sentry, Datadog, PostHog, etc.) currently integrated.

---

## Development Tools

| Tool | Version | Purpose |
|---|---|---|
| ESLint | 8.57.1 | Linting — configured via `eslint-config-next` |
| eslint-config-next | 15.5.12 | Next.js-specific lint rules (React, accessibility, etc.) |
| TypeScript compiler | 5.9.3 | Type checking (`tsc --noEmit` via `next build`) |
| Supabase CLI | 2.75.0 | Migration management, type generation, local DB |
| `npx serve` | — | Serves `tests/` directory on port 8423 for browser-based tests |

**No Prettier.** No formatter configured.

**No Jest/Vitest.** The `tests/` directory contains a browser-based fixture/integration test harness served by `npx serve`. No unit test runner.

**No Husky/lint-staged.** No pre-commit hooks configured.

---

## Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `next` | 15.5.12 | Full-stack React framework — App Router, server components, route handlers, middleware |
| `react` / `react-dom` | 18.3.1 | UI rendering — server and client components |
| `@supabase/supabase-js` | 2.97.0 | Supabase client — DB queries (PostgREST), auth, RPC calls |
| `@supabase/ssr` | 0.5.2 | Cookie-based Supabase session management for Next.js SSR/middleware |
| `typescript` | 5.9.3 | Static typing across entire codebase |
| `tailwindcss` | 3.4.19 | Utility-first CSS framework — all UI styling |
| `postcss` | 8.5.6 | CSS processing pipeline (required by Tailwind) |
| `autoprefixer` | 10.4.24 | Adds vendor prefixes to generated CSS |
| `eslint` | 8.57.1 | Code linting |
| `eslint-config-next` | 15.5.12 | Next.js ESLint ruleset |
