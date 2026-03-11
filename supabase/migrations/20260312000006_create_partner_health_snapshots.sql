-- ── partner_health_snapshots ──────────────────────────────────────────────────
-- One row per partner per calendar month. Used for trend analysis.
-- Populated by snapshot_all_partner_health() called from the admin route
-- or a scheduled trigger on the first of each month.

CREATE TABLE public.partner_health_snapshots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid        NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  snapshot_month  date        NOT NULL,
  overall_score   smallint,
  category_scores jsonb,
  metric_summary  jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, snapshot_month)
);

ALTER TABLE public.partner_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_health_snapshots: select visible"
  ON public.partner_health_snapshots FOR SELECT
  USING (public.can_view_partner(auth.uid(), partner_id));

CREATE POLICY "partner_health_snapshots: insert visible"
  ON public.partner_health_snapshots FOR INSERT
  WITH CHECK (public.can_view_partner(auth.uid(), partner_id));


-- ── snapshot_all_partner_health() ────────────────────────────────────────────
-- Captures the current score for all active partners into the snapshots table.
-- Safe to call multiple times per month (ON CONFLICT DO NOTHING).
-- Called from POST /api/admin/partner-health-config/snapshot

CREATE OR REPLACE FUNCTION public.snapshot_all_partner_health()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month date;
  v_count int := 0;
BEGIN
  v_month := DATE_TRUNC('month', NOW())::date;

  INSERT INTO public.partner_health_snapshots (
    partner_id, snapshot_month, overall_score, category_scores, metric_summary
  )
  SELECT
    phs.partner_id,
    v_month,
    phs.overall_score,
    phs.category_scores,
    (
      SELECT COALESCE(jsonb_object_agg(pm.metric_key, pm.metric_value), '{}')
      FROM   public.partner_metrics pm
      WHERE  pm.partner_id = phs.partner_id
        AND  pm.metric_date = v_month
    )
  FROM public.partner_health_scores phs
  JOIN public.partners p ON p.id = phs.partner_id
  WHERE p.status != 'churned'
  ON CONFLICT (partner_id, snapshot_month) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
