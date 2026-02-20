-- Migration: create interactions table
-- Apply via: Supabase Dashboard → SQL Editor, or `supabase db push` (CLI)
-- Run after 20260220000001_create_contacts.sql

create table if not exists public.interactions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid() references auth.users on delete cascade,
  contact_id  uuid        not null references public.contacts on delete cascade,
  type        text        not null default 'note'
                          check (type in ('call', 'email', 'meeting', 'note', 'other')),
  occurred_at timestamptz not null default now(),
  notes       text,
  created_at  timestamptz not null default now()
);

alter table public.interactions enable row level security;

create policy "interactions: select own"
  on public.interactions for select
  using (auth.uid() = user_id);

create policy "interactions: insert own"
  on public.interactions for insert
  with check (auth.uid() = user_id);

create policy "interactions: update own"
  on public.interactions for update
  using (auth.uid() = user_id);

create policy "interactions: delete own"
  on public.interactions for delete
  using (auth.uid() = user_id);
