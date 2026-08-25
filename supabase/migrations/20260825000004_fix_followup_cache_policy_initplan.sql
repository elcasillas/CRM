-- ─────────────────────────────────────────────────────────────────────────────
-- Hoist auth.uid() out of the per-row loop in deal_followup_cache policies
--
-- The three policies on deal_followup_cache call auth.uid() directly, so
-- Postgres re-evaluates it for every row scanned. Wrapping it in a scalar
-- subquery makes it an initplan, evaluated once per query. This is the same
-- change 20260401120000_optimize_rls_auth_initplan.sql made across the older
-- tables; deal_followup_cache was created afterwards, copying the older
-- deal_summary_cache pattern, and so missed it. Flagged as
-- 0003_auth_rls_initplan.
--
-- The predicate is now private.can_view_account, following
-- 20260825000003_move_rls_predicates_to_private_schema.sql. Policy logic is
-- otherwise unchanged: a row is visible when its deal's account is visible.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "followup_cache: select if deal visible" ON public.deal_followup_cache;
CREATE POLICY "followup_cache: select if deal visible"
  ON public.deal_followup_cache FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND private.can_view_account((SELECT auth.uid()), d.account_id)
    )
  );

DROP POLICY IF EXISTS "followup_cache: insert if deal visible" ON public.deal_followup_cache;
CREATE POLICY "followup_cache: insert if deal visible"
  ON public.deal_followup_cache FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND private.can_view_account((SELECT auth.uid()), d.account_id)
    )
  );

DROP POLICY IF EXISTS "followup_cache: update if deal visible" ON public.deal_followup_cache;
CREATE POLICY "followup_cache: update if deal visible"
  ON public.deal_followup_cache FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND private.can_view_account((SELECT auth.uid()), d.account_id)
    )
  );
