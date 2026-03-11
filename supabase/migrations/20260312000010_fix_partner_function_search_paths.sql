-- Lock all new partner-module functions to an empty search_path.
-- This resolves the Supabase Security Advisor "Function Search Path Mutable"
-- warning. All functions already use fully-qualified public.* references
-- so this change is safe.

ALTER FUNCTION public.can_view_partner(uid uuid, p_id uuid)
  SET search_path = '';

ALTER FUNCTION public.can_view_note_entity(uid uuid, etype text, eid uuid)
  SET search_path = '';

ALTER FUNCTION public.evaluate_partner_alerts(p_partner_id uuid)
  SET search_path = '';

ALTER FUNCTION public.recompute_partner_health_score(p_partner_id uuid)
  SET search_path = '';

ALTER FUNCTION public.recompute_all_partner_health_scores()
  SET search_path = '';

ALTER FUNCTION public.tg_partner_metrics_recompute()
  SET search_path = '';

ALTER FUNCTION public.tg_notes_recompute_health()
  SET search_path = '';

ALTER FUNCTION public.snapshot_all_partner_health()
  SET search_path = '';

ALTER FUNCTION public.get_partners_page(text, text, text, text, uuid)
  SET search_path = '';
