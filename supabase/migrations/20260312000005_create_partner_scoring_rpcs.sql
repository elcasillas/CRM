-- ── evaluate_partner_alerts(p_partner_id) ────────────────────────────────────
-- Evaluates rule-based conditions against the current partner health score and
-- stored metrics, then upserts active alerts and resolves stale ones.
-- Must be defined BEFORE recompute_partner_health_score (which calls it).

CREATE OR REPLACE FUNCTION public.evaluate_partner_alerts(p_partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score        record;
  v_mrr          numeric;
  v_overdue_bal  numeric;
  v_churn_rate   numeric;
  v_days_note    int;
  v_stale_days   int := 30;
  v_metric_date  date;

  -- (no helper type needed — alerts handled via direct INSERT/UPDATE)
BEGIN
  -- Load current score
  SELECT * INTO v_score
  FROM public.partner_health_scores
  WHERE partner_id = p_partner_id;

  -- Load config stale_days
  SELECT COALESCE(stale_days, 30) INTO v_stale_days
  FROM public.partner_health_config LIMIT 1;

  -- Load current month metrics
  v_metric_date := DATE_TRUNC('month', NOW())::date;
  SELECT (jsonb_object_agg(metric_key, metric_value)->>'mrr')::numeric
  INTO v_mrr
  FROM public.partner_metrics
  WHERE partner_id = p_partner_id AND metric_date = v_metric_date;

  SELECT (jsonb_object_agg(metric_key, metric_value)->>'overdue_balance')::numeric
  INTO v_overdue_bal
  FROM public.partner_metrics
  WHERE partner_id = p_partner_id AND metric_date = v_metric_date;

  SELECT (jsonb_object_agg(metric_key, metric_value)->>'churn_rate_pct')::numeric
  INTO v_churn_rate
  FROM public.partner_metrics
  WHERE partner_id = p_partner_id AND metric_date = v_metric_date;

  -- Days since last partner note
  SELECT GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - MAX(n.created_at))) / 86400))::int
  INTO v_days_note
  FROM public.notes n
  WHERE n.entity_type = 'partner' AND n.entity_id = p_partner_id;

  -- ── Define alert conditions ───────────────────────────────────────────────

  -- no_engagement: critical if > 2× stale_days since last note
  IF v_days_note IS NOT NULL AND v_days_note > v_stale_days * 2 THEN
    INSERT INTO public.partner_health_alerts (partner_id, alert_type, severity, message, triggered_at, is_active)
    VALUES (
      p_partner_id, 'no_engagement', 'critical',
      'No CRM activity in ' || v_days_note || ' days (threshold: ' || (v_stale_days * 2) || ')',
      NOW(), true
    )
    ON CONFLICT DO NOTHING;
  ELSIF v_days_note IS NOT NULL AND v_days_note > v_stale_days THEN
    INSERT INTO public.partner_health_alerts (partner_id, alert_type, severity, message, triggered_at, is_active)
    VALUES (
      p_partner_id, 'no_engagement', 'warning',
      'No CRM activity in ' || v_days_note || ' days (threshold: ' || v_stale_days || ')',
      NOW(), true
    )
    ON CONFLICT DO NOTHING;
  ELSE
    -- Resolve engagement alerts if condition cleared
    UPDATE public.partner_health_alerts
    SET is_active = false, resolved_at = NOW()
    WHERE partner_id = p_partner_id
      AND alert_type = 'no_engagement'
      AND is_active = true;
  END IF;

  -- churn_risk: critical if churn_rate > 20% and overall score < 40
  IF v_churn_rate IS NOT NULL AND v_churn_rate > 20
     AND v_score.overall_score IS NOT NULL AND v_score.overall_score < 40 THEN
    INSERT INTO public.partner_health_alerts (partner_id, alert_type, severity, message, triggered_at, is_active)
    VALUES (
      p_partner_id, 'churn_risk', 'critical',
      'High churn rate (' || ROUND(v_churn_rate, 1) || '%) with low overall score (' || v_score.overall_score || ')',
      NOW(), true
    )
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.partner_health_alerts
    SET is_active = false, resolved_at = NOW()
    WHERE partner_id = p_partner_id AND alert_type = 'churn_risk' AND is_active = true;
  END IF;

  -- overdue_ar: critical if overdue_balance > 2× MRR
  IF v_overdue_bal IS NOT NULL AND v_mrr IS NOT NULL AND v_mrr > 0
     AND v_overdue_bal > v_mrr * 2 THEN
    INSERT INTO public.partner_health_alerts (partner_id, alert_type, severity, message, triggered_at, is_active)
    VALUES (
      p_partner_id, 'overdue_ar', 'critical',
      'Overdue AR balance exceeds 2× MRR (' || ROUND(v_overdue_bal) || ' vs MRR ' || ROUND(v_mrr) || ')',
      NOW(), true
    )
    ON CONFLICT DO NOTHING;
  ELSIF v_overdue_bal IS NOT NULL AND v_mrr IS NOT NULL AND v_mrr > 0
        AND v_overdue_bal > v_mrr * 0.5 THEN
    INSERT INTO public.partner_health_alerts (partner_id, alert_type, severity, message, triggered_at, is_active)
    VALUES (
      p_partner_id, 'overdue_ar', 'warning',
      'Overdue AR balance is ' || ROUND(v_overdue_bal) || ' (> 0.5× MRR)',
      NOW(), true
    )
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.partner_health_alerts
    SET is_active = false, resolved_at = NOW()
    WHERE partner_id = p_partner_id AND alert_type = 'overdue_ar' AND is_active = true;
  END IF;

  -- low_confidence: warning if confidence < 40
  IF v_score.confidence_score IS NOT NULL AND v_score.confidence_score < 40 THEN
    INSERT INTO public.partner_health_alerts (partner_id, alert_type, severity, message, triggered_at, is_active)
    VALUES (
      p_partner_id, 'low_confidence', 'warning',
      'Data confidence is ' || v_score.confidence_score || '% — enter more metrics for accurate scoring',
      NOW(), true
    )
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.partner_health_alerts
    SET is_active = false, resolved_at = NOW()
    WHERE partner_id = p_partner_id AND alert_type = 'low_confidence' AND is_active = true;
  END IF;

  -- stale_data: info if past day 5 of month and no current-month metrics
  IF EXTRACT(DAY FROM NOW()) > 5 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.partner_metrics
      WHERE partner_id = p_partner_id AND metric_date = v_metric_date
    ) THEN
      INSERT INTO public.partner_health_alerts (partner_id, alert_type, severity, message, triggered_at, is_active)
      VALUES (
        p_partner_id, 'stale_data', 'info',
        'No metric data entered for ' || TO_CHAR(v_metric_date, 'Month YYYY'),
        NOW(), true
      )
      ON CONFLICT DO NOTHING;
    ELSE
      UPDATE public.partner_health_alerts
      SET is_active = false, resolved_at = NOW()
      WHERE partner_id = p_partner_id AND alert_type = 'stale_data' AND is_active = true;
    END IF;
  END IF;
