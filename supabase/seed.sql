-- Seed data for local development / clean-environment setup.
-- Replace the placeholder UUID with a real user ID from auth.users.
-- Find it in: Supabase Dashboard → Authentication → Users

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- replace this
begin
  insert into public.contacts (user_id, name, email, phone, company, status, notes) values
    (v_user_id, 'Alice Johnson', 'alice@example.com', '555-0101', 'Acme Corp',   'customer', 'Long-term client since 2022.'),
    (v_user_id, 'Bob Martinez',  'bob@example.com',   '555-0102', 'Beta LLC',    'lead',     'Met at conference in March.'),
    (v_user_id, 'Carol White',   'carol@example.com', '555-0103', 'Gamma Inc',   'prospect', 'Interested in enterprise plan.'),
    (v_user_id, 'David Kim',     'david@example.com', '555-0104', 'Delta Co',    'customer', 'Renewed last quarter.'),
    (v_user_id, 'Eva Chen',      'eva@example.com',   '555-0105', 'Epsilon Ltd', 'lead',     'Referral from Alice.');
end $$;
