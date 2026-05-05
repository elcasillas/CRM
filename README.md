# CRM

An internal sales CRM built with Next.js 15, Supabase, and Tailwind CSS. Features accounts, contacts, deal pipeline with health scoring, AI deal inspection, products catalog, financial worksheet, account health index, and an admin panel.

**Production:** hosted on Coolify

---

## Recent Updates

| Date | Change |
|------|--------|
| 2026-03-18 | Fixed CSV import: deduplicated notes on re-import, fixed URL length bug on large imports, fixed `value_amount`/TCV being dropped when Amount has CAD/USD prefix |
| 2026-03-18 | Financial Worksheet: Contract Term in Assumptions drives TCV; dynamic currency symbol in Unit Price column |
| 2026-03-18 | RLS: added explicit SELECT policies on config tables; tightened `products_insert` policy |
| 2026-03-17 | Financial Worksheet: dynamic product rows, spread-as-%, 2dp normalization, monthly exchange rate caching with localStorage stale fallback |
| 2026-03-17 | Deal Stages moved into Settings page — removed standalone Stages nav item |
| 2026-03-17 | DC Location / Cluster ID admin management in Settings; dependent dropdowns on HID record forms |
| 2026-03-17 | Unsaved changes protection across all CRM forms (modal-level dirty state) |
| 2026-03-17 | Extracted shared `DealDetailsModal` component; fixed missing Slack button |
| 2026-03-16 | Financial Worksheet page — live CAD/USD/MXN conversion, product line items, assumptions |
| 2026-03-16 | Products page — manual add, inline edit modal, CSV import, delete |
| 2026-03-16 | Deal Details: eye icon opens deal summary panel; Region and Type of Deal fields added; MXN currency support |
| 2026-03-16 | Contact roles — multiple roles per contact (migration `20260316000001`) |
| 2026-03-14 | Account Health Index (AHI) — refactored from Partners module; queries Accounts table directly |
| 2026-03-12 | Partner Health Index module added (Phase 1) — partner metrics, scoring RPCs, snapshots, AI summaries |
| 2026-03-09 | AI Deal Inspection — 15-point quality check (6 structured + 9 LLM checks), weighted score, Email Owner generation (migration `20260309000001`) |
| 2026-03-06 | AI deal summary caching — SHA-256 of notes → `deal_summary_cache` table keyed on `(deal_id, notes_hash, model)` |
| 2026-03-06 | ACV / TCV computed fields (`value_amount`, `total_contract_value`) stored on deals; backfilled via migration |
| 2026-03-06 | `entity_name` added to contracts; `is_active_only` filter added to `get_deals_page` RPC |
| 2026-03-06 | `new_deal_days` config added to `health_score_config`; "New" badge in deals table |
| 2026-03-05 | Health score computation moved to Postgres — `recompute_deal_health_score(uuid)` + triggers on `notes` and `deals`; removed `/api/deals/[id]/health-score` and `lib/deal-health-score.ts` |
| 2026-03-05 | Deals page uses `get_deals_page` Postgres RPC — one round-trip for deals + joins + last-note aggregation |
| 2026-03-05 | Configurable stale deal threshold in Health Scoring admin page |
| 2026-03-05 | AI summary switched from Anthropic direct to OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`) |
| 2026-03-05 | Deal Owner and Service Manager dropdowns filtered by role in modals |
| 2026-03-04 | Email Owner, Slack Owner (deep link), and Copy Info buttons in deal summary modal |
| 2026-03-04 | Stale deals (30+ days) tagged with amber pill; Health Scoring admin page |
| 2026-03-04 | Slack Member ID field on user profiles |

---

## Tech Stack

| Layer       | Technology                                           |
|-------------|------------------------------------------------------|
| Framework   | Next.js 15 (App Router, server + client components)  |
| Database    | Supabase (PostgreSQL 15)                             |
| Auth        | Supabase Auth — email/password + admin invite flow   |
| Security    | Row Level Security (RLS) on every table              |
| Styling     | Tailwind CSS v3                                      |
| Language    | TypeScript (strict)                                  |
| AI          | OpenRouter (`anthropic/claude-haiku-4-5` default)    |
| Deployment  | Coolify (Docker)                                     |

---

## Local Development

### 1. Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)

### 2. Clone and install

```bash
git clone https://github.com/elcasillas/CRM.git
cd CRM
npm install
```

> **Note:** `node_modules` are Windows-native. Run `npm run dev`, `npm run build`, and `npm run lint` from a **Windows terminal**, not WSL.

### 3. Environment variables

Copy the example and fill in your values:

```bash
cp .env.local.example .env.local
```

| Variable                        | Where to find it                                             |
|---------------------------------|--------------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase Dashboard → Project Settings → API → Project URL   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → anon public   |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase Dashboard → Project Settings → API → service_role  |
| `NEXT_PUBLIC_SLACK_TEAM_ID`     | Slack workspace ID for owner deep-link buttons (optional)    |
| `OPENROUTER_API_KEY`            | https://openrouter.ai/keys (required for AI features)        |
| `OPENROUTER_MODEL`              | OpenRouter model ID (default: `anthropic/claude-haiku-4-5`) |

> **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.** It is only used in server-side API routes (`app/api/`).

### 4. Apply migrations

```bash
supabase db push
```

Migrations in `supabase/migrations/` (applied in filename order):

| File | Description |
|------|-------------|
| `20260220000004_schema_v2.sql` | Full schema — all tables, triggers, RLS policies, 9 default deal stages |
| `20260223000001_add_account_description.sql` | `description` column on `accounts` |
| `20260223000002_add_solutions_engineer_to_deals.sql` | `solutions_engineer_id` on `deals` |
| `20260223000003_fix_solutions_engineer_fk.sql` | Re-points FK to `public.profiles` |
| `20260224000001_deal_health_and_summary.sql` | Health score + AI summary columns on `deals` |
| `20260304000001_add_solutions_engineer_role.sql` | `solutions_engineer` role |
| `20260304000002_health_score_config.sql` | `health_score_config` table |
| `20260304000005_add_sales_manager_role.sql` | `sales_manager` role |
| `20260304000006_add_slack_member_id.sql` | `slack_member_id` on `profiles` |
| `20260305000001_add_stale_days_to_health_score_config.sql` | `stale_days` config |
| `20260305000002_get_deals_page.sql` | `get_deals_page()` RPC |
| `20260305000003_recompute_deal_health_score.sql` | Health score recompute function + triggers |
| `20260306000001_add_new_deal_days.sql` | `new_deal_days` config + "New" badge |
| `20260306000002_add_ai_summary_to_deals.sql` | `deal_summary_cache` table |
| `20260306000004_add_deal_value_fields.sql` | `value_amount` (ACV) + `total_contract_value` (TCV) on `deals` |
| `20260306000005_backfill_deal_value_fields.sql` | Backfills ACV/TCV for existing deals |
| `20260306000006_add_entity_name_to_contracts.sql` | `entity_name` on `contracts` |
| `20260306000008_rpc_active_only.sql` | `p_active_only` filter on `get_deals_page` |
| `20260309000001_add_deal_inspection.sql` | Deal inspection columns + `inspection_config` table |
| `20260310000001_fix_function_search_paths.sql` | Security: explicit search paths on all functions |
| `20260312000001–000010` | Account Health Index / Partner module tables, RPCs, snapshots |
| `20260316000001_add_contact_roles.sql` | Multiple roles per contact |
| `20260317000001_add_deal_region_type.sql` | `region` + `type_of_deal` fields on `deals` |
| `20260317000002_create_products.sql` | `products` table |
| `20260317000003_add_dc_cluster_mappings.sql` | DC Location / Cluster ID admin mappings |
| `20260318000001_fix_products_insert_rls.sql` | Tighten products INSERT policy |
| `20260318000002_add_config_rls_policies.sql` | Explicit SELECT on config tables |
| `20260318000003_deduplicate_notes.sql` | Remove duplicate notes; add unique constraint |

Earlier files (`000001`–`000003`) are superseded by `000004` and can be skipped on a fresh environment.

### 5. Seed sample data

Open `supabase/seed.sql`, replace the placeholder UUID with your own user ID:

```sql
v_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- replace this
```

Find your user ID in **Supabase Dashboard → Authentication → Users**.

Then run the file in the SQL editor. The script is idempotent — safe to re-run.

The seed creates: 5 accounts, 6 contacts, 4 HID records, 3 contracts, 7 deals across stages, and 6 notes. The seed user is granted the `admin` role.

### 6. Run the dev server

```bash
npm run dev
```

Open http://localhost:3000. Sign in with your email and password at `/login`.

---

## Coolify Deployment

### Environment variables

Set all variables from `.env.local.example` in the **Coolify service → Environment Variables** panel (Production environment):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SLACK_TEAM_ID
OPENROUTER_API_KEY
OPENROUTER_MODEL
EXCHANGERATE_API_KEY
```

