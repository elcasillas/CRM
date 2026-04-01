-- Fix duplicate permissive RLS policies
-- Generated: 2026-04-01
--
-- Problem:
--   Two tables had a permissive FOR SELECT policy AND a permissive FOR ALL policy,
--   causing two permissive policies to fire for the SELECT command. PostgreSQL
--   evaluates multiple permissive policies with OR logic, so access behavior is
--   unchanged, but the redundant evaluation adds per-row overhead and violates the
--   principle of one policy per command.
--
-- Root cause:
--   Both tables were initially given a broad SELECT policy (USING true / USING
--   is_authenticated) plus a FOR ALL admin policy. FOR ALL expands to cover SELECT,
--   INSERT, UPDATE, and DELETE simultaneously, creating the SELECT overlap.
--
-- Fix:
--   Replace each FOR ALL admin policy with three discrete policies (INSERT, UPDATE,
--   DELETE). The existing SELECT policy becomes the sole SELECT policy for each table.
--   Auth calls use the (SELECT auth.uid()) initplan pattern for consistency with the
--   preceding optimization migration (20260401120000).
--
-- Affected tables:
--   1. public.dc_cluster_mappings
--   2. public.inspection_config
--
-- Behavior changes:
--   None. Access is identical before and after:
--   - Authenticated users can still SELECT from both tables (USING true).
--   - Only admins can INSERT / UPDATE / DELETE (was already enforced via FOR ALL).
--   - service_role bypasses RLS entirely and is unaffected.
--
-- No other tables are affected. All other tables already have exactly one permissive
-- policy per (table, command) pair.

-- ============================================================
-- TABLE: public.dc_cluster_mappings
-- ============================================================
--
-- BEFORE (2 permissive policies covering SELECT):
--   "Authenticated users can read dc_cluster_mappings"
--       FOR SELECT TO authenticated USING (true)
--   "Admins can manage dc_cluster_mappings"
--       FOR ALL    TO authenticated USING (is_admin(...)) WITH CHECK (is_admin(...))
--
-- AFTER (1 policy per command):
--   "Authenticated users can read dc_cluster_mappings"  -- unchanged
--       FOR SELECT TO authenticated USING (true)
--   "dc_cluster_mappings: insert admin only"
--       FOR INSERT TO authenticated WITH CHECK (is_admin((SELECT auth.uid())))
--   "dc_cluster_mappings: update admin only"
--       FOR UPDATE TO authenticated USING / WITH CHECK (is_admin((SELECT auth.uid())))
--   "dc_cluster_mappings: delete admin only"
--       FOR DELETE TO authenticated USING (is_admin((SELECT auth.uid())))

DROP POLICY IF EXISTS "Admins can manage dc_cluster_mappings" ON public.dc_cluster_mappings;

CREATE POLICY "dc_cluster_mappings: insert admin only" ON public.dc_cluster_mappings
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())));

CREATE POLICY "dc_cluster_mappings: update admin only" ON public.dc_cluster_mappings
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

CREATE POLICY "dc_cluster_mappings: delete admin only" ON public.dc_cluster_mappings
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin((SELECT auth.uid())));

-- ============================================================
-- TABLE: public.inspection_config
-- ============================================================
--
-- BEFORE (2 permissive policies covering SELECT):
--   "Authenticated users can read inspection config"
--       FOR SELECT TO authenticated USING (true)
--   "Admins can modify inspection config"
--       FOR ALL    TO authenticated USING (is_admin(...))
--       [no explicit WITH CHECK — FOR ALL uses the USING clause for inserts too]
--
-- AFTER (1 policy per command):
--   "Authenticated users can read inspection config"  -- unchanged
--       FOR SELECT TO authenticated USING (true)
--   "inspection_config: insert admin only"
--       FOR INSERT TO authenticated WITH CHECK (is_admin((SELECT auth.uid())))
--   "inspection_config: update admin only"
--       FOR UPDATE TO authenticated USING / WITH CHECK (is_admin((SELECT auth.uid())))
--   "inspection_config: delete admin only"
--       FOR DELETE TO authenticated USING (is_admin((SELECT auth.uid())))
--
-- Note: in practice all inspection_config mutations go through route handlers that
-- use the service role key, which bypasses RLS. The write policies below are explicit
-- documentation of intent and a safety net for any future direct authenticated writes.

DROP POLICY IF EXISTS "Admins can modify inspection config" ON public.inspection_config;

CREATE POLICY "inspection_config: insert admin only" ON public.inspection_config
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())));

CREATE POLICY "inspection_config: update admin only" ON public.inspection_config
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

CREATE POLICY "inspection_config: delete admin only" ON public.inspection_config
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin((SELECT auth.uid())));
