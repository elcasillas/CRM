-- ── recompute_deal_health_score(p_deal_id) ────────────────────────────────────
-- Re-implements the TypeScript health scoring logic from lib/deal-health-score.ts
-- directly in Postgres so scores stay current without an API round-trip.
-- Called by triggers on `deals` and `notes`, and by the admin recalculate route.

CREATE OR REPLACE FUNCTION public.recompute_deal_health_score(p_deal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- deal + stage
  v_value_amount     numeric;
  v_close_date       date;
  v_last_activity_at timestamptz;
  v_stage_name       text;
  v_win_probability  numeric;

  -- notes
  v_latest_note_at   timestamptz;
  v_all_notes_text   text;
  v_notes_lower      text;

  -- config (defaults match lib/deal-health-score.ts)
  v_cfg              jsonb;
  v_w_stage          numeric := 25;
  v_w_velocity       numeric := 20;
  v_w_recency        numeric := 15;
  v_w_close          numeric := 10;
  v_w_acv            numeric := 15;
  v_w_notes          numeric := 15;
  v_positive_kws     text[]  := ARRAY['budget confirmed','legal engaged','exec sponsor',
                                       'timeline committed','verbal commit','procurement'];
  v_negative_kws     text[]  := ARRAY['no response','circling back','waiting on approval',
                                       'reviewing internally','pushed','delayed','stalled'];

  -- ACV percentile
  v_acv_below        bigint;
  v_acv_total        bigint;

  -- component scores
  v_s_stage          smallint;
  v_s_velocity       smallint;
  v_s_recency        smallint;
  v_s_close          smallint;
  v_s_acv            smallint;
  v_s_notes          smallint;

  -- helpers
  v_days_since       numeric;   -- days since last_activity_at (for velocity)
  v_days_recency     numeric;   -- days since latest note / last activity (for recency)
  v_days_until       int;       -- days until close date (for close date integrity)
  v_recency_ts       timestamptz;
  v_stage_key        text;
  v_benchmark        numeric;
  v_ratio            numeric;
  v_close_base       int;
  v_push_count       int;
  v_note_score       int;
  v_pos_kws_found    text[] := '{}';
  v_neg_kws_found    text[] := '{}';
  v_total_weight     numeric;
  v_score            int;
  v_debug            jsonb;
  kw                 text;
BEGIN
  -- ── 1. Load deal + stage ───────────────────────────────────────────────────
  SELECT d.value_amount, d.close_date, d.last_activity_at,
         ds.stage_name, ds.win_probability
  INTO   v_value_amount, v_close_date, v_last_activity_at,
         v_stage_name, v_win_probability
  FROM   public.deals d
  LEFT JOIN public.deal_stages ds ON ds.id = d.stage_id
  WHERE  d.id = p_deal_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- ── 2. Load notes ──────────────────────────────────────────────────────────
  SELECT MAX(n.created_at),
         COALESCE(string_agg(n.note_text, ' ' ORDER BY n.created_at DESC), '')
  INTO   v_latest_note_at, v_all_notes_text
  FROM   public.notes n
  WHERE  n.entity_type = 'deal'
    AND  n.entity_id   = p_deal_id;

  v_notes_lower := lower(coalesce(v_all_notes_text, ''));

  -- ── 3. Load config (keep defaults if no row exists) ───────────────────────
  SELECT row_to_json(c)::jsonb INTO v_cfg
  FROM   public.health_score_config c
  LIMIT  1;

  IF v_cfg IS NOT NULL THEN
    v_w_stage    := COALESCE((v_cfg->'weights'->>'stageProbability')::numeric,   v_w_stage);
    v_w_velocity := COALESCE((v_cfg->'weights'->>'velocity')::numeric,           v_w_velocity);
    v_w_recency  := COALESCE((v_cfg->'weights'->>'activityRecency')::numeric,    v_w_recency);
    v_w_close    := COALESCE((v_cfg->'weights'->>'closeDateIntegrity')::numeric, v_w_close);
    v_w_acv      := COALESCE((v_cfg->'weights'->>'acv')::numeric,                v_w_acv);
    v_w_notes    := COALESCE((v_cfg->'weights'->>'notesSignal')::numeric,        v_w_notes);
    IF (v_cfg->'keywords'->'positive') IS NOT NULL THEN
      v_positive_kws := ARRAY(SELECT jsonb_array_elements_text(v_cfg->'keywords'->'positive'));
    END IF;
    IF (v_cfg->'keywords'->'negative') IS NOT NULL THEN
      v_negative_kws := ARRAY(SELECT jsonb_array_elements_text(v_cfg->'keywords'->'negative'));
    END IF;
  END IF;

  -- ── 4. stageProbability ────────────────────────────────────────────────────
  IF v_win_probability IS NULL THEN
    v_s_stage := 35;
  ELSE
    v_s_stage := GREATEST(0, LEAST(100, v_win_probability::int));
  END IF;

  -- ── 5. velocity (days since last_activity_at vs stage benchmark) ──────────
  IF v_last_activity_at IS NULL THEN
    v_s_velocity := 70;
  ELSE
    v_days_since := GREATEST(0, FLOOR(
      EXTRACT(EPOCH FROM (date_trunc('day', now()) - date_trunc('day', v_last_activity_at)))
      / 86400
    ));
    v_stage_key := lower(coalesce(v_stage_name, ''));
    v_benchmark :=
      CASE v_stage_key
        WHEN 'solution qualified'    THEN 14
        WHEN 'presenting to edm'     THEN 21
        WHEN 'short listed'          THEN 21
        WHEN 'contract negotiations' THEN 28
        WHEN 'contract signed'       THEN 14
        WHEN 'implementing'          THEN 30
        ELSE                              21
      END;
    v_ratio := v_days_since / v_benchmark;
    v_s_velocity :=
      CASE
        WHEN v_ratio <= 0.8 THEN 100
        WHEN v_ratio <= 1.2 THEN 70
        WHEN v_ratio <= 1.5 THEN 40
        ELSE                     10
      END;
  END IF;

  -- ── 6. activityRecency (days since latest note or last_activity_at) ────────
  v_recency_ts := COALESCE(v_latest_note_at, v_last_activity_at);
  IF v_recency_ts IS NULL THEN
    v_s_recency := 40;
  ELSE
    v_days_recency := GREATEST(0, FLOOR(
      EXTRACT(EPOCH FROM (date_trunc('day', now()) - date_trunc('day', v_recency_ts)))
      / 86400
    ));
    v_s_recency :=
      CASE
        WHEN v_days_recency <= 7  THEN 100
        WHEN v_days_recency <= 14 THEN 70
        WHEN v_days_recency <= 30 THEN 40
        ELSE                           10
      END;
  END IF;

  -- ── 7. closeDateIntegrity ──────────────────────────────────────────────────
  IF v_close_date IS NULL THEN
    v_close_base := 60;
  ELSE
    v_days_until := (v_close_date - CURRENT_DATE)::int;
    v_stage_key  := lower(coalesce(v_stage_name, ''));
    IF v_days_until < 0 THEN
      v_close_base := CASE WHEN v_stage_key LIKE '%implement%' OR v_stage_key LIKE '%won%' THEN 100 ELSE 10 END;
    ELSIF v_days_until <= 30 THEN
      v_close_base := 70;
    ELSE
      v_close_base := 100;
    END IF;
  END IF;
  -- Deduct 20 pts per push signal found in notes
  v_push_count := 0;
  IF v_notes_lower LIKE '%pushed%'      THEN v_push_count := v_push_count + 1; END IF;
  IF v_notes_lower LIKE '%delayed%'     THEN v_push_count := v_push_count + 1; END IF;
  IF v_notes_lower LIKE '%moved out%'   THEN v_push_count := v_push_count + 1; END IF;
  IF v_notes_lower LIKE '%rescheduled%' THEN v_push_count := v_push_count + 1; END IF;
  v_s_close := GREATEST(10, LEAST(100, v_close_base - v_push_count * 20));

  -- ── 8. ACV percentile ─────────────────────────────────────────────────────
  IF v_value_amount IS NULL OR v_value_amount <= 0 THEN
    v_s_acv := 40;
  ELSE
    SELECT COUNT(*) FILTER (WHERE value_amount < v_value_amount),
           COUNT(*)
    INTO   v_acv_below, v_acv_total
    FROM   public.deals
    WHERE  value_amount IS NOT NULL AND value_amount > 0;

    IF v_acv_total = 0 THEN
      v_s_acv := 40;
    ELSIF v_acv_below::numeric / v_acv_total >= 0.8 THEN
      v_s_acv := 100;
    ELSIF v_acv_below::numeric / v_acv_total >= 0.4 THEN
      v_s_acv := 70;
    ELSE
      v_s_acv := 40;
    END IF;
  END IF;

  -- ── 9. notesSignal (keyword matching) ─────────────────────────────────────
  v_note_score := 50;
  FOREACH kw IN ARRAY v_positive_kws LOOP
    IF v_notes_lower LIKE '%' || kw || '%' THEN
      v_note_score       := v_note_score + 10;
      v_pos_kws_found    := v_pos_kws_found || kw;
    END IF;
  END LOOP;
  FOREACH kw IN ARRAY v_negative_kws LOOP
    IF v_notes_lower LIKE '%' || kw || '%' THEN
      v_note_score       := v_note_score - 10;
      v_neg_kws_found    := v_neg_kws_found || kw;
    END IF;
  END LOOP;
  v_s_notes := GREATEST(0, LEAST(100, v_note_score));

  -- ── 10. Weighted composite score ──────────────────────────────────────────
  v_total_weight := v_w_stage + v_w_velocity + v_w_recency + v_w_close + v_w_acv + v_w_notes;
  v_score := GREATEST(0, LEAST(100, ROUND(
    (v_w_stage    * v_s_stage    +
     v_w_velocity * v_s_velocity +
     v_w_recency  * v_s_recency  +
     v_w_close    * v_s_close    +
     v_w_acv      * v_s_acv      +
     v_w_notes    * v_s_notes)
    / v_total_weight
  )));

  v_debug := jsonb_build_object(
    'daysSinceActivity', v_days_since,
    'stageName',         v_stage_name,
    'notesKeywords',     jsonb_build_object(
      'positive', to_jsonb(v_pos_kws_found),
      'negative', to_jsonb(v_neg_kws_found)
    )
  );

  -- ── 11. Persist ────────────────────────────────────────────────────────────
  UPDATE public.deals
  SET    health_score         = v_score,
         hs_stage_probability = v_s_stage,
         hs_velocity          = v_s_velocity,
         hs_activity_recency  = v_s_recency,
         hs_close_date        = v_s_close,
         hs_acv               = v_s_acv,
         hs_notes_signal      = v_s_notes,
         health_debug         = v_debug
  WHERE  id = p_deal_id;
END;
$$;


-- ── Bulk helper used by the admin recalculate endpoint ─────────────────────────

CREATE OR REPLACE FUNCTION public.recompute_all_deal_health_scores()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
  v_id    uuid;
BEGIN
  FOR v_id IN SELECT id FROM public.deals LOOP
    PERFORM public.recompute_deal_health_score(v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;


-- ── Trigger: notes → recompute health for the affected deal ──────────────────

CREATE OR REPLACE FUNCTION public.tg_notes_recompute_health()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.entity_type = 'deal' THEN
      PERFORM public.recompute_deal_health_score(OLD.entity_id);
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle moved notes (rare but correct)
    IF OLD.entity_type = 'deal' AND OLD.entity_id IS DISTINCT FROM NEW.entity_id THEN
      PERFORM public.recompute_deal_health_score(OLD.entity_id);
    END IF;
    IF NEW.entity_type = 'deal' THEN
      PERFORM public.recompute_deal_health_score(NEW.entity_id);
    END IF;
    RETURN NEW;
  ELSE -- INSERT
    IF NEW.entity_type = 'deal' THEN
      PERFORM public.recompute_deal_health_score(NEW.entity_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tg_notes_health ON public.notes;
CREATE TRIGGER tg_notes_health
AFTER INSERT OR UPDATE OR DELETE ON public.notes
FOR EACH ROW EXECUTE FUNCTION public.tg_notes_recompute_health();


-- ── Trigger: deals → recompute health when score-relevant columns change ──────
-- UPDATE OF column list prevents infinite loop when we write back health columns.

CREATE OR REPLACE FUNCTION public.tg_deals_recompute_health()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.recompute_deal_health_score(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_deals_health ON public.deals;
CREATE TRIGGER tg_deals_health
AFTER INSERT OR UPDATE OF stage_id, value_amount, close_date, last_activity_at
ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.tg_deals_recompute_health();