### Deploy

Connect Coolify to the GitHub repo (`ed-casillas-projects/crm`) and enable auto-deploy on push to `master`. The Dockerfile at the repo root builds a Next.js standalone image.

DB migrations are not run automatically — apply them separately:

```bash
supabase db push
```

### Supabase Auth redirect URL

In **Supabase Dashboard → Authentication → URL Configuration**, add your Coolify app domain as an allowed redirect URL:

```
https://your-coolify-domain/**
```

---

## Architecture

### Database schema

| Table                | Purpose                                                               |
|----------------------|-----------------------------------------------------------------------|
| `profiles`           | One row per auth user; stores `full_name`, `role`, `slack_member_id` |
| `accounts`           | Company records; includes `account_owner_id`, `service_manager_id`, `description`, `status` |
| `contacts`           | People linked to accounts; supports multiple roles per contact        |
| `hid_records`        | HID/cluster records linked to accounts                                |
| `contracts`          | Contracts with renewal dates and `entity_name`                        |
| `deal_stages`        | Ordered pipeline stages with won/lost/closed flags                    |
| `deals`              | Opportunities; includes health score, inspection, ACV/TCV, region, type |
| `deal_stage_history` | Audit log of every stage change on a deal                             |
| `deal_summary_cache` | Cached AI summaries keyed on `(deal_id, notes_hash, model)`          |
| `notes`              | Polymorphic notes (account, deal, contact, contract, hid)             |
| `products`           | Product catalog with `product_name`, `unit_price`, `product_code`    |
| `health_score_config` | Single-row: health score weights, keywords, stale/new-deal thresholds |
| `inspection_config`  | Single-row: inspection check severity and enabled flags               |
| `dc_cluster_mappings` | Admin-managed DC Location → Cluster ID mappings for HID records      |

