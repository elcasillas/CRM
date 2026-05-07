-- ============================================================
-- Data migration: populate renewal_contract_date and
--                 service_manager_id on all accounts
-- ============================================================
-- Idempotent: only touches rows where each column is NULL,
-- so re-running this migration is safe.
--
-- Prerequisites:
--   • Migration 20260507000003 must have run (renewal_contract_date exists)
--   • At least one profile with role = 'service_manager' must exist
-- ============================================================

DO $$
DECLARE
  v_sm_count        int;
  v_updated_renewal int;
  v_updated_sm      int;
BEGIN

  -- ── Guard: ensure service managers exist ─────────────────────────────────
  SELECT COUNT(*) INTO v_sm_count
    FROM public.profiles
   WHERE role = 'service_manager';

  IF v_sm_count = 0 THEN
    RAISE EXCEPTION
      'No profiles with role ''service_manager'' found. '
      'Create at least one service manager user before running this migration.';
  END IF;

  RAISE NOTICE 'Found % service manager(s) — proceeding.', v_sm_count;


  -- ── 1. Populate renewal_contract_date ────────────────────────────────────
  -- Random date in the next 0–1825 days (~5 years), NULL rows only.
  UPDATE public.accounts
     SET renewal_contract_date = CURRENT_DATE + (floor(random() * 1826)::int)
   WHERE renewal_contract_date IS NULL;

  GET DIAGNOSTICS v_updated_renewal = ROW_COUNT;
  RAISE NOTICE 'renewal_contract_date set on % account(s).', v_updated_renewal;


  -- ── 2. Populate service_manager_id ───────────────────────────────────────
  -- Each NULL account gets a uniformly random service manager via LATERAL.
  -- LATERAL re-evaluates ORDER BY random() per row, giving independent picks.
  UPDATE public.accounts a
     SET service_manager_id = mgr.id
    FROM public.accounts acc
    CROSS JOIN LATERAL (
      SELECT id
        FROM public.profiles
       WHERE role = 'service_manager'
       ORDER BY random()
       LIMIT 1
    ) mgr
   WHERE a.id = acc.id
     AND a.service_manager_id IS NULL;

  GET DIAGNOSTICS v_updated_sm = ROW_COUNT;
  RAISE NOTICE 'service_manager_id set on % account(s).', v_updated_sm;


  -- ── 3. Post-migration validation ─────────────────────────────────────────
  -- Abort the transaction if any account is still missing either value.
  IF EXISTS (
    SELECT 1 FROM public.accounts
     WHERE renewal_contract_date IS NULL
        OR service_manager_id    IS NULL
  ) THEN
    RAISE EXCEPTION
      'Validation failed: one or more accounts still have NULL '
      'renewal_contract_date or service_manager_id after migration.';
  END IF;

  RAISE NOTICE 'Validation passed — all accounts have renewal_contract_date and service_manager_id.';

END $$;


-- ============================================================
-- Validation queries (run manually after migration to confirm)
-- ============================================================

-- 1. Confirm zero NULL values remain
--
-- SELECT
--     COUNT(*)                                          AS total_accounts,
--     COUNT(*) FILTER (WHERE renewal_contract_date IS NULL) AS missing_renewal_date,
--     COUNT(*) FILTER (WHERE service_manager_id    IS NULL) AS missing_service_manager
-- FROM public.accounts;
-- Expected: missing_renewal_date = 0, missing_service_manager = 0


-- 2. Distribution of renewal dates by year
--
-- SELECT
--     EXTRACT(YEAR FROM renewal_contract_date) AS renewal_year,
--     COUNT(*)                                  AS account_count
-- FROM public.accounts
-- GROUP BY 1
-- ORDER BY 1;


-- 3. Distribution of service manager assignments
--
-- SELECT
--     p.full_name,
--     p.id,
--     COUNT(a.id) AS accounts_assigned
-- FROM public.profiles p
-- JOIN public.accounts a ON a.service_manager_id = p.id
-- WHERE p.role = 'service_manager'
-- GROUP BY p.id, p.full_name
-- ORDER BY accounts_assigned DESC;


-- 4. Full account audit — confirm both fields populated per row
--
-- SELECT
--     a.account_name,
--     a.renewal_contract_date,
--     p.full_name AS service_manager
-- FROM public.accounts a
-- JOIN public.profiles p ON p.id = a.service_manager_id
-- ORDER BY a.renewal_contract_date;


-- ============================================================
-- Rollback (run manually if needed — not auto-applied)
-- ============================================================
--
-- UPDATE public.accounts
--    SET renewal_contract_date = NULL,
--        service_manager_id    = NULL;
--
-- Or, to fully revert the schema change from migration 000003:
--   ALTER TABLE public.accounts DROP COLUMN IF EXISTS renewal_contract_date;
