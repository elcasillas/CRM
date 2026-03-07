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
- Account and contact management with deal/HID/contract/note tabs
- AI-generated deal summaries via OpenRouter
- Automated health scoring on every deal (6-component weighted score)
- CSV import from legacy CRM exports
- Admin tools: user management, deal stage config, health score tuning

---

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role — server-only, bypasses RLS |
| `NEXT_PUBLIC_SLACK_TEAM_ID` | No | Slack workspace ID for deep-link buttons |
| `OPENROUTER_API_KEY` | No | Required for AI deal summaries |
| `OPENROUTER_MODEL` | No | Defaults to `anthropic/claude-haiku-4-5` |

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
- **Styling:** Tailwind CSS, light theme (white/gray palette). No UI component library.
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
      health-score-config/route.ts       # GET/PUT config; /recalculate POST
      users/route.ts                     # GET/POST/PATCH/DELETE users (admin only)
    auth/callback/route.ts               # PKCE code exchange
    deals/
      import/route.ts                    # POST: CSV import
      [id]/summarize/route.ts            # GET/POST: AI summary
    invite/route.ts                      # POST: send invite email (admin only)
  dashboard/
    layout.tsx                           # Auth guard + nav shell
    page.tsx                             # Overview dashboard (server)
    deals/
      page.tsx                           # Active deals (server)
      all/page.tsx                       # All deals including closed (server)
      import/page.tsx                    # CSV import UI (client)
      DealsClient.tsx                    # Main deal UI — table/kanban, modals, filters
      types.ts                           # DealFormData, DealsInitialData, DealPageRow
    accounts/
      page.tsx                           # Accounts list + CRUD (client)
      [id]/page.tsx                      # Account detail — tabbed (client)
    admin/
      layout.tsx                         # Admin role guard (server)
      users/page.tsx + users-client.tsx  # User management
      stages/page.tsx                    # Deal stages CRUD
      health-scoring/                    # Health score config UI
  login/page.tsx
components/
  nav-links.tsx          # Top nav with active highlighting, admin section
  global-search.tsx      # Debounced cross-entity search (accounts/deals/HIDs/contacts)
  sign-out-button.tsx
  dashboard/             # stat-card, deals-by-stage, contracts-renewing, recent-activity
lib/
  types.ts               # All shared TypeScript types
  dealCalc.ts            # parseAmount, calcACV, calcTCV
  api-helpers.ts         # assertAdmin()
  supabase/
    client.ts / server.ts / admin.ts
    database.types.ts    # Auto-generated — regenerate after schema changes
supabase/
  migrations/            # Ordered SQL migrations (source of truth for schema)
  seed.sql               # Default deal stages, health score config, sample data
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
| `/dashboard/accounts/[id]` | Client | Tabbed detail: Deals, HIDs, Contacts, Contracts, Notes |
| `/dashboard/admin/users` | Server guard → Client | User list, invite, edit role/name/email/password |
| `/dashboard/admin/stages` | Client | Stage CRUD, sort order, flags |
| `/dashboard/admin/health-scoring` | Client | Weight sliders, keywords, stale_days, new_deal_days |
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
| `/api/deals/import` | POST | Any auth | CSV import (multipart/form-data) |
| `/api/deals/[id]/summarize` | GET | Any auth | Return stored AI summary |
| `/api/deals/[id]/summarize` | POST | Any auth | Generate/cache AI summary |
| `/api/invite` | POST | Admin | Send Supabase invite email |
| `/auth/callback` | GET | — | Exchange PKCE code, redirect to `/dashboard` |

---

## Database Schema

All tables: `user_id uuid references auth.users not null`, RLS enabled.

### `profiles`
Mirrors `auth.users`. Auto-created by `handle_new_user()` trigger.
- `id` uuid PK, `full_name` text, `role` text, `slack_member_id` text
- Roles: `admin` | `sales` | `sales_manager` | `solutions_engineer` | `service_manager` | `read_only`
- All authenticated users can SELECT all profiles (separate policy for name lookups)

### `accounts`
- `account_name`, `status` (`active`|`churned`|`prospect`|`inactive`), `city`, `country`, `description`
- `account_owner_id` FK → profiles, `service_manager_id` FK → profiles
- `last_activity_at` timestamptz

### `contacts`
- `account_id` FK → accounts, `first_name`, `last_name`, `email`, `phone`, `title`

### `hid_records`
- `account_id` FK → accounts, `hid_number`, `domain_name`, `status`, `expiry_date`, `notes`

### `contracts`
- `account_id` FK → accounts, `contract_name`, `entity_name`, `start_date`, `end_date`, `value`, `currency`, `status`

