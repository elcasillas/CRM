-- ============================================================
-- Reseed contracts — fixes random filtering from migration 000006.
-- The prior migration generated exactly 1 contract per account
-- because random() in WHERE was optimised away by the planner.
-- Solution: materialise random values in a subquery (CTE) before
-- the WHERE filter is applied.
-- ============================================================


-- ── Step 1: Clear existing contracts (and any linked notes) ──────────────────
TRUNCATE TABLE public.contracts CASCADE;


-- ── Step 2: Materialise candidate rows with their random values ───────────────
-- We compute random() inside a CTE so the planner cannot fold it into the
-- WHERE predicate — every candidate row gets its own draw.

WITH candidates AS (
  SELECT
    a.id            AS account_id,
    a.industry,
    gs.n,
    -- Pre-draw the "keep?" coin for n = 2 and n = 3
    random()        AS r_keep,
    -- Pre-draw all other random values used in the SELECT list
    random()        AS r_name,
    random()        AS r_name_alt,
    random()        AS r_eff,
    random()        AS r_ren,
    random()        AS r_term,
    random()        AS r_auto,
    random()        AS r_status
  FROM public.accounts a
  CROSS JOIN generate_series(1, 3) AS gs(n)
),

-- ── Step 3: Filter to 1–3 contracts per account ──────────────────────────────
-- n = 1 : always kept        (100 %)
-- n = 2 : kept ~60 % of the time
-- n = 3 : kept ~30 % of the time
filtered AS (
  SELECT * FROM candidates
  WHERE n = 1
     OR (n = 2 AND r_keep < 0.60)
     OR (n = 3 AND r_keep < 0.30)
)

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
    account_id,

    -- ── Entity name ──────────────────────────────────────────────────────────
    CASE n
      WHEN 1 THEN
        -- Industry-specific primary agreement
        CASE industry
          WHEN 'Teleco'  THEN
            (ARRAY[
              'Telecommunications Service Contract',
              'Carrier Services Agreement',
              'Telco Infrastructure Agreement'
            ])[floor(r_name * 3 + 1)::int]
          WHEN 'Cableco' THEN
            (ARRAY[
              'Cable Infrastructure Agreement',
              'Broadband Services Contract',
              'Cable Plant Maintenance Agreement'
            ])[floor(r_name * 3 + 1)::int]
          WHEN 'Hoster'  THEN
            (ARRAY[
              'Hosting Services Agreement',
              'Managed Hosting Contract',
              'Data Centre Colocation Agreement'
            ])[floor(r_name * 3 + 1)::int]
          WHEN 'ISP'     THEN
            (ARRAY[
              'Enterprise Internet Services Agreement',
              'Internet Access Service Contract',
              'Wholesale Connectivity Agreement'
            ])[floor(r_name * 3 + 1)::int]
          WHEN 'MSP'     THEN
            (ARRAY[
              'Managed Services Agreement',
              'IT Managed Services Contract',
              'Network Management Services Agreement'
            ])[floor(r_name * 3 + 1)::int]
          ELSE
            (ARRAY[
              'Master Services Agreement',
              'Enterprise Software License Agreement',
              'Platform Services Contract'
            ])[floor(r_name * 3 + 1)::int]
        END

      WHEN 2 THEN
        (ARRAY[
          'Service Level Agreement',
          'Statement of Work — Professional Services',
          'Support & Maintenance Addendum',
          'Data Processing Agreement',
          'Security Services Addendum',
          'Professional Services Agreement'
        ])[floor(r_name * 6 + 1)::int]

      ELSE  -- n = 3
        (ARRAY[
          'Renewal Amendment No. 1',
          'Supplemental Services Agreement',
          'Managed Security Services Addendum',
          'Cloud Migration Statement of Work',
          'Disaster Recovery Services Addendum',
          'Training & Onboarding Agreement'
        ])[floor(r_name * 6 + 1)::int]
    END AS entity_name,

    -- ── Effective date ───────────────────────────────────────────────────────
    -- n=1 : 6 months – 5 years ago   (primary agreements tend to be older)
    -- n=2 : 3 months – 3 years ago
    -- n=3 : 1 month  – 2 years ago   (addendums tend to be newer)
    CURRENT_DATE - (
      CASE n
        WHEN 1 THEN (floor(r_eff * (5 * 365 - 180)) + 180)::int
        WHEN 2 THEN (floor(r_eff * (3 * 365 -  90)) +  90)::int
        ELSE        (floor(r_eff * (2 * 365 -  30)) +  30)::int
      END
    ) AS effective_date,

    -- ── Renewal date ────────────────────────────────────────────────────────
    -- Random date between today and 5 years from now.
    CURRENT_DATE + (floor(r_ren * 5 * 365)::int) AS renewal_date,

    -- ── Renewal term ────────────────────────────────────────────────────────
    (ARRAY[12, 24, 36, 48, 60])[floor(r_term * 5 + 1)::int] AS renewal_term_months,

    -- ── Auto renew ──────────────────────────────────────────────────────────
    (r_auto > 0.45) AS auto_renew,

    -- ── Status ──────────────────────────────────────────────────────────────
    -- Weighted: active ≈ 50%, pending ≈ 12.5%, expired ≈ 12.5%, cancelled ≈ 25%
    -- (cancelled slightly elevated to reflect real-world churn)
    (ARRAY[
      'active', 'active', 'active', 'active',
      'pending',
      'expired',
      'cancelled', 'cancelled'
    ])[floor(r_status * 8 + 1)::int] AS status

FROM filtered;


-- ── Step 4: Validation ───────────────────────────────────────────────────────
DO $$
DECLARE
  v_accounts  int;
  v_contracts int;
  r           record;
BEGIN
  SELECT COUNT(*) INTO v_accounts  FROM public.accounts;
  SELECT COUNT(*) INTO v_contracts FROM public.contracts;

  RAISE NOTICE '────────────────────────────────────────────────────────';
  RAISE NOTICE 'Total accounts  : %', v_accounts;
  RAISE NOTICE 'Total contracts : %', v_contracts;
  RAISE NOTICE 'Avg per account : %', ROUND(v_contracts::numeric / NULLIF(v_accounts, 0), 2);
  RAISE NOTICE '';

  -- Print contract count distribution
  RAISE NOTICE 'Distribution (contracts per account):';
  FOR r IN
    SELECT cnt, COUNT(*) AS accounts
    FROM (
      SELECT account_id, COUNT(*) AS cnt
      FROM public.contracts
      GROUP BY account_id
    ) sub
    GROUP BY cnt
    ORDER BY cnt
  LOOP
    RAISE NOTICE '  % contract(s) → % account(s)', r.cnt, r.accounts;
  END LOOP;

  RAISE NOTICE '';

  -- Print status breakdown
  RAISE NOTICE 'Status breakdown:';
  FOR r IN
    SELECT status, COUNT(*) AS total
    FROM public.contracts
    GROUP BY status
    ORDER BY total DESC
  LOOP
    RAISE NOTICE '  %-12s : %', r.status, r.total;
  END LOOP;

  -- Guard: every account must have at least one contract
  IF EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contracts c WHERE c.account_id = a.id
    )
  ) THEN
    RAISE EXCEPTION 'Validation failed: one or more accounts have no contracts.';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Validation passed — every account has at least one contract.';
  RAISE NOTICE '────────────────────────────────────────────────────────';
END $$;
