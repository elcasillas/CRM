-- Fix: set search_path = '' on all public functions to resolve
-- Supabase Security Advisor warning "Function Search Path Mutable".
--
-- All functions already use fully-qualified public.* references so
-- locking the search path to an empty string is safe with no other changes.

ALTER FUNCTION public.set_updated_at()
  SET search_path = '';

ALTER FUNCTION public.handle_new_user()
  SET search_path = '';

ALTER FUNCTION public.is_admin(uid uuid)
  SET search_path = '';

ALTER FUNCTION public.can_view_account(uid uuid, acct_id uuid)
  SET search_path = '';

ALTER FUNCTION public.can_view_note_entity(uid uuid, etype text, eid uuid)
  SET search_path = '';

ALTER FUNCTION public.recompute_deal_health_score(p_deal_id uuid)
  SET search_path = '';

ALTER FUNCTION public.recompute_all_deal_health_scores()
  SET search_path = '';

ALTER FUNCTION public.tg_notes_recompute_health()
  SET search_path = '';

ALTER FUNCTION public.tg_deals_recompute_health()
  SET search_path = '';

ALTER FUNCTION public.get_deals_page(text, uuid, uuid, boolean, boolean, int, boolean)
  SET search_path = '';
