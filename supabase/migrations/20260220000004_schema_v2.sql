-- =============================================================
-- Migration 4: Schema v2 — account-centric multi-user CRM
--
-- Drops legacy tables (contacts, interactions, deals) and
-- replaces them with a full account-centric schema with
-- profiles, RLS helper functions, and role-based policies.
-- =============================================================


-- -----------------------------------------------------------
-- 0. Drop legacy tables (child-first to avoid FK violations)
-- -----------------------------------------------------------
drop table if exists public.interactions cascade;
drop table if exists public.deals        cascade;
drop table if exists public.contacts     cascade;


-- -----------------------------------------------------------
-- 1. updated_at trigger helper
-- -----------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- -----------------------------------------------------------
-- 2. profiles
-- -----------------------------------------------------------
create table if not exists public.profiles (
  id         uuid        primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text        not null default 'sales'
                         check (role in ('admin', 'sales', 'service_manager', 'read_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------
-- 3. accounts
-- -----------------------------------------------------------
create table if not exists public.accounts (
  id                 uuid        primary key default gen_random_uuid(),
  account_name       text        not null,
  account_website    text,
  address_line1      text,
  address_line2      text,
  city               text,
  region             text,
  postal             text,
  country            text,
  account_owner_id   uuid        not null references public.profiles(id),
  service_manager_id uuid        references public.profiles(id),
  status             text        not null default 'active',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------
-- 4. contacts (new schema — linked to accounts, not auth.users)
-- -----------------------------------------------------------
create table if not exists public.contacts (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references public.accounts(id) on delete cascade,
  first_name  text,
  last_name   text,
  email       text        not null,
  phone       text,
  title       text,
  is_primary  boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------
-- 5. hid_records
-- -----------------------------------------------------------
create table if not exists public.hid_records (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references public.accounts(id) on delete cascade,
  hid_number  text        not null unique,
  dc_location text,
  cluster_id  text,
  start_date  date,
  domain_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger hid_records_updated_at
  before update on public.hid_records
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------
-- 6. contracts
-- -----------------------------------------------------------
create table if not exists public.contracts (
  id                  uuid        primary key default gen_random_uuid(),
  account_id          uuid        not null references public.accounts(id) on delete cascade,
  effective_date      date,
  renewal_date        date,
  renewal_term_months int,
  auto_renew          boolean     not null default false,
  status              text        not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger contracts_updated_at
  before update on public.contracts
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------
-- 7. deal_stages (lookup table; read all auth, write admin)
-- -----------------------------------------------------------
create table if not exists public.deal_stages (
  id         uuid        primary key default gen_random_uuid(),
  stage_name text        not null unique,
  sort_order int         not null,
  is_closed  boolean     not null default false,
  is_won     boolean     not null default false,
  is_lost    boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger deal_stages_updated_at
  before update on public.deal_stages
  for each row execute function public.set_updated_at();

insert into public.deal_stages (stage_name, sort_order, is_closed, is_won, is_lost) values
  ('Closed Lost',           1, true,  false, true),
  ('Solution Qualified',    2, false, false, false),
  ('Presenting to EDM',     3, false, false, false),
  ('Short Listed',          4, false, false, false),
  ('Contract Negotiations', 5, false, false, false),
  ('Contract Signed',       6, false, false, false),
  ('Implementing',          7, false, false, false),
  ('Closed Implemented',    8, true,  true,  false)
on conflict (stage_name) do nothing;


-- -----------------------------------------------------------
-- 8. deals
-- -----------------------------------------------------------
create table if not exists public.deals (
  id               uuid        primary key default gen_random_uuid(),
  account_id       uuid        not null references public.accounts(id) on delete cascade,
  stage_id         uuid        not null references public.deal_stages(id),
  deal_name        text        not null,
  deal_description text,
  deal_notes       text,
  deal_owner_id    uuid        not null references public.profiles(id),
  value_amount     numeric(15, 2),
  currency         text        not null default 'USD',
  close_date       date,
  last_activity_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger deals_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------
-- 9. notes (polymorphic — attaches to any entity)
-- -----------------------------------------------------------
create table if not exists public.notes (
  id          uuid        primary key default gen_random_uuid(),
  entity_type text        not null
                          check (entity_type in ('account', 'deal', 'contact', 'contract', 'hid')),
  entity_id   uuid        not null,
  note_text   text        not null,
  created_by  uuid        not null references public.profiles(id),
  created_at  timestamptz not null default now()
);


-- -----------------------------------------------------------
-- 10. deal_stage_history (audit log)
-- -----------------------------------------------------------
create table if not exists public.deal_stage_history (
  id            uuid        primary key default gen_random_uuid(),
  deal_id       uuid        not null references public.deals(id) on delete cascade,
  from_stage_id uuid        references public.deal_stages(id),
  to_stage_id   uuid        not null references public.deal_stages(id),
  changed_by    uuid        not null references public.profiles(id),
  changed_at    timestamptz not null default now()
);


-- =============================================================
-- RLS — Helper functions
-- =============================================================

-- is_admin(uid): returns true when the user has the admin role.
-- SECURITY DEFINER so it can bypass RLS on profiles.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'admin'
  );
$$;

-- can_view_account(uid, account_id): returns true when the user is
-- the account owner, the assigned service manager, or an admin.
create or replace function public.can_view_account(uid uuid, acct_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.accounts a
    where a.id = acct_id
      and (
            a.account_owner_id   = uid
        or  a.service_manager_id = uid
        or  public.is_admin(uid)
      )
  );
$$;

-- can_view_note_entity(uid, entity_type, entity_id): resolves the
-- parent account for each entity type and delegates to can_view_account.
create or replace function public.can_view_note_entity(uid uuid, etype text, eid uuid)
returns boolean
language sql
security definer
stable
as $$
  select case etype
    when 'account'  then public.can_view_account(uid, eid)
    when 'deal'     then public.can_view_account(uid,
                           (select account_id from public.deals       where id = eid))
    when 'contact'  then public.can_view_account(uid,
                           (select account_id from public.contacts    where id = eid))
    when 'contract' then public.can_view_account(uid,
                           (select account_id from public.contracts   where id = eid))
    when 'hid'      then public.can_view_account(uid,
                           (select account_id from public.hid_records where id = eid))
    else false
  end;
$$;


-- =============================================================
-- RLS — Enable on all tables
-- =============================================================
alter table public.profiles          enable row level security;
alter table public.accounts          enable row level security;
alter table public.contacts          enable row level security;
alter table public.hid_records       enable row level security;
alter table public.contracts         enable row level security;
alter table public.deal_stages       enable row level security;
alter table public.deals             enable row level security;
alter table public.notes             enable row level security;
alter table public.deal_stage_history enable row level security;


-- =============================================================
-- RLS — profiles
-- Users can read their own row; admin can read all.
-- Users can update only their own full_name (role locked via
-- WITH CHECK — new role must match existing role for non-admins).
-- Only admin can delete profiles.
-- =============================================================
create policy "profiles: select own or admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin(auth.uid()));

-- Profile rows are created via the new-user trigger (or manually).
-- Allow a user to insert only their own row.
create policy "profiles: insert own"
  on public.profiles for insert
  with check (id = auth.uid());

-- Non-admins can update their own row but cannot change their role.
create policy "profiles: update own name or admin all"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (
    public.is_admin(auth.uid())
    or (
      id = auth.uid()
      and role = (select p.role from public.profiles p where p.id = auth.uid())
    )
  );

create policy "profiles: delete admin only"
  on public.profiles for delete
  using (public.is_admin(auth.uid()));


-- =============================================================
-- RLS — accounts
-- =============================================================
create policy "accounts: select visible"
  on public.accounts for select
  using (public.can_view_account(auth.uid(), id));

-- Any authenticated user can create an account they own;
-- admins can create on behalf of others.
create policy "accounts: insert owner or admin"
  on public.accounts for insert
  with check (
    (account_owner_id = auth.uid())
    or public.is_admin(auth.uid())
  );

create policy "accounts: update owner or admin"
  on public.accounts for update
  using (account_owner_id = auth.uid() or public.is_admin(auth.uid()));

create policy "accounts: delete admin only"
  on public.accounts for delete
  using (public.is_admin(auth.uid()));


-- =============================================================
-- RLS — contacts
-- Visibility follows the parent account.
-- Deletes restricted to account owner or admin.
-- =============================================================
create policy "contacts: select if account visible"
  on public.contacts for select
  using (public.can_view_account(auth.uid(), account_id));

create policy "contacts: insert if account visible"
  on public.contacts for insert
  with check (public.can_view_account(auth.uid(), account_id));

create policy "contacts: update if account visible"
  on public.contacts for update
  using (public.can_view_account(auth.uid(), account_id));

create policy "contacts: delete owner or admin"
  on public.contacts for delete
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.accounts
      where id = account_id and account_owner_id = auth.uid()
    )
  );


-- =============================================================
-- RLS — hid_records
-- =============================================================
create policy "hid_records: select if account visible"
  on public.hid_records for select
  using (public.can_view_account(auth.uid(), account_id));

create policy "hid_records: insert if account visible"
  on public.hid_records for insert
  with check (public.can_view_account(auth.uid(), account_id));

create policy "hid_records: update if account visible"
  on public.hid_records for update
  using (public.can_view_account(auth.uid(), account_id));

create policy "hid_records: delete owner or admin"
  on public.hid_records for delete
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.accounts
      where id = account_id and account_owner_id = auth.uid()
    )
  );


-- =============================================================
-- RLS — contracts
-- =============================================================
create policy "contracts: select if account visible"
  on public.contracts for select
  using (public.can_view_account(auth.uid(), account_id));

create policy "contracts: insert if account visible"
  on public.contracts for insert
  with check (public.can_view_account(auth.uid(), account_id));

create policy "contracts: update if account visible"
  on public.contracts for update
  using (public.can_view_account(auth.uid(), account_id));

create policy "contracts: delete owner or admin"
  on public.contracts for delete
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.accounts
      where id = account_id and account_owner_id = auth.uid()
    )
  );


-- =============================================================
-- RLS — deal_stages (read all authenticated; write admin only)
-- =============================================================
create policy "deal_stages: select all authenticated"
  on public.deal_stages for select
  using (auth.uid() is not null);

create policy "deal_stages: insert admin only"
  on public.deal_stages for insert
  with check (public.is_admin(auth.uid()));

create policy "deal_stages: update admin only"
  on public.deal_stages for update
  using (public.is_admin(auth.uid()));

create policy "deal_stages: delete admin only"
  on public.deal_stages for delete
  using (public.is_admin(auth.uid()));


-- =============================================================
-- RLS — deals
-- Sales can create deals they own on visible accounts.
-- Service managers can read; cannot edit unless admin.
-- Admin can do everything.
-- =============================================================
create policy "deals: select if account visible"
  on public.deals for select
  using (public.can_view_account(auth.uid(), account_id));

create policy "deals: insert sales own or admin"
  on public.deals for insert
  with check (
    public.can_view_account(auth.uid(), account_id)
    and (
      public.is_admin(auth.uid())
      or (
        deal_owner_id = auth.uid()
        and exists (
          select 1 from public.profiles
          where id = auth.uid() and role in ('admin', 'sales')
        )
      )
    )
  );

-- Deal owner can update their own deals; admin can update any.
-- Service managers are implicitly excluded (they are not deal_owner).
create policy "deals: update deal owner or admin"
  on public.deals for update
  using (
    public.can_view_account(auth.uid(), account_id)
    and (deal_owner_id = auth.uid() or public.is_admin(auth.uid()))
  );

create policy "deals: delete admin only"
  on public.deals for delete
  using (public.is_admin(auth.uid()));


-- =============================================================
-- RLS — notes
-- =============================================================
create policy "notes: select for visible entity"
  on public.notes for select
  using (public.can_view_note_entity(auth.uid(), entity_type, entity_id));

create policy "notes: insert for visible entity"
  on public.notes for insert
  with check (
    created_by = auth.uid()
    and public.can_view_note_entity(auth.uid(), entity_type, entity_id)
  );

-- No UPDATE on notes (immutable log entries).

create policy "notes: delete admin or creator"
  on public.notes for delete
  using (public.is_admin(auth.uid()) or created_by = auth.uid());


-- =============================================================
-- RLS — deal_stage_history
-- =============================================================
create policy "deal_stage_history: select if deal visible"
  on public.deal_stage_history for select
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id
        and public.can_view_account(auth.uid(), d.account_id)
    )
  );

create policy "deal_stage_history: insert if deal visible"
  on public.deal_stage_history for insert
  with check (
    changed_by = auth.uid()
    and exists (
      select 1 from public.deals d
      where d.id = deal_id
        and public.can_view_account(auth.uid(), d.account_id)
    )
  );

create policy "deal_stage_history: delete admin only"
  on public.deal_stage_history for delete
  using (public.is_admin(auth.uid()));


-- =============================================================
-- Optional: auto-create profile on new user sign-up
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
