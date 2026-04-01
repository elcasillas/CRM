-- Optimize RLS policies: wrap auth function calls in scalar subqueries (initplan optimization)
-- Generated: 2026-04-01
-- See docs/rls-policy-optimization-audit.md for full audit report
--
-- Background: When auth.uid(), auth.role(), auth.jwt(), or auth.email() appear directly in
-- RLS policy expressions, Postgres re-evaluates the function call for every row scanned.
-- Wrapping in (SELECT auth.uid()) causes Postgres to evaluate it once as an initplan
-- (a scalar subquery hoisted out of the per-row loop), which can dramatically reduce
-- overhead on large tables.
--
-- Policies already using the (SELECT ...) pattern are left unchanged.
-- Policies whose only auth call is inside a user-defined function argument are also wrapped
-- so that the UID is computed once before being passed in per-row.

-- ============================================================
-- TABLE: public.accounts
-- ============================================================

DROP POLICY IF EXISTS "accounts: delete admin only" ON public.accounts;
CREATE POLICY "accounts: delete admin only" ON public.accounts
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "accounts: insert owner or admin" ON public.accounts;
CREATE POLICY "accounts: insert owner or admin" ON public.accounts
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((account_owner_id = (SELECT auth.uid())) OR is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "accounts: select visible" ON public.accounts;
CREATE POLICY "accounts: select visible" ON public.accounts
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (can_view_account((SELECT auth.uid()), id));

DROP POLICY IF EXISTS "accounts: update owner or admin" ON public.accounts;
CREATE POLICY "accounts: update owner or admin" ON public.accounts
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((account_owner_id = (SELECT auth.uid())) OR is_admin((SELECT auth.uid())));

-- ============================================================
-- TABLE: public.contact_roles
-- ============================================================

DROP POLICY IF EXISTS "contact_roles: delete if account visible" ON public.contact_roles;
CREATE POLICY "contact_roles: delete if account visible" ON public.contact_roles
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM contacts c
  WHERE ((c.id = contact_roles.contact_id) AND can_view_account((SELECT auth.uid()), c.account_id)))));

DROP POLICY IF EXISTS "contact_roles: insert if account visible" ON public.contact_roles;
CREATE POLICY "contact_roles: insert if account visible" ON public.contact_roles
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM contacts c
  WHERE ((c.id = contact_roles.contact_id) AND can_view_account((SELECT auth.uid()), c.account_id)))));

DROP POLICY IF EXISTS "contact_roles: select if account visible" ON public.contact_roles;
CREATE POLICY "contact_roles: select if account visible" ON public.contact_roles
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM contacts c
  WHERE ((c.id = contact_roles.contact_id) AND can_view_account((SELECT auth.uid()), c.account_id)))));

-- ============================================================
-- TABLE: public.contacts
-- ============================================================

