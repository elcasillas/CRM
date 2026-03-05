-- Allow all authenticated users to read profiles so that assigned names
-- (service manager on accounts, solutions engineer on deals, deal owner, etc.)
-- are visible to every user, not just the profile owner or admins.

drop policy if exists "profiles: select own or admin" on public.profiles;

create policy "profiles: select authenticated"
  on public.profiles for select
  using (auth.uid() is not null);
