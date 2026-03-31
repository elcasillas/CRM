# CLAUDE.md

Primary working guide for Claude Code sessions on this project. Keep this file up to date as the project evolves.

---

## Common Commands

```bash
npm run dev        # dev server at localhost:3000 (run from Windows terminal)
npm run build      # production build — must pass before merging (Windows terminal)
npm run lint       # ESLint (Windows terminal)

supabase db push   # apply pending migrations to remote Supabase project (WSL OK)
supabase gen types typescript --linked 2>/dev/null > lib/supabase/database.types.ts

npx serve tests -l 8423   # browser-based test harness
```

> **Important:** `node_modules` are Windows-native. `npm run build` and `npm run lint` must be run from a **Windows terminal**, not WSL. `supabase` CLI commands work fine from WSL.

`SUPABASE_ACCESS_TOKEN` is set in `~/.bashrc`. Project is already linked; no re-linking needed.

---

## Project Overview

An internal CRM / Deals Update platform for a software company's sales and service teams. Manages accounts, deals, partner health, financial worksheets, and related operational workflows.

Key capabilities:
- Deal pipeline management (table + kanban views, active vs. all deals)
- Account and contact management with Deals / HIDs / Contracts / Contacts / Notes tabs
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

## Core Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router (server components by default) |
| Language | TypeScript |
| Styling | Tailwind CSS — light theme, white/gray palette, `brand-700` navy for modal headers |
| Backend | Supabase — Postgres, Auth, RLS, RPCs |
| AI | OpenRouter API (`anthropic/claude-haiku-4-5` default) |
| Hosting | Vercel — auto-deploy on push to `master` |
| Source control | GitHub (`ed-casillas-projects/crm`) |

### Supabase client selection

| Context | File | Key |
|---|---|---|
| `'use client'` component | `lib/supabase/client.ts` | anon |
| Server component / route handler (reads) | `lib/supabase/server.ts` | anon + cookies |
| Route handler (privileged mutations) | `lib/supabase/admin.ts` | service role |

`middleware.ts` refreshes the session cookie on every request — do not remove.

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

## Working Rules for Claude Code

- **Make targeted changes.** Edit only what the task requires. Do not refactor, rename, or clean up surrounding code unless explicitly asked.
- **Preserve existing functionality.** Before changing a filter, modal, chart, or import flow, read the component and trace where data comes from.
- **Keep UI styling consistent.** Modal headers use `bg-brand-700` with white text, `rounded-t-xl`, and `px-6 py-4`. Cards use `bg-white border border-gray-200 rounded-xl shadow-sm`. Match these patterns exactly when adding new UI.
- **Prefer reusable patterns.** If a pattern is already used in two or more places (modal headers, pencil icons, label/value grids), replicate it rather than inventing a new approach.
- **Verify related flows.** When changing a filter, modal, import, chart, or nav item — check whether related pages or components consume the same data or share state.
- **Keep labels and headings consistent.** Modal titles use Title Case. Section headers, tab labels, and column names should match existing conventions exactly.
- **Do not break data handling.** ACV, TCV, health scores, deal stages, and CSV import logic are load-bearing. Test that calculations and filters still produce correct output after any change.
- **Do not hardcode values that belong in config.** Stage names, score weights, and threshold values should reference existing config tables or shared constants.

---

## Product and UI Priorities

Current active focus areas:
- **Deals page** — stage filtering, active vs. all views, pipeline funnel chart on Overview
- **Deal detail page** — view/edit toggle on Deal Information section (brand-700 header, pencil icon)
- **Account modal** — view/edit toggle matching Deal detail pattern (read-only by default, pencil to edit)
- **Overview charts** — Pipeline Funnel chart (muted palette, equal-width alongside Deals by Stage), filtered to exclude closed stages
- **Partner Health Dashboard** — AHI list and detail pages, CSV import support
- **Branding** — page title `Hostopia | CRM`, favicon, consistent `brand-700` header styling across modals and section cards
- **Navigation** — Settings consolidates health scoring, inspection config, deal stages, and DC/cluster mappings
- **Worksheet / Products** — financial worksheet stateless (no persistence), products with CSV import and inline editing

---

## Data / Business Logic Notes

### ACV (`value_amount`)
```
contract_term_months = 1  →  ACV = amount × 1   (single-month, not annualised)
contract_term_months > 1  →  ACV = amount × 12  (annualised monthly rate)
contract_term_months unset →  ACV = amount × 12  (default)
```

### TCV (`total_contract_value`)
```
TCV = amount × contract_term_months
```
Both computed in `lib/dealCalc.ts → calcACV / calcTCV`. Applied at deal save, CSV import, and DB migration backfill.