DROP POLICY IF EXISTS "contacts: delete owner or admin" ON public.contacts;
CREATE POLICY "contacts: delete owner or admin" ON public.contacts
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((is_admin((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM accounts
  WHERE ((accounts.id = contacts.account_id) AND (accounts.account_owner_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "contacts: insert if account visible" ON public.contacts;
CREATE POLICY "contacts: insert if account visible" ON public.contacts
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (can_view_account((SELECT auth.uid()), account_id));

DROP POLICY IF EXISTS "contacts: select if account visible" ON public.contacts;
CREATE POLICY "contacts: select if account visible" ON public.contacts
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (can_view_account((SELECT auth.uid()), account_id));

DROP POLICY IF EXISTS "contacts: update if account visible" ON public.contacts;
CREATE POLICY "contacts: update if account visible" ON public.contacts
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (can_view_account((SELECT auth.uid()), account_id));

-- ============================================================
-- TABLE: public.contracts
-- ============================================================

DROP POLICY IF EXISTS "contracts: delete owner or admin" ON public.contracts;
CREATE POLICY "contracts: delete owner or admin" ON public.contracts
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((is_admin((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM accounts
  WHERE ((accounts.id = contracts.account_id) AND (accounts.account_owner_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "contracts: insert if account visible" ON public.contracts;
CREATE POLICY "contracts: insert if account visible" ON public.contracts
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (can_view_account((SELECT auth.uid()), account_id));

DROP POLICY IF EXISTS "contracts: select if account visible" ON public.contracts;
CREATE POLICY "contracts: select if account visible" ON public.contracts
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (can_view_account((SELECT auth.uid()), account_id));

DROP POLICY IF EXISTS "contracts: update if account visible" ON public.contracts;
CREATE POLICY "contracts: update if account visible" ON public.contracts
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (can_view_account((SELECT auth.uid()), account_id));

-- ============================================================
-- TABLE: public.dc_cluster_mappings
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage dc_cluster_mappings" ON public.dc_cluster_mappings;
CREATE POLICY "Admins can manage dc_cluster_mappings" ON public.dc_cluster_mappings
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

-- "Authenticated users can read dc_cluster_mappings": qual = true, no auth calls — SKIPPED

-- ============================================================
-- TABLE: public.deal_stage_history
-- ============================================================

DROP POLICY IF EXISTS "deal_stage_history: delete admin only" ON public.deal_stage_history;
CREATE POLICY "deal_stage_history: delete admin only" ON public.deal_stage_history
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "deal_stage_history: insert if deal visible" ON public.deal_stage_history;
CREATE POLICY "deal_stage_history: insert if deal visible" ON public.deal_stage_history
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((changed_by = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM deals d
  WHERE ((d.id = deal_stage_history.deal_id) AND can_view_account((SELECT auth.uid()), d.account_id))))));

DROP POLICY IF EXISTS "deal_stage_history: select if deal visible" ON public.deal_stage_history;
CREATE POLICY "deal_stage_history: select if deal visible" ON public.deal_stage_history
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM deals d
  WHERE ((d.id = deal_stage_history.deal_id) AND can_view_account((SELECT auth.uid()), d.account_id)))));

-- ============================================================
-- TABLE: public.deal_stages
-- ============================================================

DROP POLICY IF EXISTS "deal_stages: delete admin only" ON public.deal_stages;
CREATE POLICY "deal_stages: delete admin only" ON public.deal_stages
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "deal_stages: insert admin only" ON public.deal_stages;
CREATE POLICY "deal_stages: insert admin only" ON public.deal_stages
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "deal_stages: select all authenticated" ON public.deal_stages;
CREATE POLICY "deal_stages: select all authenticated" ON public.deal_stages
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "deal_stages: update admin only" ON public.deal_stages;
CREATE POLICY "deal_stages: update admin only" ON public.deal_stages
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (is_admin((SELECT auth.uid())));

-- ============================================================
-- TABLE: public.deal_summary_cache
-- ============================================================

DROP POLICY IF EXISTS "summary_cache: insert if deal visible" ON public.deal_summary_cache;
CREATE POLICY "summary_cache: insert if deal visible" ON public.deal_summary_cache
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM deals d
  WHERE ((d.id = deal_summary_cache.deal_id) AND can_view_account((SELECT auth.uid()), d.account_id)))));

DROP POLICY IF EXISTS "summary_cache: select if deal visible" ON public.deal_summary_cache;
CREATE POLICY "summary_cache: select if deal visible" ON public.deal_summary_cache
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM deals d
  WHERE ((d.id = deal_summary_cache.deal_id) AND can_view_account((SELECT auth.uid()), d.account_id)))));

-- ============================================================
-- TABLE: public.deals
-- ============================================================

DROP POLICY IF EXISTS "deals: delete admin only" ON public.deals;
CREATE POLICY "deals: delete admin only" ON public.deals
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "deals: insert sales own or admin" ON public.deals;
CREATE POLICY "deals: insert sales own or admin" ON public.deals
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((can_view_account((SELECT auth.uid()), account_id) AND (is_admin((SELECT auth.uid())) OR ((deal_owner_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'sales'::text, 'sales_manager'::text])))))))));

DROP POLICY IF EXISTS "deals: select if account visible" ON public.deals;
CREATE POLICY "deals: select if account visible" ON public.deals
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (can_view_account((SELECT auth.uid()), account_id));

DROP POLICY IF EXISTS "deals: update deal owner or admin" ON public.deals;
CREATE POLICY "deals: update deal owner or admin" ON public.deals
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((can_view_account((SELECT auth.uid()), account_id) AND ((deal_owner_id = (SELECT auth.uid())) OR is_admin((SELECT auth.uid())))));

-- ============================================================
-- TABLE: public.health_score_config
-- ============================================================

DROP POLICY IF EXISTS "health_score_config_admin_select" ON public.health_score_config;
CREATE POLICY "health_score_config_admin_select" ON public.health_score_config
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin((SELECT auth.uid())));

-- ============================================================
-- TABLE: public.hid_records
-- ============================================================

