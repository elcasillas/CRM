-- =============================================================
-- Migration: Add contact_roles junction table
--
-- Replaces the single is_primary boolean on contacts with a
-- proper junction table supporting multiple roles per contact:
-- primary | billing | marketing | support | technical
--
-- Backward compat: is_primary on contacts is kept and synced.
-- =============================================================

-- -----------------------------------------------------------
-- 1. Create contact_roles table
-- -----------------------------------------------------------
create table if not exists public.contact_roles (
  id          uuid        primary key default gen_random_uuid(),
  contact_id  uuid        not null references public.contacts(id) on delete cascade,
  role_type   text        not null check (role_type in ('primary', 'billing', 'marketing', 'support', 'technical')),
  created_at  timestamptz not null default now(),
  unique (contact_id, role_type)
);

-- -----------------------------------------------------------
-- 2. Enable RLS
-- -----------------------------------------------------------
alter table public.contact_roles enable row level security;

-- -----------------------------------------------------------
-- 3. RLS policies — visibility follows parent account
-- -----------------------------------------------------------
create policy "contact_roles: select if account visible"
  on public.contact_roles for select
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_id
      and public.can_view_account(auth.uid(), c.account_id)
    )
  );

create policy "contact_roles: insert if account visible"
  on public.contact_roles for insert
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_id
      and public.can_view_account(auth.uid(), c.account_id)
    )
  );

create policy "contact_roles: delete if account visible"
  on public.contact_roles for delete
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_id
      and public.can_view_account(auth.uid(), c.account_id)
    )
  );

-- -----------------------------------------------------------
-- 4. Migrate existing primary contacts
-- -----------------------------------------------------------
insert into public.contact_roles (contact_id, role_type)
select id, 'primary'
from public.contacts
where is_primary = true
on conflict do nothing;
