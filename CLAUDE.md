# CLAUDE.md

Single source of truth for the AI-powered CRM codebase. Keep this file up to date as the project evolves.

---

## Common Commands

```bash
npm run dev        # dev server at localhost:3000 (run from Windows terminal)
npm run build      # production build — must pass before merging (Windows terminal)
npm run lint       # ESLint (Windows terminal)

supabase db push   # apply pending migrations to remote Supabase project (WSL OK)
supabase gen types typescript --linked 2>/dev/null > lib/supabase/database.types.ts
```

> **Important:** `node_modules` are Windows-native. `npm run build` and `npm run lint` must be run from a **Windows terminal**, not WSL. `supabase` CLI commands work fine from WSL.

`SUPABASE_ACCESS_TOKEN` is set in `~/.bashrc`. Project is already linked; no re-linking needed.

---

## Project Overview

An internal CRM for a software company's sales and service teams. Built with **Next.js 15 App Router**, **TypeScript**, **Tailwind CSS**, and **Supabase** (Postgres + Auth).

Key capabilities:
- Deal pipeline management (table + kanban views, active vs. all deals)
- Account and contact management with deals/HIDs/contracts/contacts/notes tabs
- Products catalog with CSV import and inline editing
- Financial Worksheet — organic recurring revenue model with live multi-currency conversion
- Account Health Index (AHI) — partner/account health scoring and snapshots
- AI-generated deal summaries via OpenRouter
- Automated health scoring on every deal (6-component weighted score)
- AI deal inspection — 15-point quality check grading deal completeness and qualitative signals
- AI-generated targeted manager emails driven by inspection gaps
- CSV import from legacy CRM exports
- Admin tools: user management, deal stage config, health score and inspection tuning, DC/cluster mappings

---

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role — server-only, bypasses RLS |
| `NEXT_PUBLIC_SLACK_TEAM_ID` | No | Slack workspace ID for deep-link buttons |
| `OPENROUTER_API_KEY` | No | Required for AI summaries, inspection, and email generation |
| `OPENROUTER_MODEL` | No | Defaults to `anthropic/claude-haiku-4-5` |
| `EXCHANGERATE_API_KEY` | No | exchangerate.host API key for Financial Worksheet currency conversion |

Copy `.env.local.example` → `.env.local`. Same vars must be set in the Vercel project dashboard.

---

## Deployment

- **Hosting:** Vercel — project `ed-casillas-projects/crm`
- **Auto-deploy:** pushes to `master` deploy automatically via GitHub integration
- **Manual deploy:** `vercel --prod`
- **DB migrations:** applied separately with `supabase db push` — Vercel deploys do not run migrations
- **Auth redirects:** Supabase dashboard → Authentication → URL Configuration must include the Vercel domain

---

## Architecture

### Stack
- **Framework:** Next.js 15 App Router — server components by default
- **Styling:** Tailwind CSS, light theme (white/gray palette; `brand-700` navy for modal headers). No UI component library.
- **Backend:** Supabase — Postgres, Auth, RLS, RPCs
- **AI:** OpenRouter API (`anthropic/claude-haiku-4-5` default)

### Supabase Client Selection

| Context | File | Key Used |
|---|---|---|
| `'use client'` component | `lib/supabase/client.ts` | anon |
| Server component / route handler (reads) | `lib/supabase/server.ts` | anon + cookies |
| Route handler (privileged mutations) | `lib/supabase/admin.ts` | service role |

`middleware.ts` refreshes the session cookie on every request — do not remove.

### Pattern: Server → Client Data Flow
Server page fetches data → assembles typed `InitialData` bundle → passes as prop to `'use client'` component. All mutations happen in the client component using the browser Supabase client (RLS-protected).

### Non-Negotiables
1. Supabase Postgres is the system of record — no client-side state as source of truth
2. RLS enforces data access — never rely solely on client-side filtering for security
3. No serverful dependencies — Vercel Edge/serverless only
4. Mutations in `api/admin/*` and `api/invite` require the admin client; never expose the service role key to the browser

---

## Directory Structure

