-- Add new value fields to deals
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS amount               NUMERIC,
  ADD COLUMN IF NOT EXISTS contract_term_months INTEGER,
  ADD COLUMN IF NOT EXISTS total_contract_value NUMERIC;

-- Drop and recreate get_deals_page to change its return type
DROP FUNCTION IF EXISTS public.get_deals_page(text, uuid, uuid, boolean, boolean, int);

CREATE FUNCTION public.get_deals_page(
  p_search       text    DEFAULT NULL,
  p_stage_id     uuid    DEFAULT NULL,
  p_owner_id     uuid    DEFAULT NULL,
  p_stale_only   boolean DEFAULT false,
  p_overdue_only boolean DEFAULT false,
  p_stale_days   int     DEFAULT 30
)
RETURNS TABLE (
  -- deal core columns
  id                    uuid,
  deal_name             text,
  deal_description      text,
  account_id            uuid,
  stage_id              uuid,
  deal_owner_id         uuid,
  solutions_engineer_id uuid,
  amount                numeric,
  contract_term_months  int,
  total_contract_value  numeric,
  value_amount          numeric,
  currency              text,
  close_date            date,
  last_activity_at      timestamptz,
  created_at            timestamptz,
  updated_at            timestamptz,
  health_score          smallint,
  hs_stage_probability  smallint,
  hs_velocity           smallint,
  hs_activity_recency   smallint,
  hs_close_date         smallint,
  hs_acv                smallint,
  hs_notes_signal       smallint,
  health_debug          jsonb,
  notes_hash            text,
  -- joined fields
  account_name          text,
  stage_name            text,
  stage_sort_order      int,
  stage_is_closed       boolean,
  stage_is_won          boolean,
  stage_is_lost         boolean,
  deal_owner_name       text,
  se_name               text,
  -- derived fields
  last_note_at          timestamptz,
  is_stale              boolean,
  is_overdue            boolean
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    d.id,
    d.deal_name,
    d.deal_description,
    d.account_id,
    d.stage_id,
    d.deal_owner_id,
    d.solutions_engineer_id,
    d.amount,
    d.contract_term_months,
    d.total_contract_value,
    d.value_amount,
    d.currency,
    d.close_date,
    d.last_activity_at,
    d.created_at,
    d.updated_at,
    d.health_score,
    d.hs_stage_probability,
    d.hs_velocity,
    d.hs_activity_recency,
    d.hs_close_date,
    d.hs_acv,
    d.hs_notes_signal,
    d.health_debug,
    d.notes_hash,
    -- joined
    a.account_name,
    ds.stage_name,
    ds.sort_order   AS stage_sort_order,
    ds.is_closed    AS stage_is_closed,
    ds.is_won       AS stage_is_won,
    ds.is_lost      AS stage_is_lost,
    owner.full_name AS deal_owner_name,
    se.full_name    AS se_name,
    -- last note timestamp via lateral aggregation (one pass per deal)
    ln.last_note_at,
    -- is_stale: true when last note is older than p_stale_days; false when no notes
    COALESCE(
      ln.last_note_at < now() - (p_stale_days || ' days')::interval,
      false
    ) AS is_stale,
    -- is_overdue: past close date and stage not yet closed
    (
      d.close_date IS NOT NULL
      AND d.close_date < current_date
      AND NOT ds.is_closed
    ) AS is_overdue
  FROM  public.deals d
  LEFT JOIN public.accounts    a     ON a.id    = d.account_id
  LEFT JOIN public.deal_stages ds    ON ds.id   = d.stage_id
  LEFT JOIN public.profiles    owner ON owner.id = d.deal_owner_id
  LEFT JOIN public.profiles    se    ON se.id   = d.solutions_engineer_id
  LEFT JOIN LATERAL (
    SELECT MAX(n.created_at) AS last_note_at
    FROM   public.notes n
    WHERE  n.entity_type = 'deal'
      AND  n.entity_id   = d.id
  ) ln ON true
  WHERE
    (  p_search IS NULL
    OR d.deal_name   ILIKE '%' || p_search || '%'
    OR a.account_name ILIKE '%' || p_search || '%'
    )
    AND (p_stage_id     IS NULL OR d.stage_id      = p_stage_id)
    AND (p_owner_id     IS NULL OR d.deal_owner_id = p_owner_id)
    AND (
      NOT p_stale_only
      OR COALESCE(
           ln.last_note_at < now() - (p_stale_days || ' days')::interval,
           false
         )
    )
    AND (
      NOT p_overdue_only
      OR (
        d.close_date IS NOT NULL
        AND d.close_date < current_date
        AND NOT ds.is_closed
      )
    )
  ORDER BY d.last_activity_at DESC NULLS LAST
$$;
