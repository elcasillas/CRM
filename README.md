# CRM

A sales CRM built with Next.js 15, Supabase, and Tailwind CSS. Features accounts, contacts, deal pipeline with stage history, contracts, HID records, global search, and an admin panel.

**Production:** https://crm-six-roan.vercel.app

---

## Recent Updates

| Date | Change |
|------|--------|
| 2026-03-05 | Health score computation moved to Postgres — `recompute_deal_health_score(uuid)` function + triggers on `notes` and `deals`; removed `/api/deals/[id]/health-score` route and `lib/deal-health-score.ts` (migration `20260305000003`) |
| 2026-03-05 | Deals page uses `get_deals_page` Postgres RPC — merges deals+joins and last-note aggregation into one round-trip (migration `20260305000002`) |
| 2026-03-05 | Removed unused `/api/users` and `/api/settings` routes — data now fetched server-side in the Deals server component |
| 2026-03-05 | Collapsed 18 individual `useState` hooks in `DealsClient` into 3 grouped objects (`filters`, `ui`, `notes`) with typed setter helpers and `useMemo` for derived data |
| 2026-03-05 | Refactored Deals page into server component + `DealsClient` — all initial data fetched server-side, eliminating client-side loading spinner |
| 2026-03-05 | Configurable stale deal threshold — set in Health Scoring admin page, stored in DB, applied dynamically in Deals table |
| 2026-03-05 | AI summary switched from Anthropic direct to OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL` env vars) |
| 2026-03-05 | Deal Owner and Service Manager dropdowns now filtered by role (sales / service_manager) in Account and Deal modals |
| 2026-03-05 | Deal Owner dropdown in Edit Deal Modal restricted to `sales` role users |
| 2026-03-05 | Removed "Joined" column from Admin Users table |
| 2026-03-05 | Fixed Health Score recalculate error — switched from `upsert` to `update` to avoid NOT NULL constraint violation on `account_id` |
| 2026-03-04 | Added Slack Member ID field to user profiles (migration, admin API, admin UI) |
| 2026-03-04 | Deal Summary modal: Email Owner, Slack Owner (deep link), and Copy Info buttons in footer |
| 2026-03-04 | Stale deals (30+ days since last note) tagged with amber pill in Days Since column; Stale and Overdue summary cards act as clickable filters |
| 2026-03-04 | Owner summary cards now calculate Avg Days from last note date instead of `last_activity_at` |
| 2026-03-04 | Deal Owner column moved to first position in Deals table |
| 2026-03-04 | Added Deal Description field to Edit Deal Modal |
| 2026-03-04 | Solutions Engineer dropdown filtered to `solutions_engineer` role only; Deal Owner editing restricted to admin/sales_manager |
| 2026-03-04 | Health Score settings page (`/dashboard/admin/health-scoring`) — tune weights and keywords, recalculate all deals |
| 2026-03-04 | Deal Summary modal (clipboard icon) — shows deal info, AI summary, last 3 notes with email/Slack/copy actions |

---

## Tech Stack

| Layer       | Technology                                           |
|-------------|------------------------------------------------------|
| Framework   | Next.js 15 (App Router, server + client components)  |
| Database    | Supabase (PostgreSQL 15)                             |
| Auth        | Supabase Auth — magic link + admin invite flow       |
| Security    | Row Level Security (RLS) on every table              |
| Styling     | Tailwind CSS v3                                      |
| Language    | TypeScript (strict)                                  |
| Deployment  | Vercel                                               |

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
| `OPENROUTER_API_KEY`            | https://openrouter.ai/keys                                   |
| `OPENROUTER_MODEL`              | OpenRouter model ID for deal summaries (e.g. `anthropic/claude-haiku-4-5`) |
| `OPENROUTER_IMAGE_MODEL`        | OpenRouter model ID for image tasks (e.g. `anthropic/claude-haiku-4-5`) |

> **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.** It is only used in server-side API routes (`app/api/`).

### 4. Apply migrations

Run migrations in order via the Supabase CLI:

```bash
supabase db push
```

Migrations in `supabase/migrations/`:

| File | Description |
|------|-------------|
| `20260220000004_schema_v2.sql` | Full schema — all tables, triggers, RLS policies, 8 default deal stages |
| `20260223000001_add_account_description.sql` | Adds `description` column to `accounts` |
| `20260223000002_add_solutions_engineer_to_deals.sql` | Adds `solutions_engineer_id` to `deals` |
| `20260223000003_fix_solutions_engineer_fk.sql` | Re-points FK to `public.profiles` |
| `20260304000001_deal_health_score.sql` | Adds health score columns to `deals` |
| `20260304000002_health_score_config.sql` | Adds `health_score_config` table for admin-tunable weights and keywords |
| `20260304000006_add_slack_member_id.sql` | Adds `slack_member_id` column to `profiles` |
| `20260305000001_add_stale_days_to_health_score_config.sql` | Adds `stale_days` column to `health_score_config` (default 30) |
| `20260305000002_get_deals_page.sql` | Adds `get_deals_page()` RPC — combines deals+joins and last-note aggregation in one query |
| `20260305000003_recompute_deal_health_score.sql` | Adds `recompute_deal_health_score(uuid)` function + `recompute_all_deal_health_scores()` + triggers on `notes` and `deals` |

Earlier files (`000001`–`000003`) are superseded by `000004` and can be skipped.

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

Open http://localhost:3000. Sign in with a magic link at `/login`.

---

## Vercel Deployment

### Environment variables

Add the same three variables in **Vercel Dashboard → Project → Settings → Environment Variables** (Production environment):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

### Deploy

Pushes to `master` auto-deploy via the Vercel GitHub integration. To deploy manually:

```bash
vercel --prod
```

### Supabase Auth redirect URL

In **Supabase Dashboard → Authentication → URL Configuration**, add your Vercel domain as an allowed redirect URL:

```
https://your-project.vercel.app/**
```

---

## Architecture

### Database schema

| Table                | Purpose                                                               |
|----------------------|-----------------------------------------------------------------------|
| `profiles`           | One row per auth user; stores `full_name`, `role`, and `slack_member_id` |
| `accounts`           | Company records; includes `account_owner_id`, `service_manager_id`, and `description` |
| `contacts`           | People linked to accounts                                             |
| `hid_records`        | HID/cluster records linked to accounts                                |
| `contracts`          | Contracts with renewal dates                                          |
| `deal_stages`        | Ordered pipeline stages with won/lost/closed flags                    |
| `deals`              | Opportunities; includes `deal_owner_id` and `solutions_engineer_id`   |
| `deal_stage_history` | Audit log of every stage change on a deal                             |
| `notes`              | Polymorphic notes (account, deal, contact, contract, hid)             |

### User roles

| Role                  | Access                                                       |
|-----------------------|--------------------------------------------------------------|
| `admin`               | Full access; can manage users, reassign owners, edit all records, tune health scoring |
| `sales`               | Owns accounts and deals; standard CRM access                 |
| `sales_manager`       | Can reassign Deal Owner; standard CRM access                 |
| `solutions_engineer`  | Assigned to deals as SE; standard CRM access                 |
| `service_manager`     | Assigned to accounts; standard CRM access                    |
| `read_only`           | View-only access                                             |

### RLS approach

Every table has RLS enabled. Three SECURITY DEFINER helper functions avoid N+1 policy checks:

- `is_admin(uid)` — true if `profiles.role = 'admin'`
- `can_view_account(uid, account_id)` — true if user owns or manages the account, or is admin
- `can_view_note_entity(uid, entity_type, entity_id)` — resolves to account access

### Auth flow

1. User enters email at `/login` → Supabase sends a magic link
2. Magic link redirects to `/auth/callback` → session cookie set by middleware
3. `app/dashboard/layout.tsx` checks session server-side; redirects to `/login` if missing
4. `profiles` row is auto-created by a DB trigger on first sign-in
5. Admins can create and manage users via `/dashboard/admin/users`

### Types

Hand-written TypeScript interfaces in `lib/types.ts` mirror the database schema. All Supabase query results are cast to these types. The service-role admin client lives in `lib/supabase/admin.ts` and is only imported by server-side code.

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

Run this whenever utility logic changes intentionally:

```bash
node tests/fixtures/generate-golden.js
```

Or click **Download golden files** in the browser UI to export updated baselines.

---

## Smoke Test Checklist

Follow these steps on a freshly seeded environment to verify core functionality in ~10 minutes.

### Authentication
- [ ] Go to `/login`, enter your email, receive magic link, click it
- [ ] Confirm you land on `/dashboard` and the nav shows your email

### Dashboard (Overview)
- [ ] Stat cards show non-zero values (5 accounts, 6 deals open, etc.)
- [ ] "Deals by Stage" table shows all 8 stages with counts and bars
- [ ] "Contracts Renewing Soon" shows Gamma Inc (renews 2026-03-15) in the ≤30d bucket
- [ ] "Recent Deal Activity" lists the 7 seeded deals

### Accounts
- [ ] `/dashboard/accounts` lists 5 accounts with Owner and Service Manager columns
- [ ] Search "Acme" filters to 1 result; clear resets the list
- [ ] Filter by "Active" shows all 5; "Churned" shows 0
- [ ] Click **+ New account**, fill in name and Service Manager, save — row appears
- [ ] Click an account name → detail card shows Owner, SM, and description field
- [ ] Click the description area → textarea appears; save a description
- [ ] Switch tabs: Contacts, HIDs, Contracts, Deals, Notes all load
- [ ] Add a note on the Notes tab; confirm it appears immediately
- [ ] Edit the account → changes persist on reload

### Deals
- [ ] `/dashboard/deals` loads in Table view with 7 seeded deals and a "Deal Owner" column
- [ ] Switch to **Kanban** view — SE name appears on cards where assigned
- [ ] Change a deal's stage via the inline dropdown in Table view
- [ ] Click **Edit** on a deal → modal shows Deal Owner, Solutions Engineer, ACV fields
- [ ] Add an activity note in the edit modal; confirm it saves
- [ ] Click **+ New deal**, fill required fields including SE, save
- [ ] Delete the test deal

### Global search
- [ ] Type "Acme" in the header search → Accounts group appears
- [ ] Type "HID-10001" → HID Records group appears; click → navigates to Acme with HIDs tab active
- [ ] Type "alice@" → Contacts group appears; click → navigates to Acme with Contacts tab active
- [ ] Press Esc → dropdown closes

### Admin — Stages (admin account required)
- [ ] `/dashboard/admin/stages` lists all 8 deal stages
- [ ] Move a stage up/down with ▲▼ buttons → sort order updates
- [ ] Edit a stage name → change persists
- [ ] Try to delete a stage that has deals → error message appears
- [ ] Add a new stage → appears at the bottom

### Admin — Users (admin account required)
- [ ] `/dashboard/admin/users` lists all profiles with role badges
- [ ] Role badge colours: purple = Admin, blue = Sales, teal = Solutions Engineer, amber = Service Manager
- [ ] Edit a user → can change name, email, role, and password
- [ ] Create a new user with the Solutions Engineer role

### Security
- [ ] Sign out, confirm redirect to `/login`
- [ ] Attempt to navigate directly to `/dashboard` → redirected to `/login`
- [ ] (Non-admin account) navigate to `/dashboard/admin/users` → redirected away