```
app/
  api/
    admin/
      health-score-config/route.ts          # GET/PUT config; /recalculate POST
      inspection-config/route.ts            # GET/PUT inspection check definitions (admin only)
      users/route.ts                        # GET/POST/PATCH/DELETE users (admin only)
      dc-cluster-mappings/route.ts          # GET/POST/PATCH DC Location → Cluster ID mappings (admin only)
      partner-health-config/route.ts        # GET/PUT partner health config; /recalculate POST (admin only)
    auth/callback/route.ts                  # PKCE code exchange
    deals/
      import/route.ts                       # POST: CSV import
      [id]/
        summarize/route.ts                  # GET/POST: AI summary
        inspect/route.ts                    # GET/POST: 15-point deal inspection
        compose-email/route.ts              # POST: AI-generated targeted manager email
    exchange-rate/route.ts                  # GET: proxy to exchangerate.host; monthly server + localStorage cache
    partners/
      route.ts                              # GET/POST partners (any auth; POST requires admin or sales_manager)
      [id]/
        route.ts                            # GET/PATCH/DELETE a partner
        metrics/route.ts                    # GET/POST partner metrics
    invite/route.ts                         # POST: send invite email (admin only)
    products/
      import/route.ts                       # POST: CSV import for products (any auth)
  dashboard/
    layout.tsx                              # Auth guard + nav shell (displays full_name or email)
    page.tsx                                # Overview dashboard (server)
    deals/
      page.tsx                              # Active deals (server)
      all/page.tsx                          # All deals including closed (server)
      import/page.tsx                       # CSV import UI (client)
      DealsClient.tsx                       # Main deal UI — table/kanban, modals, filters, AI features
      types.ts                              # DealFormData, DealsInitialData, DealPageRow
    accounts/
      page.tsx                              # Accounts list + CRUD (client)
      [id]/page.tsx                         # Account detail — tabs: Deals/HIDs/Contacts/Contracts/Notes (client)
    products/
      page.tsx                              # Products list, inline edit, add, delete (client)
      import/page.tsx                       # CSV import UI for products (client)
    partners/
      page.tsx                              # Account Health Index (AHI) list (client) — uses PartnersClient
      [id]/page.tsx                         # AHI detail page (client)
    financial-worksheet/
      page.tsx                              # Organic recurring revenue model with live currency conversion (client)
    admin/
      layout.tsx                            # Admin role guard (server) — non-admins → /dashboard/accounts
      users/page.tsx + users-client.tsx     # User management
      stages/page.tsx                       # Deal stages CRUD (also embedded in health-scoring Settings page)
      health-scoring/
        page.tsx                            # "Settings" nav item — renders health scoring, inspection, stages, DC/cluster
        health-scoring-client.tsx           # Health score weights, keywords, thresholds
      inspection/
        page.tsx                            # Standalone route (not in nav, accessible by URL)
        inspection-client.tsx               # Inspection check config — also embedded in health-scoring/page.tsx
      partner-health/
        page.tsx                            # Partner Health admin config (client)
  login/page.tsx
components/
  nav-links.tsx          # Top nav with active highlighting, admin section
  global-search.tsx      # Debounced 280ms cross-entity search (accounts/deals/HIDs/contacts)
  sign-out-button.tsx
  dashboard/             # stat-card, deals-by-stage, contracts-renewing, recent-activity
lib/
  types.ts               # All shared TypeScript types
  dealCalc.ts            # parseAmount, calcACV, calcTCV
  deal-summarize.ts      # AI summary: buildCanonical, sha256Hex, callSummarizeLLM, getOrCreateSummary
  deal-inspect.ts        # Inspection engine: DEFAULT_CHECKS, runInspection, computeScore, topMissingChecks
  api-helpers.ts         # assertAdmin()
  supabase/
    client.ts / server.ts / admin.ts
    database.types.ts    # Auto-generated — regenerate after schema changes
supabase/
  migrations/            # 28 ordered SQL migrations (source of truth for schema)
  seed.sql               # Default deal stages, health score config, sample accounts/deals/notes
tests/                   # Browser-based test harness (npx serve on port 8423)
middleware.ts
```

---

## Pages & Routes

| Route | Component Type | Purpose |
|---|---|---|
| `/` | Server | Redirects: auth → `/dashboard`, unauth → `/login` |
| `/login` | Client | Email/password sign-in and sign-up |
| `/dashboard` | Server | Overview: stat cards, pipeline chart, renewing contracts, recent activity |
| `/dashboard/deals` | Server → Client | Active deals only (`p_active_only: true`). Table + kanban. |
| `/dashboard/deals/all` | Server → Client | All deals including closed. `isAllDeals: true`. |
| `/dashboard/deals/import` | Client | Drag-and-drop CSV upload with preview |
| `/dashboard/accounts` | Client | Accounts list, filter/sort, full CRUD |
| `/dashboard/products` | Client | Products list, CSV import, add, inline edit, delete |
| `/dashboard/products/import` | Client | Drag-and-drop CSV import for products |
| `/dashboard/accounts/[id]` | Client | Tabbed detail: Deals, HIDs, Contacts, Contracts, Notes |
| `/dashboard/partners` | Client | Account Health Index (AHI) list |
| `/dashboard/partners/[id]` | Client | AHI detail page |
| `/dashboard/financial-worksheet` | Client | Organic recurring revenue model — ARPU, MRR, ACV, TCV with live currency conversion |
| `/dashboard/admin/users` | Server guard → Client | User list, invite, edit role/name/email/password/slack_id |
| `/dashboard/admin/stages` | Client | Stage CRUD (also embedded in Settings page) |
| `/dashboard/admin/health-scoring` | Client | **"Settings"** — health score config + inspection config + deal stages + DC/cluster mappings |
| `/dashboard/admin/partner-health` | Client | Partner Health config — category weights, thresholds, stale days |
| `/auth/callback` | Route handler | PKCE exchange after invite link |

