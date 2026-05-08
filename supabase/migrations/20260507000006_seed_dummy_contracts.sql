-- ============================================================
-- Seed dummy contracts for all accounts
-- Clears the contracts table and repopulates with 1–3
-- realistic contracts per account using randomized data.
-- ============================================================


-- ── Step 1: Clear existing contract data ─────────────────────────────────────
-- Notes linked to contracts (entity_type = 'contract') are also cleared
-- via CASCADE so no orphaned notes remain.

TRUNCATE TABLE public.contracts CASCADE;


-- ── Step 2: Insert dummy contracts ───────────────────────────────────────────
-- Strategy: CROSS JOIN every account against generate_series(1,3) to produce
-- up to 3 candidate rows per account, then filter with random() so that
--   • contract #1  — always inserted        (100%)
--   • contract #2  — inserted ~60% of the time
--   • contract #3  — inserted ~30% of the time
-- This gives a realistic spread of 1–3 contracts per account.

INSERT INTO public.contracts (
    account_id,
    entity_name,
    effective_date,
    renewal_date,
    renewal_term_months,
    auto_renew,
    status
)
SELECT
    a.id AS account_id,

    -- ── Entity name ──────────────────────────────────────────────────────────
    -- Contract #1: primary agreement named after the account's industry
    -- Contract #2: secondary agreement (SLA, SOW, addendum, etc.)
    -- Contract #3: tertiary / supplemental agreement
    CASE gs.n
      WHEN 1 THEN
        CASE a.industry
          WHEN 'Teleco'  THEN
            (ARRAY[
              'Telecommunications Service Contract',
              'Carrier Services Agreement',
              'Telco Infrastructure Agreement'
            ])[floor(random() * 3 + 1)::int]
          WHEN 'Cableco' THEN
            (ARRAY[
              'Cable Infrastructure Agreement',
              'Broadband Services Contract',
              'Cable Plant Maintenance Agreement'
            ])[floor(random() * 3 + 1)::int]
          WHEN 'Hoster'  THEN
            (ARRAY[
              'Hosting Services Agreement',
              'Managed Hosting Contract',
              'Data Centre Colocation Agreement'
            ])[floor(random() * 3 + 1)::int]
          WHEN 'ISP'     THEN
            (ARRAY[
              'Enterprise Internet Services Agreement',
              'Internet Access Service Contract',
              'Wholesale Connectivity Agreement'
            ])[floor(random() * 3 + 1)::int]
          WHEN 'MSP'     THEN
            (ARRAY[
              'Managed Services Agreement',
              'IT Managed Services Contract',
              'Network Management Services Agreement'
            ])[floor(random() * 3 + 1)::int]
          ELSE
            (ARRAY[
              'Master Services Agreement',
              'Enterprise Software License Agreement',
              'Platform Services Contract'
            ])[floor(random() * 3 + 1)::int]
        END

      WHEN 2 THEN
        (ARRAY[
          'Service Level Agreement',
          'Statement of Work — Professional Services',
          'Support & Maintenance Addendum',
          'Data Processing Agreement',
          'Security Services Addendum',
          'Professional Services Agreement'
        ])[floor(random() * 6 + 1)::int]

      ELSE  -- gs.n = 3
        (ARRAY[
          'Renewal Amendment No. 1',
          'Supplemental Services Agreement',
          'Managed Security Services Addendum',
          'Cloud Migration Statement of Work',
          'Disaster Recovery Services Addendum',
          'Training & Onboarding Agreement'
        ])[floor(random() * 6 + 1)::int]
    END AS entity_name,

    -- ── Effective date ───────────────────────────────────────────────────────
    -- Random date between 1 and 5 years in the past.
    -- Earlier contracts (n=1) tend to be older; addendums (n>1) tend to be newer.
    CURRENT_DATE - (
      CASE gs.n
        WHEN 1 THEN (floor(random() * (5 * 365 - 180)) + 180)::int   -- 6 mo – 5 yr ago
        WHEN 2 THEN (floor(random() * (3 * 365 - 90))  +  90)::int   -- 3 mo – 3 yr ago
        ELSE        (floor(random() * (2 * 365 - 30))  +  30)::int   -- 1 mo – 2 yr ago
      END
    ) AS effective_date,

    -- ── Renewal date ────────────────────────────────────────────────────────
    -- Random date between today and 5 years from now.
    CURRENT_DATE + (floor(random() * (5 * 365))::int) AS renewal_date,

    -- ── Renewal term ────────────────────────────────────────────────────────
    -- One of the standard annual-increment term lengths.
    (ARRAY[12, 24, 36, 48, 60])[floor(random() * 5 + 1)::int] AS renewal_term_months,

    -- ── Auto renew ──────────────────────────────────────────────────────────
    (random() > 0.45) AS auto_renew,

    -- ── Status ──────────────────────────────────────────────────────────────
    -- Weighted toward 'active' to reflect a live customer base.
    -- active ≈ 57%, pending ≈ 14%, expired ≈ 14%, cancelled ≈ 14%
    (ARRAY['active', 'active', 'active', 'active',
           'pending', 'pending',
           'expired',
           'cancelled'])[floor(random() * 8 + 1)::int] AS status

FROM public.accounts a
CROSS JOIN generate_series(1, 3) AS gs(n)
WHERE
    -- Contract #1: always insert
    gs.n = 1
    -- Contract #2: ~60% of accounts get a second contract
    OR (gs.n = 2 AND random() < 0.6)
    -- Contract #3: ~30% of accounts get a third contract
    OR (gs.n = 3 AND random() < 0.3);


-- ── Step 3: Validation ───────────────────────────────────────────────────────
DO $$
DECLARE
  v_accounts  int;
  v_contracts int;
BEGIN
  SELECT COUNT(*) INTO v_accounts  FROM public.accounts;
  SELECT COUNT(*) INTO v_contracts FROM public.contracts;

  RAISE NOTICE '────────────────────────────────────────';
  RAISE NOTICE 'Total accounts  : %', v_accounts;
  RAISE NOTICE 'Total contracts : %', v_contracts;
  RAISE NOTICE 'Avg per account : %', ROUND(v_contracts::numeric / NULLIF(v_accounts, 0), 2);

  -- Confirm every account has at least one contract
  IF EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contracts c WHERE c.account_id = a.id
    )
  ) THEN
    RAISE EXCEPTION 'Validation failed: one or more accounts have no contracts.';
  END IF;

  RAISE NOTICE 'Validation passed — every account has at least one contract.';
  RAISE NOTICE '────────────────────────────────────────';
END $$;


-- ── Spot-check queries (run manually to verify) ───────────────────────────────

-- Contracts by status
-- SELECT status, COUNT(*) AS total
-- FROM public.contracts
-- GROUP BY status
-- ORDER BY total DESC;

-- Contracts per account (distribution)
-- SELECT contract_count, COUNT(*) AS accounts
-- FROM (
--   SELECT account_id, COUNT(*) AS contract_count
--   FROM public.contracts
--   GROUP BY account_id
-- ) sub
-- GROUP BY contract_count
-- ORDER BY contract_count;

-- Full contract list with account name
-- SELECT a.account_name, c.entity_name, c.effective_date, c.renewal_date,
--        c.renewal_term_months, c.auto_renew, c.status
-- FROM public.contracts c
-- JOIN public.accounts a ON a.id = c.account_id
-- ORDER BY a.account_name, c.effective_date;
