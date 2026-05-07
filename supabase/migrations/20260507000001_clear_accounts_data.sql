-- Clear all accounts and their cascade-dependent records.
-- Affected tables (via ON DELETE CASCADE): contacts, hid_records, contracts, deals, notes.
-- Run this before seeding fresh dummy data.
TRUNCATE TABLE public.accounts CASCADE;