---

## API Routes

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/admin/users` | GET | Admin | List all auth users |
| `/api/admin/users` | POST | Admin | Create user + profile |
| `/api/admin/users` | PATCH | Admin | Update role/name/email/password/slack_id |
| `/api/admin/users` | DELETE | Admin | Delete user (blocks self-deletion) |
| `/api/admin/health-score-config` | GET/PUT | Admin | Read/write health score config |
| `/api/admin/health-score-config/recalculate` | POST | Admin | Recalculate all deal scores |
| `/api/admin/inspection-config` | GET | Admin | Return merged inspection config (DB overrides + DEFAULT_CHECKS) |
| `/api/admin/inspection-config` | PUT | Admin | Upsert inspection config (severity, enabled flags) |
| `/api/admin/dc-cluster-mappings` | GET | Admin | List DC Location → Cluster ID mappings |
| `/api/admin/dc-cluster-mappings` | POST | Admin | Create new mapping |
| `/api/admin/dc-cluster-mappings` | PATCH | Admin | Update or toggle-active a mapping |
| `/api/admin/partner-health-config` | GET/PUT | Admin | Read/write partner health config |
| `/api/admin/partner-health-config/recalculate` | POST | Admin | Recalculate all partner health scores |
| `/api/exchange-rate` | GET | Any auth | Proxy to exchangerate.host; monthly in-process + localStorage cache |
| `/api/partners` | GET | Any auth | List partners for dropdowns |
| `/api/partners` | POST | admin/sales_manager | Create a partner |
| `/api/partners/[id]` | GET/PATCH/DELETE | Any auth | Read/update/delete a partner |
| `/api/partners/[id]/metrics` | GET/POST | Any auth | Read/write partner metrics |
| `/api/deals/import` | POST | Any auth | CSV import (multipart/form-data) |
| `/api/products/import` | POST | Any auth | CSV import for products (multipart/form-data) |
| `/api/deals/[id]/summarize` | GET | Any auth | Return stored AI summary |
| `/api/deals/[id]/summarize` | POST | Any auth | Generate/cache AI summary |
| `/api/deals/[id]/inspect` | GET | Any auth | Return stored inspection result |
| `/api/deals/[id]/inspect` | POST | Any auth | Run 15-point deal inspection; persist to DB |
| `/api/deals/[id]/compose-email` | POST | Any auth | Generate targeted manager email using inspection gaps |
| `/api/invite` | POST | Admin | Send Supabase invite email |
| `/auth/callback` | GET | — | Exchange PKCE code, redirect to `/dashboard` |

---

## Database Schema

All tables: RLS enabled. `created_at` / `updated_at` on all tables via `set_updated_at()` trigger.

### `profiles`
Mirrors `auth.users`. Auto-created by `handle_new_user()` trigger.
- `id` uuid PK, `full_name` text, `role` text, `slack_member_id` text
- Roles: `admin` | `sales` | `sales_manager` | `solutions_engineer` | `service_manager` | `read_only`
- All authenticated users can SELECT all profiles (name lookups for dropdowns)

### `accounts`
- `account_name`, `account_website`, `address_line1`, `address_line2`, `city`, `region`, `postal`, `country`
- `status` (`active`|`churned`|`prospect`|`inactive`), `description`
- `account_owner_id` FK → profiles, `service_manager_id` FK → profiles
- `last_activity_at` timestamptz

### `products`
- `product_name` text NOT NULL, `unit_price` numeric (default 0), `product_code` text NULL
- All authenticated users: SELECT + INSERT. Admin only: UPDATE + DELETE.
- CSV import via `POST /api/products/import`; deduplicates by `LOWER(TRIM(product_name))`

### `contacts`
- `account_id` FK → accounts, `first_name`, `last_name`, `email`, `phone`, `title`
- `is_primary` boolean
- Multiple roles per contact stored in a separate `contact_roles` join table (migration `20260316000001`)

### `hid_records`
- `account_id` FK → accounts, `hid_number` (unique), `domain_name`, `dc_location`, `cluster_id`, `start_date`
- `status`, `expiry_date`, `notes`

### `contracts`
- `account_id` FK → accounts, `contract_name`, `entity_name`
- `effective_date`, `renewal_date` date, `renewal_term_months` int, `auto_renew` boolean
- `value` numeric, `currency` text, `status` (`active`|`expired`|`cancelled`)

### `deal_stages`
- `stage_name` (unique), `sort_order`, `win_probability` (0–100), `is_closed`, `is_won`, `is_lost`
- `is_won` / `is_lost` automatically set `is_closed = true`
- **Default stages (seeded):** Initial Conversation, Solution Qualified, Presenting to EDM, Short Listed, Contract Negotiations, Contract Signed, Implementing, **Closed Implemented** (is_won=true), **Closed Lost** (is_lost=true)

### `deals`
- `account_id` FK → accounts, `stage_id` FK → deal_stages
- `deal_owner_id` FK → profiles, `solutions_engineer_id` FK → profiles
- `deal_name`, `deal_description`, `currency` (default `'CAD'`), `close_date`, `region`, `deal_type`
- `amount` numeric — monthly contract amount (user input)
- `contract_term_months` int
- `value_amount` numeric — **ACV** (auto-computed via `calcACV`)
- `total_contract_value` numeric — **TCV** (auto-computed via `calcTCV`)
- `last_activity_at` timestamptz
- **Health score:** `health_score` smallint (0–100), `health_score_updated_at`, individual component columns: `hs_stage_probability`, `hs_velocity`, `hs_activity_recency`, `hs_close_date`, `hs_acv`, `hs_notes_signal`, `health_debug` jsonb
- **AI summary:** `ai_summary` text, `ai_summary_generated_at` timestamptz
- **Inspection:** `inspection_score` smallint (0–100), `inspection_run_at` timestamptz, `inspection_result` jsonb (`{ checks[], score, runAt }`)
- `notes_hash` text — SHA-256 of canonical notes (used by summary cache lookup)

### `notes`
- `entity_id` uuid, `entity_type` text (`deal`|`account`|`contact`|`hid`|`contract`)
- `note_text`, `created_at` (overridable for CSV import back-dating)

### `deal_stage_history`
- `deal_id`, `from_stage_id`, `to_stage_id`, `changed_at`, `changed_by` — populated by trigger on stage change

### `deal_summary_cache`
- `deal_id`, `notes_hash` (SHA-256 of canonical notes), `summary`, `model` (model tag string)
- Unique on `(deal_id, notes_hash, model)` — bust cache by changing `MODEL_TAG = 'haiku-s1'` in `lib/deal-summarize.ts`

### `health_score_config`
Single row. `weights` jsonb, `keywords` jsonb (`positive[]`, `negative[]`), `stale_days` int (default 30), `new_deal_days` int (default 7).

### `inspection_config`
Single row, same pattern as `health_score_config`.
- `checks` jsonb — array of `{ id, label, severity, enabled }` overriding DEFAULT_CHECKS
- Seeded with 15 default check definitions on migration `20260309000001`

### `dc_cluster_mappings`
Admin-managed lookup table for HID record dependent dropdowns.
- `dc_location` text (uppercase), `cluster_id` text (lowercase), `is_active` boolean
- Unique on `(dc_location, cluster_id)`. Managed via Settings page and `GET/POST/PATCH /api/admin/dc-cluster-mappings`.

### `partners` (Account Health Index)
- `partner_name`, `partner_type`, `tier`, `status`, `region`, `country`, `website`, `description`
- `account_id` FK → accounts, `account_manager_id` FK → profiles
- Related tables: `partner_metrics`, `partner_health_snapshots`, `partner_health_config`, `partner_ai_summaries`
- Scored via `get_partners_page` RPC; health config tunable via `/dashboard/admin/partner-health`

---

## Database Functions & RPCs

### `get_deals_page(p_stale_days, p_active_only)` → table
Main deals query. JOINs deals + accounts + stages + profiles (owner + SE) + lateral last-note aggregation. Returns all health score component columns, `last_note_at`, computed `is_stale` and `is_overdue` flags. `p_active_only = true` excludes closed stages.

### `recompute_deal_health_score(p_deal_id)` → void
Computes and stores `health_score` + all component columns for one deal.

### `recompute_all_deal_health_scores()` → integer
Loops all deals, calls above. Returns count updated.

### `is_admin(uid uuid)` → boolean
SECURITY DEFINER. Used in RLS policies. Must be called as `is_admin(auth.uid())`.

### `can_view_account(uid uuid, account_id uuid)` → boolean
Returns true for: admin, account_owner_id, service_manager_id.

### `handle_new_user()` trigger
AFTER INSERT on `auth.users` → creates profiles row with `role = 'sales'`.

### `set_updated_at()` trigger
BEFORE UPDATE on all tables → sets `updated_at = now()`.

### Triggers on `deals`
AFTER INSERT OR UPDATE OF `(stage_id, value_amount, close_date, last_activity_at)` → calls `recompute_deal_health_score`.
AFTER UPDATE OF `stage_id` → inserts into `deal_stage_history`.

### Triggers on `notes`
AFTER INSERT/UPDATE/DELETE (where `entity_type = 'deal'`) → calls `recompute_deal_health_score`.

---

## Business Rules & Calculations

### ACV (`value_amount`)
```
contract_term_months = 1  →  ACV = amount × 1   (single-month, not annualised)
contract_term_months > 1  →  ACV = amount × 12  (annualised monthly rate)
contract_term_months unset →  ACV = amount × 12  (default)
```
Implemented in `lib/dealCalc.ts → calcACV(amount, months?)`. Applied at: deal save, CSV import, DB migration backfill.

### TCV (`total_contract_value`)
```
TCV = amount × contract_term_months
```
`lib/dealCalc.ts → calcTCV(amount, months)`. 0/null if either is missing.

### Health Score (0–100)
Six weighted components (all configurable in `health_score_config.weights`):

| Component | Default Weight | Description |
|---|---|---|
| `stageProbability` | 25 | `win_probability / 100` |
| `velocity` | 20 | Days in current stage vs expected; 0 if > 3× expected |
| `activityRecency` | 15 | Days since `last_activity_at`; 0 if ≥ `stale_days` |
| `closeDateIntegrity` | 10 | 100 if close date set and in future; 0 otherwise |
| `acv` | 15 | Logarithmic scale: `LN(value_amount/1000+1) / LN(101)` |
| `notesSignal` | 15 | Keyword match in notes from last 30 days |

`ROUND(SUM(component × weight))` clamped to 0–100. Stored in `deals.health_score`.

Default positive keywords: `signed`, `approved`, `committed`, `verbal`, `contract sent`, `po received`, `moving forward`, `decision made`, `champion`, `executive sponsor`, `renewal confirmed`

Default negative keywords: `stalled`, `lost`, `no budget`, `cancelled`, `delayed`, `ghosting`, `paused`, `not interested`, `competitor`, `no response`, `churn risk`

### Stale Deal
Days since last note ≥ `health_score_config.stale_days` (default 30). Shown as amber badge in deals table.

### New Deal Badge
`created_at` within `new_deal_days` days (default 7). Shown as blue "New" badge.

### Overdue Deal
`close_date` is in the past AND stage is not closed (`is_closed = false`). Shown as red badge.

---

## User Roles & Permissions

| Role | Capabilities |
|---|---|
| `admin` | Everything: manage users/stages/config, delete deals, AI features, edit deal owner |
| `sales_manager` | AI summaries + inspection, edit deal owner field |
| `sales` | Create/edit own deals, all accounts |
| `solutions_engineer` | Standard access, assigned as SE on deals |
| `service_manager` | Standard access, assigned as service manager on accounts |
| `read_only` | View only (enforced at DB/RLS layer) |

Role is stored in `profiles.role`. Default on signup: `'sales'`.

Role checks in code:
- `isAdmin = currentUserRole === 'admin'`
- `canEditOwner = isAdmin || isSalesManager`
- `canViewSummary = isAdmin || isSalesManager`

---

## AI Deal Summary

- **Trigger:** "Regenerate AI Summary" in deal summary panel (admin/sales_manager only)
- **API:** `POST /api/deals/[id]/summarize`
- **Shared library:** `lib/deal-summarize.ts` — `getOrCreateSummary()` is reused by `runInspection()` to ensure a summary exists before LLM qualitative checks run
- **Model:** `anthropic/claude-haiku-4-5` (override via `OPENROUTER_MODEL`)
- **Caching:** SHA-256 of sorted deduplicated note text → `deal_summary_cache` table keyed on `(deal_id, notes_hash, model)`. Change `MODEL_TAG = 'haiku-s1'` in `lib/deal-summarize.ts` to bust all cached summaries.
- **Output format** (enforced by system prompt, four sections always present):
  1. `## Current Status and Client Intent`
  2. `## Key Activities and Communications`
  3. `## Current Blockers`
  4. `## Timeline and Next Steps`
