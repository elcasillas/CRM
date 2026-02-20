# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An AI-powered CRM built with Next.js 15 (App Router), TypeScript, Tailwind CSS, and Supabase (Postgres + Auth).

## Common Commands

```bash
npm run dev        # start dev server at localhost:3000
npm run build      # production build (must pass before merging)
npm run lint       # ESLint

supabase db push   # apply pending migrations to the remote Supabase project
```

`SUPABASE_ACCESS_TOKEN` is set in `~/.bashrc`. The project is already linked (`supabase link` has been run); no re-linking needed in a fresh shell.

## Environment Setup

Copy `.env.local.example` to `.env.local` and fill in values from the Supabase dashboard:

```bash
cp .env.local.example .env.local
```

Required variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Deployment

Hosted on Vercel. Project: `ed-casillas-projects/crm`.

```bash
vercel --prod   # deploy from local (requires vercel login)
```

Pushes to `master` auto-deploy via the GitHub integration Vercel detected at first deploy.

**Environment variables** are set in the Vercel project dashboard (or via `vercel env add`). The three required vars are the same as `.env.local`.

**Supabase URL configuration** (required for auth redirects):
- Site URL and allowed redirect URLs must include the Vercel domain.
- Set in Supabase dashboard → Authentication → URL Configuration.

## Architecture

### Stack
- **Framework:** Next.js 15 App Router — server components by default, client components only where interactivity is needed
- **Styling:** Tailwind CSS (dark slate palette: `bg-slate-900`, `text-slate-100`). Custom scrollbar in `app/globals.css`. No UI component library.
- **Backend:** Supabase — Postgres as system of record, Supabase Auth for identity, Row Level Security on every table.

### Supabase Client Helpers

| File | Usage |
|---|---|
| `lib/supabase/client.ts` | Browser client — use in `'use client'` components |
| `lib/supabase/server.ts` | Server client — use in server components and route handlers |
| `middleware.ts` | Refreshes the session cookie on every request — do not remove |

For mutations that require elevated privileges, use the service role key only in route handlers (`app/**/route.ts`), never in client components.

### Database

Migrations live in `supabase/migrations/`. Apply them in order in a clean environment. Seed data is in `supabase/seed.sql`.

All tables must have:
- `user_id uuid references auth.users not null`
- RLS enabled with `user_id = auth.uid()` policies for all four operations

### Non-Negotiables
1. Supabase Postgres is the system of record — no client-side state as source of truth.
2. RLS enforces access — never rely on client-side filtering for security.
3. No serverful dependencies — Vercel Edge/serverless only.
4. Keep UI consistent with the slate dark theme; no heavy UI frameworks.
