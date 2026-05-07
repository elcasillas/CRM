-- ============================================================
-- Schema migration: add renewal_contract_date to accounts
-- ============================================================
-- Note: service_manager_id (FK → profiles) already exists from
-- the original schema_v2 migration. No structural change needed
-- for that column — only the data-population migration below
-- is required to ensure every account has one assigned.
-- ============================================================

-- Add column (idempotent)
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS renewal_contract_date date;

COMMENT ON COLUMN public.accounts.renewal_contract_date
  IS 'Next contract renewal date for this account.';

-- Rollback:
--   ALTER TABLE public.accounts DROP COLUMN IF EXISTS renewal_contract_date;