- **Storage:** `deals.ai_summary` / `deals.ai_summary_generated_at`
- **Returns null** if deal has no notes

---

## AI Deal Inspection

A 15-point deal quality check combining structured field checks and LLM-based qualitative evaluation.

### How It Works
1. Structured checks (programmatic, no LLM) evaluate 6 field-based criteria
2. `getOrCreateSummary()` is called to ensure an AI summary exists before LLM checks
3. LLM checks (OpenRouter) evaluate 9 qualitative criteria using the AI summary + 5 most recent notes
4. Results merged, weighted score computed (0–100), persisted to `deals` table

### Structured Checks (programmatic — no LLM)
| ID | Severity | What it checks |
|---|---|---|
| `stage_valid` | critical | `stage_id` is set |
| `close_date_credible` | critical | `close_date` present and in future |
| `amount_reasonable` | critical | `amount > 0` |
| `contract_term` | medium | `contract_term_months` set |
| `acv_tcv_aligned` | medium | Both `value_amount` and `total_contract_value` computed |
| `recent_update` | medium | Last activity/note within `stale_days` |

### LLM Checks (qualitative — evaluated against AI summary + notes)
| ID | Severity | What it evaluates |
|---|---|---|
| `next_step_defined` | critical | Clear next action documented |
| `next_step_owner` | medium | Next step owner named |
| `next_step_date` | medium | Date set for next step |
| `decision_process` | critical | Customer buying process described |
| `economic_buyer` | critical | Decision maker identified |
| `business_problem` | medium | Use case or problem defined |
| `blockers_documented` | medium | Risks or blockers noted |
| `customer_intent` | critical | Commitment level assessed |
| `implementation_target` | low | Rollout timeline noted |