END;
$$;


-- ── recompute_partner_health_score(p_partner_id) ──────────────────────────────
-- Computes the full Partner Health Score using:
--   • Manual metric inputs from partner_metrics (current month)
--   • CRM-native metrics: note freshness, meeting count, deal pipeline
--   • Configurable weights from partner_health_config
-- Upserts result into partner_health_scores.
-- Calls evaluate_partner_alerts() after scoring.

CREATE OR REPLACE FUNCTION public.recompute_partner_health_score(p_partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Config
  v_config           record;
  v_w_revenue        numeric := 20;
  v_w_product        numeric := 15;
  v_w_customer       numeric := 15;
  v_w_engagement     numeric := 15;
  v_w_support        numeric := 10;
  v_w_financial      numeric := 10;
  v_w_growth         numeric := 10;
  v_w_strategic      numeric := 5;
  v_stale_days       int     := 30;
  v_healthy_thresh   int     := 75;
  v_at_risk_thresh   int     := 50;

  -- Metrics
  v_metrics          jsonb   := '{}';
  v_metric_date      date;
  v_partner_acct_id  uuid;

  -- Raw metric values
  v_mrr              numeric;
  v_mrr_growth_qoq   numeric;
  v_mrr_growth_yoy   numeric;
  v_rev_consistency  numeric;
  v_upsell_events    numeric;
  v_rev_concentration numeric;

  v_active_lines     numeric;
  v_portfolio_cov    numeric;
  v_attach_rate      numeric;
  v_adoption_trend   numeric;

  v_active_customers numeric;
  v_net_new_cust     numeric;
  v_churn_rate       numeric;
  v_avg_services     numeric;
  v_activation_vel   numeric;

  v_qbr_count        numeric;
  v_training_pct     numeric;
  v_campaign_pct     numeric;

  v_ticket_vol       numeric;
  v_ticket_trend     numeric;
  v_escalation_rate  numeric;
  v_sla_breach_rate  numeric;
  v_avg_resolution   numeric;

  v_overdue_balance  numeric;
  v_ar_aging         numeric;
  v_dso              numeric;
  v_payment_score    numeric;

  v_expansion_trend  numeric;
  v_launch_ready     numeric;

  v_exec_sponsor     numeric;
  v_beta_participant numeric;
  v_roadmap_sessions numeric;
  v_ai_tools         numeric;
  v_strategic_prio   numeric;

  -- CRM-native
  v_days_since_note  int;
  v_meeting_count    int     := 0;
  v_active_opps      int     := 0;
  v_pipeline_value   numeric := 0;
  v_recent_wins      int     := 0;

  -- Normalized sub-scores (0–100; default 50 = neutral / missing)
  v_n_mrr            numeric := 50;
  v_n_mrr_qoq        numeric := 50;
  v_n_mrr_yoy        numeric := 50;
  v_n_rev_cons       numeric := 50;
  v_n_upsell         numeric := 50;
  v_n_rev_conc       numeric := 50;

  v_n_act_lines      numeric := 50;
  v_n_portfolio      numeric := 50;
  v_n_attach         numeric := 50;
  v_n_adopt_trend    numeric := 50;

  v_n_act_cust       numeric := 50;
  v_n_net_new        numeric := 50;
  v_n_churn          numeric := 50;
  v_n_avg_svc        numeric := 50;
  v_n_activation     numeric := 50;

  v_n_note_fresh     numeric := 50;
  v_n_qbr            numeric := 50;
  v_n_meetings       numeric := 50;
  v_n_training       numeric := 50;
  v_n_campaign       numeric := 50;

  v_n_ticket_vol     numeric := 50;
  v_n_ticket_trend   numeric := 50;
  v_n_escalation     numeric := 50;
  v_n_sla_breach     numeric := 50;
  v_n_resolution     numeric := 50;

  v_n_overdue        numeric := 50;
  v_n_ar_aging       numeric := 50;
  v_n_dso            numeric := 50;
  v_n_payment        numeric := 50;

  v_n_act_opps       numeric := 0;
  v_n_pipeline       numeric := 0;
  v_n_wins           numeric := 0;
  v_n_expansion      numeric := 50;
  v_n_launch         numeric := 50;

  v_n_exec_sponsor   numeric := 50;
  v_n_beta           numeric := 50;
  v_n_roadmap        numeric := 50;
  v_n_ai_tools       numeric := 50;
  v_n_strategic_prio numeric := 50;

  -- Category scores
  v_revenue_score    numeric := 50;
  v_product_score    numeric := 50;
  v_customer_score   numeric := 50;
  v_engagement_score numeric := 50;
  v_support_score    numeric := 50;
  v_financial_score  numeric := 50;
  v_growth_cat       numeric := 50;
  v_strategic_score  numeric := 50;

  -- Aggregate
  v_overall_score    smallint;
  v_health_status    text;
  v_risk_score_val   smallint;
  v_growth_score_val smallint;
  v_confidence       smallint;
  v_filled_count     int     := 0;
  v_total_expected   int     := 20;

  -- MRR percentile
  v_mrr_below        bigint;
  v_mrr_total        bigint;

  v_debug            jsonb;
BEGIN
  -- ── 1. Load config ─────────────────────────────────────────────────────────
  SELECT * INTO v_config FROM public.partner_health_config LIMIT 1;
  IF FOUND AND v_config.category_weights IS NOT NULL THEN
    v_w_revenue    := COALESCE((v_config.category_weights->>'revenue')::numeric,    v_w_revenue);
    v_w_product    := COALESCE((v_config.category_weights->>'product')::numeric,    v_w_product);
    v_w_customer   := COALESCE((v_config.category_weights->>'customer')::numeric,   v_w_customer);
    v_w_engagement := COALESCE((v_config.category_weights->>'engagement')::numeric, v_w_engagement);
    v_w_support    := COALESCE((v_config.category_weights->>'support')::numeric,    v_w_support);
    v_w_financial  := COALESCE((v_config.category_weights->>'financial')::numeric,  v_w_financial);
    v_w_growth     := COALESCE((v_config.category_weights->>'growth')::numeric,     v_w_growth);
    v_w_strategic  := COALESCE((v_config.category_weights->>'strategic')::numeric,  v_w_strategic);
  END IF;
  IF FOUND AND v_config.thresholds IS NOT NULL THEN
    v_healthy_thresh := COALESCE((v_config.thresholds->>'healthy')::int, v_healthy_thresh);
    v_at_risk_thresh := COALESCE((v_config.thresholds->>'at_risk')::int, v_at_risk_thresh);
  END IF;
  IF FOUND THEN
    v_stale_days := COALESCE(v_config.stale_days, v_stale_days);
  END IF;

  -- ── 2. Load current-month metrics ──────────────────────────────────────────
  v_metric_date := DATE_TRUNC('month', NOW())::date;
  SELECT COALESCE(jsonb_object_agg(metric_key, metric_value), '{}')
  INTO   v_metrics
  FROM   public.partner_metrics
  WHERE  partner_id = p_partner_id AND metric_date = v_metric_date;

  -- Count filled metric rows for confidence score
  SELECT COUNT(*)::int INTO v_filled_count
  FROM   public.partner_metrics
  WHERE  partner_id = p_partner_id AND metric_date = v_metric_date
    AND  metric_value IS NOT NULL;

  -- ── 3. Get linked account for CRM-native metrics ───────────────────────────
  SELECT account_id INTO v_partner_acct_id
  FROM   public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- ── 4. CRM-native: days since last partner note ────────────────────────────
  SELECT GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - MAX(n.created_at))) / 86400))::int
  INTO   v_days_since_note
  FROM   public.notes n
  WHERE  n.entity_type = 'partner' AND n.entity_id = p_partner_id;

  -- CRM-native always counted toward confidence
  v_filled_count := v_filled_count + 1;

  -- ── 5. CRM-native: meeting count from notes in last 90 days ───────────────
  SELECT COUNT(*)::int INTO v_meeting_count
  FROM   public.notes n
  WHERE  n.entity_type = 'partner'
    AND  n.entity_id   = p_partner_id
    AND  n.created_at  >= NOW() - INTERVAL '90 days'
    AND  (
      LOWER(n.note_text) LIKE '%meeting%'
      OR LOWER(n.note_text) LIKE '% call%'
      OR LOWER(n.note_text) LIKE '%qbr%'
    );

  v_filled_count := v_filled_count + 1;

  -- ── 6. CRM-native: deals (via linked account) ─────────────────────────────
  IF v_partner_acct_id IS NOT NULL THEN
    SELECT
      COALESCE(COUNT(*)      FILTER (WHERE NOT ds.is_closed),                                                       0)::int,
      COALESCE(SUM(d.value_amount) FILTER (WHERE NOT ds.is_closed),                                                 0),
      COALESCE(COUNT(*)      FILTER (WHERE ds.is_won AND d.updated_at >= NOW() - INTERVAL '90 days'),               0)::int
    INTO v_active_opps, v_pipeline_value, v_recent_wins
    FROM  public.deals d
    LEFT JOIN public.deal_stages ds ON ds.id = d.stage_id
    WHERE d.account_id = v_partner_acct_id;
    v_filled_count := v_filled_count + 3;
  END IF;

  -- ── 7. Extract metric values from jsonb map ────────────────────────────────
  v_mrr               := (v_metrics->>'mrr')::numeric;
  v_mrr_growth_qoq    := (v_metrics->>'mrr_growth_qoq')::numeric;
  v_mrr_growth_yoy    := (v_metrics->>'mrr_growth_yoy')::numeric;
  v_rev_consistency   := (v_metrics->>'revenue_consistency')::numeric;
  v_upsell_events     := (v_metrics->>'upsell_events_qtd')::numeric;
  v_rev_concentration := (v_metrics->>'revenue_concentration')::numeric;

  v_active_lines      := (v_metrics->>'active_product_lines')::numeric;
  v_portfolio_cov     := (v_metrics->>'portfolio_coverage_pct')::numeric;
  v_attach_rate       := (v_metrics->>'attach_rate')::numeric;
  v_adoption_trend    := (v_metrics->>'adoption_trend_pct')::numeric;

  v_active_customers  := (v_metrics->>'active_end_customers')::numeric;
  v_net_new_cust      := (v_metrics->>'net_new_customers_mtd')::numeric;
  v_churn_rate        := (v_metrics->>'churn_rate_pct')::numeric;
  v_avg_services      := (v_metrics->>'avg_services_per_customer')::numeric;
  v_activation_vel    := (v_metrics->>'activation_velocity_days')::numeric;

  v_qbr_count         := (v_metrics->>'qbr_count_ytd')::numeric;
  v_training_pct      := (v_metrics->>'training_completion_pct')::numeric;
  v_campaign_pct      := (v_metrics->>'campaign_participation_pct')::numeric;

  v_ticket_vol        := (v_metrics->>'ticket_volume_30d')::numeric;
  v_ticket_trend      := (v_metrics->>'ticket_trend_pct')::numeric;
  v_escalation_rate   := (v_metrics->>'escalation_rate_pct')::numeric;
  v_sla_breach_rate   := (v_metrics->>'sla_breach_rate_pct')::numeric;
  v_avg_resolution    := (v_metrics->>'avg_resolution_days')::numeric;

  v_overdue_balance   := (v_metrics->>'overdue_balance')::numeric;
  v_ar_aging          := (v_metrics->>'ar_aging_days')::numeric;
  v_dso               := (v_metrics->>'dso')::numeric;
  v_payment_score     := (v_metrics->>'payment_consistency_score')::numeric;

  v_expansion_trend   := (v_metrics->>'expansion_trend_pct')::numeric;
  v_launch_ready      := (v_metrics->>'launch_readiness_score')::numeric;

  v_exec_sponsor      := (v_metrics->>'executive_sponsor_engaged')::numeric;
  v_beta_participant  := (v_metrics->>'beta_participant')::numeric;
  v_roadmap_sessions  := (v_metrics->>'roadmap_sessions_ytd')::numeric;
  v_ai_tools          := (v_metrics->>'ai_tools_adopted')::numeric;
  v_strategic_prio    := (v_metrics->>'strategic_priority_score')::numeric;

  -- ── 8. Normalize metrics to 0-100 sub-scores ──────────────────────────────

  -- REVENUE
  -- MRR: mandatory — null or 0 → score 0; else percentile rank
  IF v_mrr IS NULL OR v_mrr <= 0 THEN
    v_n_mrr := 0;
  ELSE
    SELECT COUNT(*) FILTER (WHERE m2.metric_value < v_mrr),
           COUNT(*) FILTER (WHERE m2.metric_value > 0)
    INTO   v_mrr_below, v_mrr_total
    FROM   public.partner_metrics m2
    WHERE  m2.metric_key = 'mrr' AND m2.metric_date = v_metric_date;
    v_n_mrr := CASE WHEN v_mrr_total = 0 THEN 50
                    ELSE GREATEST(0, LEAST(100, v_mrr_below::numeric / v_mrr_total * 100))
               END;
  END IF;

  IF v_mrr_growth_qoq IS NOT NULL THEN
    v_n_mrr_qoq := GREATEST(0, LEAST(100, 50 + v_mrr_growth_qoq * 5));
  END IF;
  IF v_mrr_growth_yoy IS NOT NULL THEN
    v_n_mrr_yoy := GREATEST(0, LEAST(100, 50 + v_mrr_growth_yoy * 3.33));
  END IF;
  IF v_rev_consistency IS NOT NULL THEN
    v_n_rev_cons := GREATEST(0, LEAST(100, v_rev_consistency));
  END IF;
  IF v_upsell_events IS NOT NULL THEN
    v_n_upsell := GREATEST(0, LEAST(100, v_upsell_events / 5.0 * 100));
  END IF;
  IF v_rev_concentration IS NOT NULL THEN
    v_n_rev_conc := GREATEST(0, LEAST(100, 100 - (v_rev_concentration - 30) * 2));
  END IF;
  v_revenue_score := (v_n_mrr + v_n_mrr_qoq + v_n_mrr_yoy + v_n_rev_cons + v_n_upsell + v_n_rev_conc) / 6.0;

  -- PRODUCT ADOPTION
  IF v_active_lines IS NOT NULL THEN
    v_n_act_lines := GREATEST(0, LEAST(100, v_active_lines / 8.0 * 100));
  END IF;
  IF v_portfolio_cov IS NOT NULL THEN
    v_n_portfolio := GREATEST(0, LEAST(100, v_portfolio_cov));
  END IF;
  IF v_attach_rate IS NOT NULL THEN
    v_n_attach := GREATEST(0, LEAST(100, v_attach_rate / 5.0 * 100));
  END IF;
  IF v_adoption_trend IS NOT NULL THEN
    v_n_adopt_trend := GREATEST(0, LEAST(100, 50 + v_adoption_trend * 2.5));
  END IF;
  v_product_score := (v_n_act_lines + v_n_portfolio + v_n_attach + v_n_adopt_trend) / 4.0;

  -- CUSTOMER BASE HEALTH
  IF v_active_customers IS NOT NULL AND v_active_customers > 0 THEN
    v_n_act_cust := GREATEST(0, LEAST(100, LN(v_active_customers + 1) / LN(1001) * 100));
  END IF;
  IF v_net_new_cust IS NOT NULL THEN
    v_n_net_new := GREATEST(0, LEAST(100, 50 + v_net_new_cust * 2.5));
  END IF;
  IF v_churn_rate IS NOT NULL THEN
    v_n_churn := GREATEST(0, LEAST(100, 100 - v_churn_rate * 10));
  END IF;
  IF v_avg_services IS NOT NULL THEN
    v_n_avg_svc := GREATEST(0, LEAST(100, v_avg_services / 4.0 * 100));
  END IF;
  IF v_activation_vel IS NOT NULL THEN
    v_n_activation := GREATEST(0, LEAST(100, 100 - (v_activation_vel - 7) * 5));
  END IF;
  v_customer_score := (v_n_act_cust + v_n_net_new + v_n_churn + v_n_avg_svc + v_n_activation) / 5.0;

  -- PARTNER ENGAGEMENT
  -- Note freshness (CRM-native — always present)
  IF v_days_since_note IS NOT NULL THEN
    v_n_note_fresh := GREATEST(0, LEAST(100,
      100.0 - v_days_since_note * 100.0 / GREATEST(v_stale_days, 1)));
  ELSE
    v_n_note_fresh := 0; -- no notes ever = 0
  END IF;
  -- Meetings (CRM-native)
  v_n_meetings := GREATEST(0, LEAST(100, v_meeting_count::numeric / 6.0 * 100));
  IF v_qbr_count IS NOT NULL THEN
    v_n_qbr := GREATEST(0, LEAST(100, v_qbr_count / 4.0 * 100));
  END IF;
  IF v_training_pct IS NOT NULL THEN
    v_n_training := GREATEST(0, LEAST(100, v_training_pct));
  END IF;
  IF v_campaign_pct IS NOT NULL THEN
    v_n_campaign := GREATEST(0, LEAST(100, v_campaign_pct));
  END IF;
  v_engagement_score := (v_n_note_fresh + v_n_meetings + v_n_qbr + v_n_training + v_n_campaign) / 5.0;

  -- SUPPORT & OPS
  IF v_ticket_vol IS NOT NULL THEN
    v_n_ticket_vol := GREATEST(0, LEAST(100, 100 - v_ticket_vol * 5));
  END IF;
  IF v_ticket_trend IS NOT NULL THEN
    v_n_ticket_trend := GREATEST(0, LEAST(100, 50 - v_ticket_trend));
  END IF;
  IF v_escalation_rate IS NOT NULL THEN
    v_n_escalation := GREATEST(0, LEAST(100, 100 - v_escalation_rate * 10));
  END IF;
  IF v_sla_breach_rate IS NOT NULL THEN
    v_n_sla_breach := GREATEST(0, LEAST(100, 100 - v_sla_breach_rate * 5));
  END IF;
  IF v_avg_resolution IS NOT NULL THEN
    v_n_resolution := GREATEST(0, LEAST(100, 100 - (v_avg_resolution - 1) * 10));
  END IF;
  v_support_score := (v_n_ticket_vol + v_n_ticket_trend + v_n_escalation + v_n_sla_breach + v_n_resolution) / 5.0;

  -- FINANCIAL HEALTH
  IF v_overdue_balance IS NOT NULL THEN
    IF v_mrr IS NOT NULL AND v_mrr > 0 THEN
      v_n_overdue := GREATEST(0, LEAST(100, 100 - (v_overdue_balance / v_mrr) * 100));
    ELSIF v_overdue_balance = 0 THEN
      v_n_overdue := 100;
    END IF;
  END IF;
  IF v_ar_aging IS NOT NULL THEN
    v_n_ar_aging := GREATEST(0, LEAST(100, 100 - (v_ar_aging - 30) * 2));
  END IF;
  IF v_dso IS NOT NULL THEN
    v_n_dso := GREATEST(0, LEAST(100, 100 - (v_dso - 30) * 2));
  END IF;
  IF v_payment_score IS NOT NULL THEN
    v_n_payment := GREATEST(0, LEAST(100, v_payment_score));
  END IF;
  v_financial_score := (v_n_overdue + v_n_ar_aging + v_n_dso + v_n_payment) / 4.0;

  -- GROWTH MOMENTUM (CRM-native dominant)
  v_n_act_opps := GREATEST(0, LEAST(100, v_active_opps::numeric / 5.0 * 100));
  IF v_pipeline_value > 0 THEN
    v_n_pipeline := GREATEST(0, LEAST(100, LN(v_pipeline_value + 1) / LN(100001) * 100));
  END IF;
  v_n_wins := GREATEST(0, LEAST(100, v_recent_wins::numeric / 3.0 * 100));
  IF v_expansion_trend IS NOT NULL THEN
    v_n_expansion := GREATEST(0, LEAST(100, 50 + v_expansion_trend * 2.5));
  END IF;
  IF v_launch_ready IS NOT NULL THEN
    v_n_launch := GREATEST(0, LEAST(100, v_launch_ready));
  END IF;
  v_growth_cat := (v_n_act_opps + v_n_pipeline + v_n_wins + v_n_expansion + v_n_launch) / 5.0;

  -- STRATEGIC ALIGNMENT
  IF v_exec_sponsor IS NOT NULL THEN
    v_n_exec_sponsor := GREATEST(0, LEAST(100, v_exec_sponsor * 100));
  END IF;
  IF v_beta_participant IS NOT NULL THEN
    v_n_beta := GREATEST(0, LEAST(100, v_beta_participant * 100));
  END IF;
  IF v_roadmap_sessions IS NOT NULL THEN
    v_n_roadmap := GREATEST(0, LEAST(100, v_roadmap_sessions / 2.0 * 100));
  END IF;
  IF v_ai_tools IS NOT NULL THEN
    v_n_ai_tools := GREATEST(0, LEAST(100, v_ai_tools / 3.0 * 100));
  END IF;
  IF v_strategic_prio IS NOT NULL THEN
    v_n_strategic_prio := GREATEST(0, LEAST(100, v_strategic_prio));
  END IF;
  v_strategic_score := (v_n_exec_sponsor + v_n_beta + v_n_roadmap + v_n_ai_tools + v_n_strategic_prio) / 5.0;

  -- ── 9. Confidence score ────────────────────────────────────────────────────
  v_confidence := LEAST(100, ROUND((v_filled_count::numeric / v_total_expected) * 100));

  -- ── 10. Weighted overall score ─────────────────────────────────────────────
  v_overall_score := GREATEST(0, LEAST(100, ROUND(
    (v_revenue_score    * v_w_revenue    +
     v_product_score    * v_w_product    +
     v_customer_score   * v_w_customer   +
     v_engagement_score * v_w_engagement +
     v_support_score    * v_w_support    +
     v_financial_score  * v_w_financial  +
     v_growth_cat       * v_w_growth     +
     v_strategic_score  * v_w_strategic)
    / 100.0
  )));

  -- ── 11. Risk score (financial + support + churn)  ─────────────────────────
  -- High risk = high values; score 100 = no risk
  v_risk_score_val := GREATEST(0, LEAST(100, ROUND(
    100 - (
      (100 - v_n_overdue)    * 0.35 +
      (100 - v_n_churn)      * 0.30 +
      (100 - v_n_escalation) * 0.20 +
      (100 - v_n_sla_breach) * 0.15
    )
  )));

  -- ── 12. Growth score (growth category + revenue momentum) ─────────────────
  v_growth_score_val := GREATEST(0, LEAST(100, ROUND(
    v_growth_cat  * 0.60 +
    v_n_mrr_qoq   * 0.25 +
    v_n_mrr_yoy   * 0.15
  )));

  -- ── 13. Health status ──────────────────────────────────────────────────────
  v_health_status := CASE
    WHEN v_confidence < 30 THEN 'insufficient_data'
    WHEN v_overall_score >= v_healthy_thresh THEN 'healthy'
    WHEN v_overall_score >= v_at_risk_thresh THEN 'at_risk'
    ELSE 'critical'
  END;

  -- ── 14. Build debug object ─────────────────────────────────────────────────
  v_debug := jsonb_build_object(
    'revenue',    jsonb_build_object('score', ROUND(v_revenue_score),    'n_mrr', ROUND(v_n_mrr),      'n_mrr_qoq', ROUND(v_n_mrr_qoq),   'n_mrr_yoy', ROUND(v_n_mrr_yoy)),
    'product',    jsonb_build_object('score', ROUND(v_product_score),    'n_lines', ROUND(v_n_act_lines), 'n_portfolio', ROUND(v_n_portfolio), 'n_attach', ROUND(v_n_attach)),
    'customer',   jsonb_build_object('score', ROUND(v_customer_score),   'n_cust', ROUND(v_n_act_cust), 'n_churn', ROUND(v_n_churn),     'n_net_new', ROUND(v_n_net_new)),
    'engagement', jsonb_build_object('score', ROUND(v_engagement_score), 'days_since_note', v_days_since_note, 'meetings_90d', v_meeting_count, 'n_note_fresh', ROUND(v_n_note_fresh)),
    'support',    jsonb_build_object('score', ROUND(v_support_score),    'n_tickets', ROUND(v_n_ticket_vol), 'n_escalation', ROUND(v_n_escalation)),
    'financial',  jsonb_build_object('score', ROUND(v_financial_score),  'n_overdue', ROUND(v_n_overdue), 'n_payment', ROUND(v_n_payment)),
    'growth',     jsonb_build_object('score', ROUND(v_growth_cat),       'active_opps', v_active_opps, 'pipeline_value', v_pipeline_value, 'recent_wins', v_recent_wins),
    'strategic',  jsonb_build_object('score', ROUND(v_strategic_score),  'n_exec_sponsor', ROUND(v_n_exec_sponsor), 'n_strategic_prio', ROUND(v_n_strategic_prio)),
    'confidence', v_confidence,
    'filled_count', v_filled_count,
    'total_expected', v_total_expected
  );

  -- ── 15. Upsert partner_health_scores ──────────────────────────────────────
  INSERT INTO public.partner_health_scores (
    partner_id, overall_score, health_status,
    risk_score, growth_score, confidence_score,
    category_scores, score_debug, model_version, computed_at
  ) VALUES (
    p_partner_id,
    v_overall_score,
    v_health_status,
    v_risk_score_val,
    v_growth_score_val,
    v_confidence,
    jsonb_build_object(
      'revenue',    ROUND(v_revenue_score)::int,
      'product',    ROUND(v_product_score)::int,
      'customer',   ROUND(v_customer_score)::int,
      'engagement', ROUND(v_engagement_score)::int,
      'support',    ROUND(v_support_score)::int,
      'financial',  ROUND(v_financial_score)::int,
      'growth',     ROUND(v_growth_cat)::int,
      'strategic',  ROUND(v_strategic_score)::int
    ),
    v_debug,
    COALESCE(v_config.model_version, 'phi-1'),
    NOW()
  )
  ON CONFLICT (partner_id) DO UPDATE SET
    overall_score    = EXCLUDED.overall_score,
    health_status    = EXCLUDED.health_status,
    risk_score       = EXCLUDED.risk_score,
    growth_score     = EXCLUDED.growth_score,
    confidence_score = EXCLUDED.confidence_score,
    category_scores  = EXCLUDED.category_scores,
    score_debug      = EXCLUDED.score_debug,
    model_version    = EXCLUDED.model_version,
    computed_at      = EXCLUDED.computed_at;

  -- ── 16. Evaluate alerts based on new score ─────────────────────────────────
  PERFORM public.evaluate_partner_alerts(p_partner_id);