### Deal stage filtering
- `is_closed = false` → active/open deals (used on `/dashboard/deals`)
- `is_won = true` → Closed Implemented; `is_lost = true` → Closed Lost
- Pipeline Funnel and Deals by Stage on the Overview page exclude closed stages (`is_won || is_lost`)
- "All Deals" view (`/dashboard/deals/all`) includes closed stages

### Editable vs. calculated fields
- `amount` — user input (monthly contract value)
- `value_amount` (ACV) and `total_contract_value` (TCV) — computed, not directly editable in forms
- `health_score` and component columns — computed by DB trigger / RPC, not user-editable
- `currency` — stored and displayed but ACV/TCV math assumes CAD

### Health score components (6, all configurable)
`stageProbability` (25) · `velocity` (20) · `activityRecency` (15) · `closeDateIntegrity` (10) · `acv` (15) · `notesSignal` (15)

### AI inspection
- 15-point check: 6 structured (programmatic) + 9 qualitative (LLM via OpenRouter)
- Do **not** use `response_format: { type: 'json_object' }` with Claude via OpenRouter — use `extractJSON()` helper to strip markdown fences before parsing

### CSV import
- Deals deduplicated on `LOWER(TRIM(deal_name))` + `account_id`
- Notes deduplicated on exact `note_text` match per deal
- Account auto-created if name not found
- Skip conditions: deal owner name > 100 chars or > 5 words; ACV field contains 'USD' or 'EUR'

---

## UX Expectations

### Modal design (apply consistently across all modals)
- Header: `flex items-center justify-between px-6 py-4 bg-brand-700 rounded-t-xl`
- Title: `font-semibold text-white` — Title Case
- Close button: `text-white/70 hover:text-white text-lg leading-none` — `✕`
- Pencil/edit icon: `text-white/70 hover:text-white transition-colors` with `w-4 h-4` SVG
- Body: `px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto`
- Footer (edit mode only): `px-6 py-4 border-t border-gray-200 flex justify-end gap-3`

### View / edit toggle pattern
- Modals and section cards open in **read-only** view by default
- Pencil icon in header switches to edit mode
- Edit mode shows form inputs; view mode shows label/value grid
- Label style: `text-xs font-medium text-gray-400 uppercase tracking-wide`
- Value style: `text-sm text-gray-900 mt-0.5`
- Cancel → discard changes, return to read-only (prompt unsaved changes warning if dirty)
- Save → persist, refresh data, return to read-only with updated values

### Charts and visualizations
- Pipeline Funnel: muted cool blue-gray palette (`#5B7FA6` → `#B0BDCA`), SVG trapezoids, equal width alongside Deals by Stage
- Hover on funnel segments: `filter: brightness(0.88)` with 200ms ease transition
- Deals by Stage: exclude `is_won` and `is_lost` stages on Overview page
- Charts sized equally in 50/50 grid (`lg:grid-cols-2`)

### Color and branding
- Avoid high-saturation or neon colors in charts — prefer muted, professional tones
- Brand navy (`brand-700`) reserved for modal/card headers
- Status badges: `active` = green, `inactive` = gray, `churned` = red

### Import flows
- Drag-and-drop CSV upload with column preview before import
- Template download available where supported
- Clear feedback on inserted / existing / skipped counts after import

---

## Implementation Guidance

Before editing any component:
1. **Read the file first.** Understand the existing structure, state, and data flow before making changes.
2. **Trace the data source.** Follow props, Supabase queries, and RPC calls to confirm what data drives the UI.
3. **Check what else uses this.** Search for usages of functions, types, and components you're modifying.
4. **Update related types.** After schema changes, regenerate `lib/supabase/database.types.ts` with `supabase gen types`.
5. **Don't introduce new dependencies** for functionality achievable with existing stack (CSS/SVG, Tailwind, Supabase).
6. **Migrations are append-only.** Never edit an applied migration — add a new one. Name format: `YYYYMMDD######_description.sql`.
7. **Admin routes are server-guarded.** `app/dashboard/admin/layout.tsx` redirects non-admins — preserve this.
8. **OpenRouter JSON parsing.** Use `extractJSON()` to strip markdown code fences before `JSON.parse()` — do not use `response_format: { type: 'json_object' }`.

---

## Directory Structure (key paths)