### Scoring
- Weights: critical = 3, medium = 2, low = 1
- Status values: `pass` (full weight), `weak`/`stale` (40% weight), `missing`/`mismatch` (0%)
- Score = `ROUND(earned_weight / total_weight × 100)`

### Storage
- `deals.inspection_score` (0–100)
- `deals.inspection_run_at` (timestamp)
- `deals.inspection_result` jsonb (`{ checks[], score, runAt }`)

### Configuration
- Stored in `inspection_config` table
- Admins can enable/disable checks and tune severity via Settings page (`/dashboard/admin/health-scoring`)
- Config is merged with `DEFAULT_CHECKS` on each run; disabled checks are skipped
- Stale threshold: the compose-email route re-runs inspection if `inspection_run_at` > 2h ago (`STALE_INSPECTION_HOURS = 2`, hardcoded)

### Key Files
- `lib/deal-inspect.ts` — inspection logic, types, scoring, `topMissingChecks()`
- `app/api/deals/[id]/inspect/route.ts` — GET (stored result) / POST (run + persist)
- `app/api/admin/inspection-config/route.ts` — GET/PUT config
- `app/dashboard/admin/inspection/inspection-client.tsx` — config UI (also rendered inside health-scoring page)

---

## Email Owner Feature

Generates a targeted AI manager email asking the deal owner about the top missing/weak inspection items.