### `deal_stages`
- `stage_name`, `sort_order`, `win_probability` (0–100), `is_closed`, `is_won`, `is_lost`
- `is_won` / `is_lost` automatically set `is_closed = true`
- Default stages (seeded): Initial Conversation, Solution Qualified, Presenting to EDM, Short Listed, Contract Negotiations, Contract Signed, Implementing, **Closed Implemented** (is_closed=true, is_won=true), **Closed Lost** (is_closed=true, is_lost=true)

### `deals`
- `account_id` FK → accounts, `stage_id` FK → deal_stages
- `deal_owner_id` FK → profiles, `solutions_engineer_id` FK → profiles
- `deal_name`, `deal_description`, `currency` (default `'CAD'`), `close_date`
- `amount` numeric — monthly contract amount (user input)
- `contract_term_months` int
- `value_amount` numeric — **ACV** (auto-computed, see calculation rules)
- `total_contract_value` numeric — **TCV** (auto-computed)
- `last_activity_at` timestamptz
- `health_score` smallint (0–100), `health_score_updated_at`
- `ai_summary` text, `ai_summary_generated_at` timestamptz

### `notes`
- `entity_id` uuid, `entity_type` text (`deal`|`account`|`contact`|`hid`|`contract`)
- `note_text`, `created_at` (overridable for CSV import back-dating)

### `deal_stage_history`
- `deal_id`, `stage_id`, `changed_at`, `changed_by` — populated by trigger

### `deal_summary_cache`
- `deal_id`, `content_hash` (SHA-256 of canonical notes), `summary`, `model_tag`
- Cache busted by changing `model_tag` constant (`MODEL_TAG = 'haiku-s1'`)

### `health_score_config`
Single row. `weights` jsonb, `keywords` jsonb (`positive[]`, `negative[]`), `stale_days` int, `new_deal_days` int.

---

## Database Functions & RPCs

### `get_deals_page(p_stale_days, p_active_only)` → table
Main deals query. JOINs deals + accounts + stages + profiles (owner + SE) + lateral last-note aggregation in one round-trip. `p_active_only = true` adds `AND NOT COALESCE(ds.is_closed, false)`.

### `recompute_deal_health_score(p_deal_id)` → void
Computes and stores `health_score` for one deal. See Health Scoring section.

### `recompute_all_deal_health_scores()` → integer
Loops all deals, calls above. Returns count updated.

### `is_admin()` → boolean
Used in RLS policies. Returns true when `auth.uid()` has `role = 'admin'` in profiles.

### `can_view_account(account_id)` → boolean
Returns true for: admin, account_owner_id, service_manager_id.

### `handle_new_user()` trigger
AFTER INSERT on `auth.users` → creates profiles row, role = 'sales'.

### `set_updated_at()` trigger
BEFORE UPDATE on all tables → sets `updated_at = now()`.

### Triggers on `deals`
AFTER INSERT OR UPDATE OF `stage_id, value_amount, close_date, last_activity_at` → calls `recompute_deal_health_score`.
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
Implemented in `lib/dealCalc.ts → calcACV(amount, months?)`. Applied at: deal save (both client components), CSV import, DB migration for backfill.

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
Days since last note ≥ `health_score_config.stale_days` (default 14). Shown as amber badge in deals table.

### New Deal Badge
`created_at` within `health_score_config.new_deal_days` days (default 7). Shown as blue "New" badge.

### Overdue Deal
`close_date` is in the past AND stage is not closed (`is_closed = false`). Shown as red badge.

---

## User Roles & Permissions

| Role | Capabilities |
|---|---|
| `admin` | Everything: manage users/stages/config, delete deals, AI summaries, edit deal owner |
| `sales_manager` | AI summaries, edit deal owner field |
| `sales` | Create/edit own deals, all accounts |
| `solutions_engineer` | Standard access, assigned as SE on deals |
| `service_manager` | Standard access, assigned as service manager on accounts |
| `read_only` | View only |

Role is stored in `profiles.role`. Default on signup: `'sales'`.

Role checks in code:
- `isAdmin = currentUserRole === 'admin'` — delete, admin nav, admin API
- `canEditOwner = isAdmin || isSalesManager` — deal owner field in edit modal
- `canViewSummary = isAdmin || isSalesManager` — AI summary panel

---

## AI Deal Summary

- **Trigger:** "Regenerate AI Summary" in deal edit modal (admin/sales_manager only)
- **API:** `POST /api/deals/[id]/summarize`
- **Model:** `anthropic/claude-haiku-4-5` (override via `OPENROUTER_MODEL`)
- **Caching:** SHA-256 of sorted deduplicated note text → `deal_summary_cache` table. Cache is model-tagged (`MODEL_TAG = 'haiku-s1'`); change this constant to bust all cached summaries.
- **Output format** (enforced by system prompt):
  1. `## Current Status and Client Intent`
  2. `## Key Activities and Communications`
  3. `## Current Blockers`
  4. `## Timeline and Next Steps`
