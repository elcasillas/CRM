-- ─────────────────────────────────────────────────────────────────────────────
-- Restore the cross-user SELECT policy on deals
--
-- Recovered from the live database. This policy was created by one of the
-- migrations applied outside this repository (see the 20260514 and 20260602
-- placeholders) and existed in no committed file, so a database rebuilt from
-- this directory would come up without it.
--
-- It is load bearing. The Deals page calls get_deals_page from the browser,
-- which runs as SECURITY INVOKER, so every authenticated user must be able to
-- read every deal row. Without this policy the deals list returns only the
-- rows the caller owns. This is the known trade-off recorded in CLAUDE.md.
--
-- Definition matches the live database exactly, including the scalar subquery
-- form introduced by 20260401120000_optimize_rls_auth_initplan.sql.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "deals: select all authenticated" ON public.deals;

CREATE POLICY "deals: select all authenticated" ON public.deals
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((SELECT auth.uid()) IS NOT NULL);
