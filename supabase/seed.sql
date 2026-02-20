-- Seed data for local development / clean-environment setup.
-- Replace the placeholder UUID with a real user ID from auth.users.
-- Find it in: Supabase Dashboard → Authentication → Users
-- Run after applying all migrations.

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- replace this
  v_alice   uuid := gen_random_uuid();
  v_bob     uuid := gen_random_uuid();
  v_carol   uuid := gen_random_uuid();
  v_david   uuid := gen_random_uuid();
  v_eva     uuid := gen_random_uuid();
begin
  -- Contacts
  insert into public.contacts (id, user_id, name, email, phone, company, status, notes) values
    (v_alice, v_user_id, 'Alice Johnson', 'alice@example.com', '555-0101', 'Acme Corp',   'customer', 'Long-term client since 2022.'),
    (v_bob,   v_user_id, 'Bob Martinez',  'bob@example.com',   '555-0102', 'Beta LLC',    'lead',     'Met at conference in March.'),
    (v_carol, v_user_id, 'Carol White',   'carol@example.com', '555-0103', 'Gamma Inc',   'prospect', 'Interested in enterprise plan.'),
    (v_david, v_user_id, 'David Kim',     'david@example.com', '555-0104', 'Delta Co',    'customer', 'Renewed last quarter.'),
    (v_eva,   v_user_id, 'Eva Chen',      'eva@example.com',   '555-0105', 'Epsilon Ltd', 'lead',     'Referral from Alice.');

  -- Interactions
  insert into public.interactions (user_id, contact_id, type, occurred_at, notes) values
    (v_user_id, v_alice, 'call',    now() - interval '10 days', 'Discussed renewal pricing and new features.'),
    (v_user_id, v_alice, 'email',   now() - interval '5 days',  'Sent updated contract for review.'),
    (v_user_id, v_alice, 'meeting', now() - interval '1 day',   'Signed off on Q2 renewal.'),
    (v_user_id, v_bob,   'meeting', now() - interval '14 days', 'Initial discovery call — good fit for mid-tier plan.'),
    (v_user_id, v_bob,   'email',   now() - interval '7 days',  'Sent product overview deck.'),
    (v_user_id, v_carol, 'call',    now() - interval '6 days',  'Walked through enterprise features.'),
    (v_user_id, v_david, 'email',   now() - interval '3 days',  'Follow-up on last quarter usage report.'),
    (v_user_id, v_eva,   'note',    now() - interval '2 days',  'Alice confirmed Eva is a strong referral. Schedule intro call.');

  -- Deals
  insert into public.deals (user_id, contact_id, title, stage, value, expected_close, notes) values
    (v_user_id, v_alice, 'Acme Corp Q3 Renewal',       'closed_won',  24000,  current_date - 5,   'Signed and paid.'),
    (v_user_id, v_bob,   'Beta LLC Starter Plan',       'proposal',    6000,   current_date + 14,  'Proposal sent, awaiting response.'),
    (v_user_id, v_carol, 'Gamma Inc Enterprise Pilot',  'negotiation', 48000,  current_date + 30,  'Legal review in progress.'),
    (v_user_id, v_david, 'Delta Co Expansion',          'qualified',   18000,  current_date + 45,  'Intro call complete, needs discovery.'),
    (v_user_id, v_eva,   'Epsilon Ltd Referral Deal',   'qualified',   null,   null,               'Early stage — no value agreed yet.'),
    (v_user_id, v_alice, 'Acme Corp Add-on Seats',      'proposal',    4800,   current_date + 10,  'Upsell on existing contract.'),
    (v_user_id, null,    'Inbound — unassigned lead',   'qualified',   null,   null,               'Came in through the website form.');
end $$;