### Flow
```
User clicks "Email Owner"
  → emailStatus = 'checking'
  → Ensure AI summary exists (POST /summarize if needed) → emailStatus = 'summarizing'
  → Ensure inspection exists (POST /inspect if none or > 2h stale) → emailStatus = 'inspecting'
  → POST /compose-email → emailStatus = 'emailing'
      reads inspection_result from DB
      extracts top 6 non-passing checks ordered by severity (topMissingChecks)
      builds targeted email prompt with gap questions
      returns { subject, body, inspection }
  → window.open("mailto:...")
  → emailStatus = 'idle'
```

### Email Format
- Direct, professional, plain text, under 160 words
- Opens: "Hi [FirstName],"
- One context sentence referencing the deal name
- 3–6 dash-separated questions derived from top inspection gaps (critical first)
- Closing: brief request to update deal record or reply before next review
- Sign-off: "Thanks"

### Fallback
If compose-email returns an error, the client falls back to a deterministic template: subject "Deal Update: [deal_name]", generic body mentioning days since last update and close date.

### OpenRouter JSON Parsing Note
Claude models via OpenRouter do not support `response_format: { type: 'json_object' }` (OpenAI-specific). Both `callInspectionLLM` and `compose-email` use an `extractJSON(text)` helper that strips markdown code fences before calling `JSON.parse()`.

---

## CSV Import

**Endpoint:** `POST /api/deals/import` (any authenticated user)

**Expected columns** (header row auto-detected in first 20 rows):

