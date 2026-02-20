-- Migration: create contacts table
-- Apply via: Supabase Dashboard → SQL Editor, or `supabase db push` (CLI)

create table if not exists public.contacts (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users on delete cascade,
  name       text        not null,
  email      text,
  phone      text,
  company    text,
  status     text        not null default 'lead'
                         check (status in ('lead', 'prospect', 'customer', 'churned')),
  notes      text,
  created_at timestamptz not null default now()
);

alter table public.contacts enable row level security;

create policy "contacts: select own"
  on public.contacts for select
  using (auth.uid() = user_id);

create policy "contacts: insert own"
  on public.contacts for insert
  with check (auth.uid() = user_id);

create policy "contacts: update own"
  on public.contacts for update
  using (auth.uid() = user_id);

create policy "contacts: delete own"
  on public.contacts for delete
  using (auth.uid() = user_id);
