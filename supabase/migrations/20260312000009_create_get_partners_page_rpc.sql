-- ── get_partners_page() ───────────────────────────────────────────────────────
-- Returns the full partner list dataset in one round-trip.
-- SECURITY INVOKER: RLS is enforced for the calling user.
-- Optional filters: search, status, tier, type, owner.

CREATE OR REPLACE FUNCTION public.get_partners_page(
  p_search   text DEFAULT NULL,
  p_status   text DEFAULT NULL,
  p_tier     text DEFAULT NULL,
  p_type     text DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id                   uuid,
  partner_name         text,
  partner_type         text,
  tier                 text,
  status               text,
  region               text,
  country              text,
  website              text,
  description          text,
  account_id           uuid,
  account_manager_id   uuid,
  account_manager_name text,
  account_name         text,
  overall_score        smallint,
  health_status        text,
  risk_score           smallint,
  growth_score         smallint,
  confidence_score     smallint,
  category_scores      jsonb,
  computed_at          timestamptz,
  score_delta_3mo      int,
  days_since_last_note int,
  active_alert_count   int,
  top_alert_severity   text,
  created_at           timestamptz,
  updated_at           timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    p.id,
    p.partner_name,
    p.partner_type,
    p.tier,
    p.status,
    p.region,
    p.country,
    p.website,
    p.description,
    p.account_id,
    p.account_manager_id,
    mgr.full_name                                           AS account_manager_name,
    a.account_name,
    phs.overall_score,
    phs.health_status,
    phs.risk_score,
    phs.growth_score,
    phs.confidence_score,
    phs.category_scores,
    phs.computed_at,
    -- Trend: current score minus 3-month-old snapshot
    (
      phs.overall_score::int
      - COALESCE(snap3.overall_score::int, phs.overall_score::int)
    )                                                       AS score_delta_3mo,
    -- Days since last partner note (CRM-native)
    GREATEST(0, FLOOR(
      EXTRACT(EPOCH FROM (NOW() - ln.last_note_at)) / 86400
    ))::int                                                 AS days_since_last_note,
    -- Active alert summary
    COALESCE(al.active_count, 0)::int                       AS active_alert_count,
    al.top_severity                                         AS top_alert_severity,
    p.created_at,
    p.updated_at
  FROM public.partners p
  LEFT JOIN public.profiles mgr
    ON mgr.id = p.account_manager_id
  LEFT JOIN public.accounts a
    ON a.id = p.account_id
  LEFT JOIN public.partner_health_scores phs
    ON phs.partner_id = p.id
  LEFT JOIN public.partner_health_snapshots snap3
    ON snap3.partner_id = p.id
   AND snap3.snapshot_month = DATE_TRUNC('month', NOW() - INTERVAL '3 months')::date
  LEFT JOIN LATERAL (
    SELECT MAX(n.created_at) AS last_note_at
    FROM   public.notes n
    WHERE  n.entity_type = 'partner'
      AND  n.entity_id   = p.id
  ) ln ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int                                         AS active_count,
      CASE MAX(
        CASE severity
          WHEN 'critical' THEN 3
          WHEN 'warning'  THEN 2
          ELSE 1
        END
      )
        WHEN 3 THEN 'critical'
        WHEN 2 THEN 'warning'
        WHEN 1 THEN 'info'
        ELSE NULL
      END                                                   AS top_severity
    FROM public.partner_health_alerts pha
    WHERE pha.partner_id = p.id
      AND pha.is_active  = true
  ) al ON true
  WHERE
    (  p_search   IS NULL
    OR p.partner_name ILIKE '%' || p_search || '%'
    OR a.account_name ILIKE '%' || p_search || '%'
    )
    AND (p_status   IS NULL OR p.status       = p_status)
    AND (p_tier     IS NULL OR p.tier         = p_tier)
    AND (p_type     IS NULL OR p.partner_type = p_type)
    AND (p_owner_id IS NULL OR p.account_manager_id = p_owner_id)
  ORDER BY
    COALESCE(phs.overall_score, -1) DESC,
    p.partner_name
$$;