| Column | Notes |
|---|---|
| `Deal Name` | Required. Deduplication key. |
| `Deal Owner` | Required. Matched to `profiles.full_name`. |
| `Account Name` | Optional. Auto-creates account if not found. |
| `Stage` | Optional. Matched by `stage_name`. |
| `Annual Contract Value` | Used for CAD/USD/EUR detection only. |
| `Amount` | Numeric monthly amount. |
| `Contract Term (months)` | Integer. |
| `Total Contract Value` | If present, stored directly; else computed. |
| `Closing Date` | Parsed to date. |
| `Note Content` | Appended as note. |
| `Description` | Deal description. |
| `Modified Time (Notes)` | Sets note `created_at` for back-dating. |

**Skip conditions:**
- Deal Owner name > 100 chars or > 5 words
- ACV field contains 'USD' or 'EUR'

**Deduplication:**
- Deals: `LOWER(TRIM(deal_name))` + `account_id` — match → append new notes only
- Notes: exact `note_text` match against existing notes for that deal

**Account resolution:** CSV name → exact case-insensitive lookup → auto-create if missing → fallback to `account_id` form field.

**Returns:** `{ inserted, existing, skipped }`

---

## External Integrations

### OpenRouter (AI)
- Base URL: `https://openrouter.ai/api/v1/chat/completions`
- Auth: `Authorization: Bearer ${OPENROUTER_API_KEY}`
- Used in: `lib/deal-summarize.ts`, `lib/deal-inspect.ts`, `app/api/deals/[id]/compose-email/route.ts`
- **Do NOT use `response_format: { type: 'json_object' }`** — OpenAI-specific, breaks Claude via OpenRouter. Use `extractJSON()` helper to parse markdown-wrapped JSON responses.

### Slack
- No API calls — deep links only: `slack://user?team=${NEXT_PUBLIC_SLACK_TEAM_ID}&id=${slack_member_id}`
- `slack_member_id` stored in `profiles`, set by admin
- "Slack Owner" button appears in deal summary modal when `slack_member_id` is set

### Supabase Auth
- Email/password + invite link (PKCE flow)
- Sessions managed via cookies using `@supabase/ssr`

---

## Key Types (`lib/types.ts`)

```typescript
type UserRole = 'admin' | 'sales' | 'sales_manager' | 'solutions_engineer' | 'service_manager' | 'read_only'
type NoteEntityType = 'deal' | 'account' | 'contact' | 'hid' | 'contract'

// Table row aliases (generated)
type Account = Tables<'accounts'>
type Deal    = Tables<'deals'>
type DealStage = Tables<'deal_stages'>
type Note    = Omit<Tables<'notes'>, 'entity_type'> & { entity_type: NoteEntityType }
type Profile = Omit<Tables<'profiles'>, 'role'> & { role: UserRole }

// Join types (hand-written)
interface DealWithRelations extends Deal {
  accounts: { account_name: string } | null
  deal_stages: Pick<DealStage, 'stage_name'|'sort_order'|'is_closed'|'is_won'|'is_lost'> | null
  deal_owner: { full_name: string|null } | null
  solutions_engineer: { full_name: string|null } | null
}
interface AccountWithOwners extends Account {
  account_owner: { full_name: string|null; email: string|null } | null
  service_manager: { full_name: string|null; email: string|null } | null
}
```

**Inspection types** (`lib/deal-inspect.ts`):
```typescript
interface InspectionCheckDef { id: string; label: string; severity: 'critical'|'medium'|'low'; enabled: boolean }
interface CheckResult { id, label, status: 'pass'|'missing'|'weak'|'stale'|'mismatch', explanation, question: string|null, severity }
interface InspectionResult { checks: CheckResult[]; score: number; runAt: string }
```

**`DealPageRow`** (`app/dashboard/deals/types.ts`): flat alias for `get_deals_page` RPC return type — includes all health score components, `last_note_at`, `is_stale`, `is_overdue`.

**`DealsInitialData`** (`app/dashboard/deals/types.ts`): full server-to-client prop bundle (deals, stages, accounts, profiles, lastNoteDates, emailMap, staleDays, newDealDays, currentUserId, currentUserRole, isAllDeals).

---

## Navigation

Top nav rendered by `components/nav-links.tsx`:

**Base items (all authenticated users):**
- Overview → `/dashboard` (exact match)
- Accounts → `/dashboard/accounts`
- Products → `/dashboard/products`
- AHI → `/dashboard/partners`
- Deals → `/dashboard/deals` (exact match)
- All Deals → `/dashboard/deals/all` (exact match)
- Worksheet → `/dashboard/financial-worksheet` (exact match)

**Admin items (when `isAdmin`):**
- Users → `/dashboard/admin/users`
- Settings → `/dashboard/admin/health-scoring` (hosts health score config, inspection config, deal stages, DC/cluster mappings)
- Partner Health → `/dashboard/admin/partner-health`

Note: Stages are no longer a standalone nav item — Stage CRUD is embedded in the Settings page. The `/dashboard/admin/stages` route still exists as a standalone page.

