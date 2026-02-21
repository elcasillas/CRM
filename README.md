# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
# CRM

A sales CRM built with Next.js 15, Supabase, and Tailwind CSS. Features accounts, contacts, deal pipeline with stage history, contracts, HID records, global search, and an admin panel.

**Production:** https://crm-six-roan.vercel.app

---

## Tech Stack

| Layer       | Technology                                      |
|-------------|--------------------------------------------------|
| Framework   | Next.js 15 (App Router, server + client components) |
| Database    | Supabase (PostgreSQL 15)                        |
| Auth        | Supabase Auth — magic link + admin invite flow  |
| Security    | Row Level Security (RLS) on every table         |
| Styling     | Tailwind CSS v3                                 |
| Language    | TypeScript (strict)                             |
| Deployment  | Vercel                                          |

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

| Variable                      | Where to find it                                              |
|-------------------------------|---------------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`    | Supabase Dashboard → Project Settings → API → Project URL    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → anon public  |
| `SUPABASE_SERVICE_ROLE_KEY`   | Supabase Dashboard → Project Settings → API → service_role   |

> **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.** It is only used in server-side API routes (`app/api/`).

### 4. Apply migrations

Run migrations in order via the Supabase SQL editor or the CLI:

```
supabase/migrations/20260220000004_schema_v2.sql
```

The v2 migration creates all tables, triggers, RLS helper functions, RLS policies, and seeds the 8 default deal stages. Earlier migration files (`000001`–`000003`) are superseded by `000004` and can be skipped.

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

Or via CLI:

```bash
echo "your-value" | vercel env add NEXT_PUBLIC_SUPABASE_URL production
echo "your-value" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
echo "your-value" | vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

### Deploy

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

### Database schema (schema v2)

| Table               | Purpose                                              |
|---------------------|------------------------------------------------------|
| `profiles`          | One row per auth user; stores `full_name` and `role` |
| `accounts`          | Company records; has `account_owner_id` and `service_manager_id` |
| `contacts`          | People linked to accounts                            |
| `hid_records`       | HID/cluster records linked to accounts               |
| `contracts`         | Contracts with renewal dates                         |
| `deal_stages`       | Ordered pipeline stages with won/lost/closed flags   |
| `deals`             | Opportunities linked to accounts and stages          |
| `deal_stage_history`| Audit log of every stage change on a deal            |
| `notes`             | Polymorphic notes (account, deal, contact, etc.)     |

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
5. Admins can invite new users via `/dashboard/admin/users` (calls `auth.admin.inviteUserByEmail`)

### Types

Hand-written TypeScript interfaces in `lib/types.ts` mirror the database schema. All Supabase query results are cast to these types. The service-role admin client lives in `lib/supabase/admin.ts` and is only imported by server-side code.

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
- [ ] `/dashboard/accounts` lists 5 accounts
- [ ] Search "Acme" filters to 1 result; clear resets the list
- [ ] Filter by "Active" shows all 5; "Churned" shows 0
- [ ] Click **+ New account**, fill in name, save — row appears in table
- [ ] Click the new account name → detail page loads
- [ ] On the detail page, switch to the **Contacts** tab → add a contact
- [ ] Switch to **HIDs** tab → add an HID record
- [ ] Switch to **Notes** tab → add a note; confirm it appears immediately
- [ ] Edit the account (name, status) → changes persist on reload
- [ ] Delete the test account (confirm prompt)

### Deals
- [ ] `/dashboard/deals` loads in Table view with 7 seeded deals
- [ ] Switch to **Kanban** view — columns match the seeded stages
- [ ] Change a deal's stage via the inline dropdown in Table view
- [ ] Open the same deal's parent account → Deals tab → verify stage updated
- [ ] Click **+ New deal**, fill required fields, save
- [ ] Edit the deal and change its stage → stage badge updates
- [ ] Delete the test deal

### Global search
- [ ] Type "Acme" in the header search → Accounts group appears
- [ ] Type "HID-10001" → HID Records group appears; click it → navigates to Acme with HIDs tab active
- [ ] Type "alice@" → Contacts group appears; click → navigates to Acme with Contacts tab active
- [ ] Press Esc → dropdown closes

### Admin — Stages (admin account required)
- [ ] `/dashboard/admin/stages` lists all 8 deal stages
- [ ] Move a stage up/down with ▲▼ buttons → sort order updates
- [ ] Edit a stage name → change persists
- [ ] Try to delete a stage that has deals → error message appears
- [ ] Add a new stage → appears at the bottom

### Admin — Users (admin account required)
- [ ] `/dashboard/admin/users` lists all profiles with emails
- [ ] Change a user's role → dropdown updates immediately
- [ ] Enter an email in the invite form and click **Send invite** → success message

### Security
- [ ] Sign out, confirm redirect to `/login`
- [ ] Attempt to navigate directly to `/dashboard` → redirected to `/login`
- [ ] (If testing with a non-admin account) navigate to `/dashboard/admin/users` → redirected away