DROP POLICY IF EXISTS "hid_records: delete owner or admin" ON public.hid_records;
CREATE POLICY "hid_records: delete owner or admin" ON public.hid_records
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((is_admin((SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM accounts
  WHERE ((accounts.id = hid_records.account_id) AND (accounts.account_owner_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "hid_records: insert if account visible" ON public.hid_records;
CREATE POLICY "hid_records: insert if account visible" ON public.hid_records
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (can_view_account((SELECT auth.uid()), account_id));

DROP POLICY IF EXISTS "hid_records: select if account visible" ON public.hid_records;
CREATE POLICY "hid_records: select if account visible" ON public.hid_records
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (can_view_account((SELECT auth.uid()), account_id));

DROP POLICY IF EXISTS "hid_records: update if account visible" ON public.hid_records;
CREATE POLICY "hid_records: update if account visible" ON public.hid_records
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (can_view_account((SELECT auth.uid()), account_id));

-- ============================================================
-- TABLE: public.inspection_config
-- ============================================================

DROP POLICY IF EXISTS "Admins can modify inspection config" ON public.inspection_config;
CREATE POLICY "Admins can modify inspection config" ON public.inspection_config
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (is_admin((SELECT auth.uid())));

-- "Authenticated users can read inspection config": qual = true, no auth calls — SKIPPED

-- ============================================================
-- TABLE: public.notes
-- ============================================================

DROP POLICY IF EXISTS "notes: delete admin or creator" ON public.notes;
CREATE POLICY "notes: delete admin or creator" ON public.notes
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((is_admin((SELECT auth.uid())) OR (created_by = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "notes: insert for visible entity" ON public.notes;
CREATE POLICY "notes: insert for visible entity" ON public.notes
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((created_by = (SELECT auth.uid())) AND can_view_note_entity((SELECT auth.uid()), entity_type, entity_id)));

DROP POLICY IF EXISTS "notes: select for visible entity" ON public.notes;
CREATE POLICY "notes: select for visible entity" ON public.notes
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (can_view_note_entity((SELECT auth.uid()), entity_type, entity_id));

-- ============================================================
-- TABLE: public.partner_ai_summaries
-- ============================================================

DROP POLICY IF EXISTS "partner_ai_summaries: insert visible" ON public.partner_ai_summaries;
CREATE POLICY "partner_ai_summaries: insert visible" ON public.partner_ai_summaries
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (can_view_partner((SELECT auth.uid()), partner_id));

DROP POLICY IF EXISTS "partner_ai_summaries: select visible" ON public.partner_ai_summaries;
CREATE POLICY "partner_ai_summaries: select visible" ON public.partner_ai_summaries
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (can_view_partner((SELECT auth.uid()), partner_id));

-- ============================================================
-- TABLE: public.partner_health_alerts
-- ============================================================

DROP POLICY IF EXISTS "partner_health_alerts: delete admin only" ON public.partner_health_alerts;
CREATE POLICY "partner_health_alerts: delete admin only" ON public.partner_health_alerts
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "partner_health_alerts: insert visible" ON public.partner_health_alerts;
CREATE POLICY "partner_health_alerts: insert visible" ON public.partner_health_alerts
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (can_view_partner((SELECT auth.uid()), partner_id));

DROP POLICY IF EXISTS "partner_health_alerts: select visible" ON public.partner_health_alerts;
CREATE POLICY "partner_health_alerts: select visible" ON public.partner_health_alerts
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (can_view_partner((SELECT auth.uid()), partner_id));

DROP POLICY IF EXISTS "partner_health_alerts: update visible" ON public.partner_health_alerts;
CREATE POLICY "partner_health_alerts: update visible" ON public.partner_health_alerts
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (can_view_partner((SELECT auth.uid()), partner_id));

-- ============================================================
-- TABLE: public.partner_health_config
-- ============================================================

DROP POLICY IF EXISTS "partner_health_config_admin_select" ON public.partner_health_config;
CREATE POLICY "partner_health_config_admin_select" ON public.partner_health_config
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_admin((SELECT auth.uid())));

-- ============================================================
-- TABLE: public.partner_health_import_log
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can insert import log" ON public.partner_health_import_log;
CREATE POLICY "Authenticated users can insert import log" ON public.partner_health_import_log
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "Authenticated users can view import log" ON public.partner_health_import_log;
CREATE POLICY "Authenticated users can view import log" ON public.partner_health_import_log
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) IS NOT NULL));

-- ============================================================
-- TABLE: public.partner_health_scores
-- ============================================================

DROP POLICY IF EXISTS "partner_health_scores: insert visible" ON public.partner_health_scores;
CREATE POLICY "partner_health_scores: insert visible" ON public.partner_health_scores
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (can_view_partner((SELECT auth.uid()), partner_id));

DROP POLICY IF EXISTS "partner_health_scores: select visible" ON public.partner_health_scores;
CREATE POLICY "partner_health_scores: select visible" ON public.partner_health_scores
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (can_view_partner((SELECT auth.uid()), partner_id));

DROP POLICY IF EXISTS "partner_health_scores: update visible" ON public.partner_health_scores;
CREATE POLICY "partner_health_scores: update visible" ON public.partner_health_scores
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (can_view_partner((SELECT auth.uid()), partner_id));

-- ============================================================
-- TABLE: public.partner_health_snapshots
-- ============================================================

DROP POLICY IF EXISTS "partner_health_snapshots: insert visible" ON public.partner_health_snapshots;
CREATE POLICY "partner_health_snapshots: insert visible" ON public.partner_health_snapshots
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (can_view_partner((SELECT auth.uid()), partner_id));

DROP POLICY IF EXISTS "partner_health_snapshots: select visible" ON public.partner_health_snapshots;
CREATE POLICY "partner_health_snapshots: select visible" ON public.partner_health_snapshots
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (can_view_partner((SELECT auth.uid()), partner_id));

-- ============================================================
-- TABLE: public.partner_metrics
-- ============================================================

DROP POLICY IF EXISTS "partner_metrics: delete visible" ON public.partner_metrics;
CREATE POLICY "partner_metrics: delete visible" ON public.partner_metrics
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (can_view_partner((SELECT auth.uid()), partner_id));

DROP POLICY IF EXISTS "partner_metrics: insert visible" ON public.partner_metrics;
CREATE POLICY "partner_metrics: insert visible" ON public.partner_metrics
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (can_view_partner((SELECT auth.uid()), partner_id));

DROP POLICY IF EXISTS "partner_metrics: select visible" ON public.partner_metrics;
CREATE POLICY "partner_metrics: select visible" ON public.partner_metrics
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (can_view_partner((SELECT auth.uid()), partner_id));

DROP POLICY IF EXISTS "partner_metrics: update visible" ON public.partner_metrics;
CREATE POLICY "partner_metrics: update visible" ON public.partner_metrics
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (can_view_partner((SELECT auth.uid()), partner_id));

-- ============================================================
-- TABLE: public.partners
-- ============================================================

DROP POLICY IF EXISTS "partners: delete admin only" ON public.partners;
CREATE POLICY "partners: delete admin only" ON public.partners
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "partners: insert owner or admin" ON public.partners;
CREATE POLICY "partners: insert owner or admin" ON public.partners
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((is_admin((SELECT auth.uid())) OR (account_manager_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "partners: select visible" ON public.partners;
CREATE POLICY "partners: select visible" ON public.partners
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (can_view_partner((SELECT auth.uid()), id));

DROP POLICY IF EXISTS "partners: update owner or admin" ON public.partners;
CREATE POLICY "partners: update owner or admin" ON public.partners
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((is_admin((SELECT auth.uid())) OR (account_manager_id = (SELECT auth.uid()))));

-- ============================================================
-- TABLE: public.products
-- ============================================================

DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete" ON public.products
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert" ON public.products
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((SELECT auth.uid()) IS NOT NULL));

-- "products_select": qual = true, no auth calls — SKIPPED

DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update" ON public.products
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_admin((SELECT auth.uid())));

-- ============================================================
-- TABLE: public.profiles
-- ============================================================

DROP POLICY IF EXISTS "profiles: delete admin only" ON public.profiles;
CREATE POLICY "profiles: delete admin only" ON public.profiles
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "profiles: insert own" ON public.profiles;
CREATE POLICY "profiles: insert own" ON public.profiles
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "profiles: select authenticated" ON public.profiles;
CREATE POLICY "profiles: select authenticated" ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "profiles: update own name or admin all" ON public.profiles;
CREATE POLICY "profiles: update own name or admin all" ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((id = (SELECT auth.uid())) OR is_admin((SELECT auth.uid()))))
  WITH CHECK ((is_admin((SELECT auth.uid())) OR ((id = (SELECT auth.uid())) AND (role = ( SELECT p.role
   FROM profiles p
  WHERE (p.id = (SELECT auth.uid())))))));