Header displays user's `full_name` from profiles; falls back to email if `full_name` is not set.

Admin guard: `app/dashboard/admin/layout.tsx` (server component) — non-admins redirected to `/dashboard/accounts`.

Global search (`components/global-search.tsx`): debounced 280ms, searches accounts/deals/hid_records/contacts, keyboard navigable, results link to account detail with `?tab=` param.

---

## Modal Styling Convention

All modal headers use a consistent pattern across the app:
- Container: `flex items-center justify-between px-6 py-4 bg-brand-700 rounded-t-xl`
- Title: `font-semibold text-white`
- Close button: `text-white/70 hover:text-white text-lg leading-none`
- All modal titles use **Title Case**
- The `Modal` component in `app/dashboard/accounts/[id]/page.tsx` is a shared shell covering 5 modals; standalone modals in other files replicate the same pattern inline

---

## Auth Flow

1. **Sign up** → `supabase.auth.signUp()` → trigger creates `profiles` row (role = 'sales')
2. **Sign in** → `supabase.auth.signInWithPassword()` → push to `/dashboard`
3. **Session refresh** → `middleware.ts` on every request; unauthenticated `/dashboard/*` → redirect to `/login`
4. **Invite** → admin calls `POST /api/invite` → Supabase sends email → user clicks link → `/auth/callback?code=...` → `exchangeCodeForSession()` → redirect to `/dashboard`
5. **Sign out** → `SignOutButton` → `supabase.auth.signOut()` → push to `/login`

---

## Database Migrations

48 applied migrations in `supabase/migrations/`, named `YYYYMMDD######_description.sql`. Applied in filename order via `supabase db push`. Never edit an already-applied migration — add a new one instead.

Latest migration: `20260318000003_deduplicate_notes.sql`

After any schema change affecting RPCs or table structure, regenerate types:
```bash
supabase gen types typescript --linked 2>/dev/null > lib/supabase/database.types.ts
```

---

## Known Issues / Technical Debt

1. **`user_id` on `deal_stages`** — stages are global config but have a `user_id` column with no real ownership semantics. Confusing but harmless.

2. **`fetchDeals` in DealsClient** — post-mutation data refresh calls `get_deals_page` from the browser client (SECURITY INVOKER). If RLS on `deals` is tightened to restrict cross-user reads, this will break for sales reps viewing other owners' deals.

3. **`database.types.ts` drift** — not auto-generated on build; must be manually regenerated after schema changes.

4. **Health score on import** — CSV-imported deals may have zero health scores immediately because the trigger fires before `value_amount` or `close_date` are fully set. Run admin "Recalculate All" after import.

5. **Currency is display-only on deals** — `deals.currency` is stored and displayed but ACV/TCV math assumes CAD. The Financial Worksheet handles live multi-currency conversion independently.

6. **No pagination** — deals and accounts are fetched in full. Will become a performance issue at scale.

7. **Inspection stale threshold hardcoded** — `STALE_INSPECTION_HOURS = 2` in `compose-email/route.ts` is not configurable via admin UI.

8. **Inspection LLM fallback inflates urgency** — if `callInspectionLLM` fails (API key missing, network error), all 9 qualitative checks are marked `missing`, which drives an overly urgent email.

9. **`/dashboard/admin/inspection` not in nav** — `inspection-client.tsx` is embedded in the Settings page, but the `/inspection` URL still works as a standalone route. This could be confusing.

10. **Financial Worksheet is stateless** — no save/load for worksheet inputs. Each session starts fresh. Data is not persisted to Supabase.

11. **`EXCHANGERATE_API_KEY` hardcoded fallback** — `exchange-rate/route.ts` has a hardcoded API key as a fallback if the env var is unset. Should be removed before open-sourcing.

---

## Open Questions / Assumptions

- **Slack integration scope:** Deep-link only. No Slack API calls. `slack_member_id` must be set manually by admin.
- **`read_only` role enforcement:** Exists in the type system but no explicit UI gating beyond RLS. Enforced solely at the DB layer.
- **Multiple accounts per deal:** Schema allows only one `account_id` per deal — deals are single-account.
- **`win_probability` on stages:** Used in health scoring but not displayed in the deal UI. Set in stage admin only.
- **Inspection staleness (2h):** Hardcoded in `compose-email/route.ts`. Not configurable. May need to be surfaced in admin Settings.
- **Seed data user dependency:** `supabase/seed.sql` requires a `v_user_id` UUID substitution to insert properly; not self-contained for fresh environments without that substitution.
- **`notes_hash` column on `deals`:** Written during summary generation. Not currently used for anything else, but available for cache lookup optimization.
