-- Seed data for local development / clean-environment setup.
-- Replace the placeholder UUID with a real user ID from auth.users.
-- Find it in: Supabase Dashboard → Authentication → Users
-- Run after applying all migrations.
--
-- The seeded user is given the 'admin' role so they can see all
-- accounts and exercise every RLS path.

do $$
declare
  v_user_id   uuid := '00000000-0000-0000-0000-000000000000'; -- replace this

  -- account IDs
  v_acme      uuid := gen_random_uuid();
  v_beta      uuid := gen_random_uuid();
  v_gamma     uuid := gen_random_uuid();
  v_delta     uuid := gen_random_uuid();
  v_epsilon   uuid := gen_random_uuid();

  -- stage IDs (looked up by name)
  s_closed_lost    uuid;
  s_sol_qualified  uuid;
  s_presenting     uuid;
  s_short_listed   uuid;
  s_negotiations   uuid;
  s_signed         uuid;
  s_implementing   uuid;
  s_closed_impl    uuid;
begin
  -- --------------------------------------------------------
  -- Profile for the seed user (upsert — safe to re-run)
  -- --------------------------------------------------------
  insert into public.profiles (id, full_name, role)
  values (v_user_id, 'Seed Admin', 'admin')
  on conflict (id) do update set role = 'admin', full_name = 'Seed Admin';

  -- --------------------------------------------------------
  -- Resolve deal stage IDs
  -- --------------------------------------------------------
  select id into s_closed_lost   from public.deal_stages where stage_name = 'Closed Lost';
  select id into s_sol_qualified from public.deal_stages where stage_name = 'Solution Qualified';
  select id into s_presenting    from public.deal_stages where stage_name = 'Presenting to EDM';
  select id into s_short_listed  from public.deal_stages where stage_name = 'Short Listed';
  select id into s_negotiations  from public.deal_stages where stage_name = 'Contract Negotiations';
  select id into s_signed        from public.deal_stages where stage_name = 'Contract Signed';
  select id into s_implementing  from public.deal_stages where stage_name = 'Implementing';
  select id into s_closed_impl   from public.deal_stages where stage_name = 'Closed Implemented';

  -- --------------------------------------------------------
  -- Accounts
  -- --------------------------------------------------------
  insert into public.accounts (id, account_name, account_website, city, country, account_owner_id, status) values
    (v_acme,    'Acme Corp',    'https://acme.example.com',    'Austin',      'US', v_user_id, 'active'),
    (v_beta,    'Beta LLC',     'https://beta.example.com',    'Denver',      'US', v_user_id, 'active'),
    (v_gamma,   'Gamma Inc',    'https://gamma.example.com',   'Chicago',     'US', v_user_id, 'active'),
    (v_delta,   'Delta Co',     'https://delta.example.com',   'Seattle',     'US', v_user_id, 'active'),
    (v_epsilon, 'Epsilon Ltd',  'https://epsilon.example.com', 'New York',    'US', v_user_id, 'active');

  -- --------------------------------------------------------
  -- Contacts (linked to accounts)
  -- --------------------------------------------------------
  insert into public.contacts (account_id, first_name, last_name, email, phone, title, is_primary) values
    (v_acme,    'Alice',  'Johnson',  'alice@acme.example.com',    '555-0101', 'VP of Engineering',    true),
    (v_acme,    'Tom',    'Nguyen',   'tom@acme.example.com',      '555-0110', 'Procurement Manager',  false),
    (v_beta,    'Bob',    'Martinez', 'bob@beta.example.com',      '555-0102', 'CTO',                  true),
    (v_gamma,   'Carol',  'White',    'carol@gamma.example.com',   '555-0103', 'Director of IT',       true),
    (v_delta,   'David',  'Kim',      'david@delta.example.com',   '555-0104', 'COO',                  true),
    (v_epsilon, 'Eva',    'Chen',     'eva@epsilon.example.com',   '555-0105', 'Head of Operations',   true);

  -- --------------------------------------------------------
  -- HID Records
  -- --------------------------------------------------------
  insert into public.hid_records (account_id, hid_number, dc_location, cluster_id, start_date, domain_name) values
    (v_acme,    'HID-10001', 'US-WEST-2', 'CLU-A1', '2022-03-01', 'acme.example.com'),
    (v_acme,    'HID-10002', 'US-WEST-2', 'CLU-A1', '2023-07-15', 'acme2.example.com'),
    (v_delta,   'HID-10003', 'US-EAST-1', 'CLU-B3', '2023-01-10', 'delta.example.com'),
    (v_gamma,   'HID-10004', 'CA-CENTRAL', 'CLU-C2', '2024-01-01', 'gamma.example.com');

  -- --------------------------------------------------------
  -- Contracts
  -- --------------------------------------------------------
  insert into public.contracts (account_id, effective_date, renewal_date, renewal_term_months, auto_renew, status) values
    (v_acme,  '2024-01-01', '2025-01-01', 12, true,  'active'),
    (v_delta, '2023-06-01', '2024-06-01', 12, false, 'active'),
    (v_gamma, '2024-03-15', '2026-03-15', 24, true,  'active');

  -- --------------------------------------------------------
  -- Deals
  -- --------------------------------------------------------
  insert into public.deals (account_id, stage_id, deal_name, deal_owner_id, value_amount, currency, close_date, deal_notes, last_activity_at) values
    (v_acme,    s_closed_impl,  'Acme Corp — Initial Deployment',         v_user_id, 24000,  'USD', current_date - 30,  'Signed and fully implemented.',                  now() - interval '30 days'),
    (v_acme,    s_signed,       'Acme Corp — Add-on Seats',               v_user_id,  4800,  'USD', current_date + 10,  'Upsell on existing contract, MSA in place.',     now() - interval '2 days'),
    (v_beta,    s_presenting,   'Beta LLC — Starter Plan',                v_user_id,  6000,  'USD', current_date + 14,  'Deck sent to EDM, awaiting feedback.',           now() - interval '7 days'),
    (v_gamma,   s_negotiations, 'Gamma Inc — Enterprise Pilot',           v_user_id, 48000,  'USD', current_date + 30,  'Legal review in progress.',                      now() - interval '1 day'),
    (v_delta,   s_sol_qualified,'Delta Co — Expansion',                   v_user_id, 18000,  'USD', current_date + 45,  'Intro call complete, discovery next.',           now() - interval '5 days'),
    (v_epsilon, s_short_listed, 'Epsilon Ltd — Referral Deal',            v_user_id,  null,  'USD', null,               'Referral from Acme contact. No value agreed yet.',now() - interval '2 days'),
    (v_gamma,   s_implementing, 'Gamma Inc — Phase 2 Rollout',            v_user_id, 32000,  'USD', current_date + 60,  'Phase 1 complete, Phase 2 scoping underway.',    now() - interval '3 days');

  -- --------------------------------------------------------
  -- Notes (mix of entity types)
  -- --------------------------------------------------------
  insert into public.notes (entity_type, entity_id, note_text, created_by) values
    ('account', v_acme,    'Key account — executive sponsor is Alice Johnson. Quarterly check-ins required.',          v_user_id),
    ('account', v_beta,    'Warm lead from industry event. Bob (CTO) is the main champion.',                           v_user_id),
    ('account', v_gamma,   'Enterprise pilot ongoing. Legal flagged indemnification clause — legal team reviewing.',   v_user_id),
    ('deal',    (select id from public.deals where deal_name = 'Acme Corp — Add-on Seats'), 'Legal approved MSA extension. Finance sign-off pending.',  v_user_id),
    ('deal',    (select id from public.deals where deal_name = 'Beta LLC — Starter Plan'),  'Sent product overview deck on ' || to_char(current_date - 7, 'Mon DD') || '.',  v_user_id),
    ('contact', (select id from public.contacts where email = 'carol@gamma.example.com'),   'Carol prefers email over calls. Responds fastest in the morning.', v_user_id);

end $$;