- **Storage:** Summary and generation timestamp written to `deals.ai_summary` / `deals.ai_summary_generated_at`

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
- Only used in `app/api/deals/[id]/summarize/route.ts`

### Slack
- No API calls — deep links only: `slack://user?team=${NEXT_PUBLIC_SLACK_TEAM_ID}&id=${slack_member_id}`
- `slack_member_id` stored in `profiles`, set by admin
- "Slack Owner" button appears in deal summary modal when `slack_member_id` is set

### Supabase Auth
- Email/password + magic link/invite
- PKCE flow for invite links → `/auth/callback`
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

**`DealPageRow`** (`app/dashboard/deals/types.ts`): flat alias for `Database['public']['Functions']['get_deals_page']['Returns'][number]` — used for mapping RPC results to `DealWithRelations`.

**`DealsInitialData`** (`app/dashboard/deals/types.ts`): the full server-to-client prop bundle (deals, stages, accounts, profiles, lastNoteDates, emailMap, staleDays, newDealDays, currentUserId, currentUserRole, isAllDeals).

---

## Navigation

Top nav rendered by `components/nav-links.tsx`:
- Base items: Overview, Accounts, Deals (exact), All Deals (exact)
- Admin items (when `isAdmin`): Stages, Users, Health Scoring

Admin guard: `app/dashboard/admin/layout.tsx` (server component) — non-admins redirected to `/dashboard/accounts`.

Global search (`components/global-search.tsx`): debounced 280ms, searches accounts/deals/hid_records/contacts, keyboard navigable, results link to account detail with `?tab=` param.

---

## Auth Flow

1. **Sign up** → `supabase.auth.signUp()` → trigger creates `profiles` row (role = 'sales')
2. **Sign in** → `supabase.auth.signInWithPassword()` → push to `/dashboard`
3. **Session refresh** → `middleware.ts` on every request; unauthenticated `/dashboard/*` → redirect to `/login`
4. **Invite** → admin calls `POST /api/invite` → Supabase sends email → user clicks link → `/auth/callback?code=...` → `exchangeCodeForSession()` → redirect to `/dashboard`
5. **Sign out** → `SignOutButton` → `supabase.auth.signOut()` → push to `/login`

---

## Database Migrations

Live in `supabase/migrations/`. Applied in filename order via `supabase db push`. Never edit an already-applied migration — add a new one instead.

After any schema change that affects the RPC or table structure, regenerate types:
```bash
supabase gen types typescript --linked 2>/dev/null > lib/supabase/database.types.ts
```

Current migration count: ~18 files through `20260306000009_fix_acv_for_1month_deals.sql`.

---

## Known Issues / Technical Debt

1. **`OPENROUTER_IMAGE_MODEL` env var** is defined in `.env.local.example` but not used anywhere in the codebase — dead config.

2. **`user_id` on `deal_stages`** — stages are global config but have a `user_id` column. The `user_id` is populated as the creating user but has no real ownership semantics; all authenticated users can read stages. This is confusing but harmless.

3. **`fetchDeals` in DealsClient** — post-mutation data refresh calls the `get_deals_page` RPC from the browser client. Since the RPC uses `SECURITY INVOKER`, it respects RLS. If RLS on `deals` is ever tightened to restrict cross-user reads, this will break for sales reps viewing other owners' deals.

4. **`database.types.ts` drift** — if a migration changes the schema or a function signature, this file must be manually regenerated. It is not auto-generated on build.

5. **Health score on import** — deals inserted via CSV import do not have health scores computed immediately (trigger fires but the deal may lack `value_amount` or `close_date` at insert time). An admin "Recalculate All" run after import is recommended.

6. **Currency is display-only** — `deals.currency` is stored and displayed but all ACV/TCV math assumes CAD. No multi-currency conversion logic exists.

7. **No pagination** — deals and accounts are fetched in full. Could become a performance issue at scale.

8. **CLAUDE.md theme mismatch (now fixed)** — earlier versions of this file described a "dark slate palette" theme; the actual UI is a light theme (white/gray).

---

## Open Questions / Assumptions

- **Slack integration scope:** Currently deep-link only. There are `slack_member_id` fields but no Slack API calls (no notifications, no message posting).
- **`read_only` role enforcement:** The role exists in the type system but there is no explicit UI gating for read_only users (no server-side read-only guards beyond RLS). Assumed to be enforced solely at the DB layer via RLS.
- **Multiple accounts per deal:** The schema only allows one `account_id` per deal — deals are single-account.
- **Win probability on stages:** The `win_probability` field is used in health scoring but is not displayed to users in the deal UI — it's set in the stage admin page only.
- **`OPENROUTER_IMAGE_MODEL`:** Purpose unknown. May be reserved for a future feature (e.g., contract image parsing).
