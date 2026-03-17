-- DC Location / Cluster ID lookup table
-- Manages valid combinations used by HID record configuration.
-- To add new mappings: INSERT INTO dc_cluster_mappings (dc_location, cluster_id) VALUES ('XX', 'cN');
-- To deactivate a mapping without deleting it: UPDATE dc_cluster_mappings SET is_active = false WHERE ...;

create table if not exists dc_cluster_mappings (
  id           uuid primary key default gen_random_uuid(),
  dc_location  text not null,
  cluster_id   text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint dc_cluster_mappings_unique unique (dc_location, cluster_id)
);

-- Auto-update updated_at on any row change
create trigger set_dc_cluster_mappings_updated_at
  before update on dc_cluster_mappings
  for each row execute function set_updated_at();

-- RLS: all authenticated users can read active mappings (needed for dropdowns)
alter table dc_cluster_mappings enable row level security;

create policy "Authenticated users can read dc_cluster_mappings"
  on dc_cluster_mappings for select
  to authenticated
  using (true);

create policy "Admins can manage dc_cluster_mappings"
  on dc_cluster_mappings for all
  to authenticated
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

-- Seed data
insert into dc_cluster_mappings (dc_location, cluster_id) values
  ('CA',  'c0'),
  ('CA',  'c2'),
  ('CA',  'c8'),
  ('CA',  'c10'),
  ('US',  'c25'),
  ('US',  'c26'),
  ('US',  'c28'),
  ('US',  'c30'),
  ('US',  'c35'),
  ('US',  'c38'),
  ('US',  'c40'),
  ('US',  'c45'),
  ('US',  'c75'),
  ('EU',  'c50')
on conflict (dc_location, cluster_id) do nothing;