END;
$$;


-- ── recompute_all_partner_health_scores() ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recompute_all_partner_health_scores()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
  v_id    uuid;
BEGIN
  FOR v_id IN SELECT id FROM public.partners WHERE status != 'churned' LOOP
    PERFORM public.recompute_partner_health_score(v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;


-- ── Trigger: partner_metrics INSERT/UPDATE → recompute score ──────────────────

CREATE OR REPLACE FUNCTION public.tg_partner_metrics_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_partner_health_score(OLD.partner_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_partner_health_score(NEW.partner_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tg_partner_metrics_health ON public.partner_metrics;
CREATE TRIGGER tg_partner_metrics_health
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_metrics
  FOR EACH ROW EXECUTE FUNCTION public.tg_partner_metrics_recompute();


-- ── Update tg_notes_recompute_health to also handle 'partner' entity type ─────

CREATE OR REPLACE FUNCTION public.tg_notes_recompute_health()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.entity_type = 'deal' THEN
      PERFORM public.recompute_deal_health_score(OLD.entity_id);
    ELSIF OLD.entity_type = 'partner' THEN
      PERFORM public.recompute_partner_health_score(OLD.entity_id);
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle moved notes (rare but correct)
    IF OLD.entity_type = 'deal' AND OLD.entity_id IS DISTINCT FROM NEW.entity_id THEN
      PERFORM public.recompute_deal_health_score(OLD.entity_id);
    END IF;
    IF OLD.entity_type = 'partner' AND OLD.entity_id IS DISTINCT FROM NEW.entity_id THEN
      PERFORM public.recompute_partner_health_score(OLD.entity_id);
    END IF;
    IF NEW.entity_type = 'deal' THEN
      PERFORM public.recompute_deal_health_score(NEW.entity_id);
    ELSIF NEW.entity_type = 'partner' THEN
      PERFORM public.recompute_partner_health_score(NEW.entity_id);
    END IF;
    RETURN NEW;
  ELSE -- INSERT
    IF NEW.entity_type = 'deal' THEN
      PERFORM public.recompute_deal_health_score(NEW.entity_id);
    ELSIF NEW.entity_type = 'partner' THEN
      PERFORM public.recompute_partner_health_score(NEW.entity_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;
