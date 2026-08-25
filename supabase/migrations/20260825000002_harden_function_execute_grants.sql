-- ─────────────────────────────────────────────────────────────────────────────
-- Restrict EXECUTE on SECURITY DEFINER functions
--
-- Every function below was granted EXECUTE to PUBLIC and to anon, so anyone
-- holding the public anon key could call it over /rest/v1/rpc without signing
-- in. Confirmed against the live API: an unauthenticated POST to
-- /rest/v1/rpc/is_admin returned a result. Raised by the Supabase Security
-- Advisor as 0028_anon_security_definer_function_executable and
-- 0029_authenticated_security_definer_function_executable.
--
-- Grants are set per function according to who genuinely needs to call it.
-- get_deals_page is already restricted this way and serves as the model:
-- postgres, authenticated, service_role, with no PUBLIC and no anon.
--
-- Revoking from PUBLIC alone would also strip service_role, which reaches
-- these functions through the PUBLIC grant, so each service_role grant is
-- restated explicitly afterwards.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Trigger functions. Reachable over RPC today, which is never intended:
--    they return trigger and are meaningless outside a trigger context.
--    Postgres checks EXECUTE when a trigger is created, not when it fires, so
--    revoking here does not affect the triggers that call them.
REVOKE EXECUTE ON FUNCTION public.tg_deals_recompute_health()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notes_recompute_health()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_partner_metrics_recompute() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()              FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.tg_deals_recompute_health()    TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_notes_recompute_health()    TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_partner_metrics_recompute() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user()              TO service_role;

-- 2. Recompute and snapshot routines. These mutate data across every deal or
--    partner, so an anonymous caller could both alter scores and hammer the
--    database. The application calls the first two with the service role from
--    route handlers, and never calls the rest from the browser.
REVOKE EXECUTE ON FUNCTION public.recompute_all_deal_health_scores()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_deal_health_score(uuid)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_all_partner_health_scores()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_partner_health_score(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_all_partner_health()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_partner_alerts(uuid)             FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.recompute_all_deal_health_scores()          TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_deal_health_score(uuid)          TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_all_partner_health_scores()       TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_partner_health_score(uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION public.snapshot_all_partner_health()              TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_partner_alerts(uuid)             TO service_role;

-- 3. Visibility predicates used inside RLS policies. A policy expression is
--    evaluated as the querying role, so authenticated MUST keep EXECUTE or
--    every table read fails with "permission denied for function". anon and
--    PUBLIC lose it: no unauthenticated code path in the application queries a
--    table, so nothing legitimate evaluates these as anon.
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid)                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_account(uuid, uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_note_entity(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_partner(uuid, uuid)         FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid)                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_account(uuid, uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_note_entity(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_partner(uuid, uuid)         TO authenticated, service_role;

-- 4. get_deals_page keeps its authenticated grant: the Deals page calls it from
--    the browser. Restated so the intent is explicit rather than incidental.
REVOKE EXECUTE ON FUNCTION public.get_deals_page(text, uuid, uuid, boolean, boolean, integer, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_deals_page(text, uuid, uuid, boolean, boolean, integer, boolean) TO authenticated, service_role;