### User roles

| Role                  | Access                                                       |
|-----------------------|--------------------------------------------------------------|
| `admin`               | Full access; manage users, reassign owners, edit all records, tune health scoring and inspection |
| `sales`               | Owns accounts and deals; standard CRM access                 |
| `sales_manager`       | Can reassign Deal Owner; AI summaries + inspection           |
| `solutions_engineer`  | Assigned to deals as SE; standard CRM access                 |
| `service_manager`     | Assigned to accounts; standard CRM access                    |
| `read_only`           | View-only access (enforced at DB/RLS layer)                  |

### RLS approach

Every table has RLS enabled. SECURITY DEFINER helper functions avoid N+1 policy checks:

- `is_admin(uid)` — true if `profiles.role = 'admin'`
- `can_view_account(uid, account_id)` — true if user owns or manages the account, or is admin
- `can_view_note_entity(uid, entity_type, entity_id)` — resolves to account access

### Auth flow

1. User enters email + password at `/login` → `supabase.auth.signInWithPassword()`
2. Session cookie set by `middleware.ts` on every request
3. `app/dashboard/layout.tsx` checks session server-side; redirects to `/login` if missing
4. `profiles` row is auto-created by a DB trigger on first sign-in (role defaults to `sales`)
5. Admins can invite users via `/dashboard/admin/users` → invite email → PKCE callback at `/auth/callback`

### Key calculations

**ACV (`value_amount`):**
- `contract_term_months = 1` → ACV = amount × 1 (single-month, not annualised)
- `contract_term_months > 1` → ACV = amount × 12 (annualised monthly rate)
- `contract_term_months` unset → ACV = amount × 12 (default)

**TCV (`total_contract_value`):** `amount × contract_term_months`

**Health Score (0–100):** Six weighted components — stage probability (25%), velocity (20%), activity recency (15%), close date integrity (10%), ACV (15%), notes keyword signal (15%). Computed in Postgres by `recompute_deal_health_score()`.

