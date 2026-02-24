# CRM

A sales CRM built with Next.js 15, Supabase, and Tailwind CSS. Features accounts, contacts, deal pipeline with stage history, contracts, HID records, global search, and an admin panel.

**Production:** https://crm-six-roan.vercel.app

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
| `profiles`           | One row per auth user; stores `full_name` and `role`                  |
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
| `admin`               | Full access; can manage users, reassign owners, edit all records |
| `sales`               | Owns accounts and deals; standard CRM access                 |
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