```
app/
  api/                          # Route handlers (server-side)
    admin/                      # Admin-only config endpoints
    deals/[id]/                 # Summarize, inspect, compose-email
    partners/                   # AHI read/write
    products/import/            # CSV import
    exchange-rate/              # Currency proxy (monthly cache)
  dashboard/
    deals/
      page.tsx                  # Active deals (server → DealsClient)
      all/page.tsx              # All deals including closed
      [id]/page.tsx             # Deal detail — view/edit toggle, notes
      DealsClient.tsx           # Table, kanban, modals, AI features
      DealDetailsModal.tsx      # Read-only deal summary modal
    accounts/
      page.tsx                  # Accounts list + inline modal (add/edit)
      [id]/page.tsx             # Account detail — tabs + account edit modal
    partners/
      page.tsx                  # AHI list (PartnersClient)
      [id]/page.tsx             # AHI detail
    products/
      page.tsx                  # Products list + inline edit
      import/page.tsx           # CSV import UI
    financial-worksheet/
      page.tsx                  # Stateless revenue worksheet
    admin/
      health-scoring/           # Settings: weights, inspection, stages, DC/cluster
      partner-health/           # Partner Health config
      users/                    # User management
components/
  dashboard/
    stat-card.tsx
    deals-by-stage.tsx
    funnel-chart.tsx            # Pipeline Funnel SVG chart
    contracts-renewing.tsx
    recent-activity.tsx
  nav-links.tsx                 # Top nav
  global-search.tsx             # Debounced cross-entity search
lib/
  types.ts                      # Shared TypeScript types
  dealCalc.ts                   # parseAmount, calcACV, calcTCV
  deal-summarize.ts             # AI summary logic + SHA-256 cache
  deal-inspect.ts               # 15-point inspection engine
  api-helpers.ts                # assertAdmin()
  supabase/
    client.ts / server.ts / admin.ts
    database.types.ts           # Auto-generated — regenerate after schema changes
supabase/
  migrations/                   # Append-only SQL migrations (source of truth)
  seed.sql
middleware.ts                   # Session refresh on every request
```

---

## Database Schema (summary)

All tables have RLS enabled and `created_at` / `updated_at` via trigger.

| Table | Purpose |
|---|---|
| `profiles` | Mirrors `auth.users`. Roles: `admin`, `sales`, `sales_manager`, `solutions_engineer`, `service_manager`, `read_only` |
| `accounts` | Account records with owner, service manager, address, status |
| `contacts` | Contact records linked to accounts; roles via `contact_roles` join table |
| `hid_records` | HID/domain records linked to accounts |
| `contracts` | Contract records with renewal dates and values |
| `deals` | Pipeline deals — amount, ACV, TCV, stage, health score, AI fields |
| `deal_stages` | Configurable stages with sort_order, win_probability, is_closed, is_won, is_lost |
| `deal_stage_history` | Audit log of stage changes |
| `notes` | Polymorphic notes for deals, accounts, contacts, HIDs, contracts |
| `deal_summary_cache` | SHA-256 keyed AI summary cache by (deal_id, notes_hash, model) |
| `health_score_config` | Single-row config for score weights, keywords, thresholds |
| `inspection_config` | Single-row config for 15-point inspection check overrides |
| `dc_cluster_mappings` | DC Location → Cluster ID lookup for HID records |
| `products` | Products catalog with unit_price and product_code |
| `partners` | AHI partner records with health scoring |

Key RPCs: `get_deals_page`, `recompute_deal_health_score`, `recompute_all_deal_health_scores`, `is_admin`, `can_view_account`

---

## Navigation

Top nav (`components/nav-links.tsx`):

**All authenticated users:** Overview · Accounts · Products · AHI · Deals · All Deals · Worksheet

**Admin only:** Users · Settings · Partner Health

Settings (`/dashboard/admin/health-scoring`) consolidates: health score config, inspection config, deal stages, DC/cluster mappings.

---

## Deployment

- **Hosting:** Vercel — `ed-casillas-projects/crm`
- **Auto-deploy:** pushes to `master` via GitHub integration
- **DB migrations:** `supabase db push` — Vercel does not run migrations
- **Auth redirects:** Supabase dashboard → Authentication → URL Configuration must include the Vercel domain

---

## Known Issues / Technical Debt

1. **`fetchDeals` in DealsClient** — calls `get_deals_page` from browser (SECURITY INVOKER). Tightening cross-user RLS on `deals` would break this.
2. **`database.types.ts` drift** — not auto-generated on build; regenerate manually after schema changes.
3. **Health score on import** — CSV-imported deals may have zero scores immediately; run admin "Recalculate All" after import.
4. **No pagination** — deals and accounts fetched in full; will be a performance issue at scale.
5. **Inspection stale threshold hardcoded** — `STALE_INSPECTION_HOURS = 2` in `compose-email/route.ts` not configurable via UI.
6. **Financial Worksheet is stateless** — inputs not persisted to Supabase; each session starts fresh.
7. **`EXCHANGERATE_API_KEY` hardcoded fallback** — remove before open-sourcing.
8. **`/dashboard/admin/inspection` not in nav** — accessible by URL but not linked; `inspection-client.tsx` is embedded in Settings page.
