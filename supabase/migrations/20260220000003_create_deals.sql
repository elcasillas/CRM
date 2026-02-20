-- Migration: create deals table
-- Apply via: Supabase Dashboard → SQL Editor, or `supabase db push` (CLI)
-- Run after 20260220000001_create_contacts.sql

create table if not exists public.deals (
  id             uuid         primary key default gen_random_uuid(),
  user_id        uuid         not null default auth.uid() references auth.users on delete cascade,
  contact_id     uuid         references public.contacts on delete set null,
  title          text         not null,
  stage          text         not null default 'qualified'
                              check (stage in ('qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost')),
  value          numeric(12,2),
  expected_close date,
  notes          text,
  created_at     timestamptz  not null default now()
);

alter table public.deals enable row level security;

create policy "deals: select own"
  on public.deals for select
  using (auth.uid() = user_id);

create policy "deals: insert own"
  on public.deals for insert
  with check (auth.uid() = user_id);

create policy "deals: update own"
  on public.deals for update
  using (auth.uid() = user_id);

create policy "deals: delete own"
  on public.deals for delete
  using (auth.uid() = user_id);