**Inspection Score (0–100):** 15 checks (6 structured, 9 LLM-based). Weights: critical = 3, medium = 2, low = 1. Status `pass` = full weight, `weak`/`stale` = 40%, `missing`/`mismatch` = 0%.

---

## Testing

A browser-based golden-file test harness covers core utility functions and business logic.

### Run the harness

```bash
npm test
# → open http://localhost:8423/test-harness.html
```

### Test suites

| Suite | What it tests |
|-------|---------------|
| 01 – Currency Formatting | `formatCurrency()` across ranges (null, $0, $5k, $1.5M, invalid) |
| 02 – Date Formatting | `fmtDate()` and `formatClose()` for various date strings |
| 03 – Relative Time | `formatRelative()` with a fixed reference date (deterministic) |
| 04 – Deal Filtering | Search + stage filter combos via `filterDeals()` |
| 05 – Account Filtering | Search + status filter combos via `filterAccounts()` |
| 06 – Stage ACV Totals | `stageTotal()` with nulls, zeros, and multi-deal stages |

### Regenerate golden files

```bash
node tests/fixtures/generate-golden.js
```

Or click **Download golden files** in the browser UI.

---

## Smoke Test Checklist

Follow these steps on a freshly seeded environment to verify core functionality.

### Authentication
- [ ] Go to `/login`, enter email and password, sign in
- [ ] Confirm you land on `/dashboard` and the nav shows your name

### Dashboard (Overview)
- [ ] Stat cards show non-zero values (accounts, open deals, etc.)
- [ ] "Deals by Stage" table shows stages with counts and bars
- [ ] "Contracts Renewing Soon" shows upcoming renewals
- [ ] "Recent Deal Activity" lists seeded deals

### Accounts
- [ ] `/dashboard/accounts` lists accounts with Owner and Service Manager columns
- [ ] Search filters correctly; clear resets the list
- [ ] Click **+ New account**, fill in name, save — row appears
- [ ] Click an account name → detail tabs (Contacts, HIDs, Contracts, Deals, Notes) all load
- [ ] Add a note on the Notes tab; confirm it appears immediately
- [ ] Edit the account → changes persist on reload

### Deals
- [ ] `/dashboard/deals` loads in Table view with a "Deal Owner" column
- [ ] Switch to **Kanban** view — SE name appears on cards where assigned
- [ ] Click the eye icon next to a deal name → Deal Details modal opens with AI summary panel
- [ ] Change a deal's stage via the inline dropdown
- [ ] Click **Edit** on a deal → modal shows Deal Owner, SE, ACV, TCV, Region, Type fields
- [ ] Add an activity note in the edit modal; confirm it saves
- [ ] Click **+ New deal**, fill required fields, save

### Products
- [ ] `/dashboard/products` lists products with name, code, and unit price
- [ ] Click **+ Add Product**, fill in name and price, save — row appears
- [ ] Click edit icon on a product → inline modal; update price, save
- [ ] Import products via CSV drag-and-drop

### Financial Worksheet
- [ ] Open a deal → Financial Worksheet tab (or navigate to the worksheet page)
- [ ] Add a product line item; verify live CAD/USD/MXN conversion
- [ ] Set Contract Term in Assumptions; verify TCV updates

### Global Search
- [ ] Type in the header search → accounts/deals/HIDs/contacts appear in groups
- [ ] Click a result → navigates to the correct account with the right tab active
- [ ] Press Esc → dropdown closes

### Admin — Settings (admin account required)
- [ ] `/dashboard/admin/health-scoring` shows Health Score weights and Inspection check config
- [ ] Deal Stages section is present on the Settings page (no longer a separate nav item)
- [ ] DC Location / Cluster ID mappings can be added and deleted
- [ ] Edit a stage name → change persists
- [ ] Adjust a health score weight → recalculate all → scores update

### Admin — Users (admin account required)
- [ ] `/dashboard/admin/users` lists all profiles with role badges
- [ ] Edit a user → can change name, email, role, Slack member ID, and password
- [ ] Invite a new user → invite email sent; user lands on `/dashboard` after clicking link

### Security
- [ ] Sign out, confirm redirect to `/login`
- [ ] Attempt to navigate directly to `/dashboard` → redirected to `/login`
- [ ] (Non-admin account) navigate to `/dashboard/admin/users` → redirected away
