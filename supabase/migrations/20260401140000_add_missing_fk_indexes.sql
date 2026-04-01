-- Add missing FK indexes and performance indexes
-- Generated: 2026-04-01
--
-- Uses standard CREATE INDEX IF NOT EXISTS (not CONCURRENTLY) so this file can
-- run inside the transaction that supabase db push creates. Each index build
-- acquires a ShareLock for the duration of the build. At the current scale of
-- this internal CRM (thousands of rows, not millions) each lock is sub-second.
-- Every statement is idempotent — safe to re-run.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SUMMARY OF CHANGES
-- ─────────────────────────────────────────────────────────────────────────────
-- Total new indexes: 26
--
-- Affected tables (13):
--   accounts, contacts, contracts, deals, deal_stage_history,
--   hid_records, notes, partners, partner_health_alerts,
--   partner_health_import_log, partner_metrics,
--   health_score_config, inspection_config, partner_health_config
--
-- Indexes NOT created (already covered by existing constraints):
--   contact_roles.contact_id     — leading column of UNIQUE (contact_id, role_type)
--   deal_summary_cache.deal_id   — leading column of PRIMARY KEY (deal_id, notes_hash, model)
--   partner_metrics.partner_id   — leading column of UNIQUE (partner_id, metric_date, metric_key)
--   partner_health_scores.partner_id     — UNIQUE constraint on partner_id alone
--   partner_health_snapshots.partner_id  — leading column of UNIQUE (partner_id, snapshot_month)
--   partner_ai_summaries.partner_id      — leading column of UNIQUE (partner_id, metrics_hash, model)
--
-- RLS changes: none required — all RLS policy filter columns are now indexed.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: accounts
-- ─────────────────────────────────────────────────────────────────────────────
-- account_owner_id: used in can_view_account() RLS helper and ownership checks.
-- service_manager_id: used in can_view_account() for service_manager visibility.
-- Both are evaluated on every row by every RLS policy touching accounts, contacts,
-- deals, contracts, hid_records, and notes — the highest-impact indexes in this file.

CREATE INDEX IF NOT EXISTS idx_accounts_account_owner_id
  ON public.accounts (account_owner_id);

CREATE INDEX IF NOT EXISTS idx_accounts_service_manager_id
  ON public.accounts (service_manager_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: contacts
-- ─────────────────────────────────────────────────────────────────────────────
-- account_id: primary join column for account ↔ contacts queries and RLS.

CREATE INDEX IF NOT EXISTS idx_contacts_account_id
  ON public.contacts (account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: contracts
-- ─────────────────────────────────────────────────────────────────────────────
-- account_id: all contract queries are scoped by account.

CREATE INDEX IF NOT EXISTS idx_contracts_account_id
  ON public.contracts (account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: deals
-- ─────────────────────────────────────────────────────────────────────────────
-- account_id: used in get_deals_page RPC, every deals RLS policy, and
--   can_view_account() — the single most-evaluated expression in this schema.
-- stage_id: used in every deals list query, pipeline funnel chart, and the
--   is_won/is_lost/is_closed filters that drive the Overview page charts.
-- deal_owner_id: used in deals RLS (UPDATE policy) and ownership filtering.
-- solutions_engineer_id: used in deal filtering and ownership checks.
-- created_at / updated_at: used for sorting in deals table and activity feeds.

CREATE INDEX IF NOT EXISTS idx_deals_account_id
  ON public.deals (account_id);

CREATE INDEX IF NOT EXISTS idx_deals_stage_id
  ON public.deals (stage_id);

CREATE INDEX IF NOT EXISTS idx_deals_deal_owner_id
  ON public.deals (deal_owner_id);

CREATE INDEX IF NOT EXISTS idx_deals_solutions_engineer_id
  ON public.deals (solutions_engineer_id);

CREATE INDEX IF NOT EXISTS idx_deals_created_at
  ON public.deals (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deals_updated_at
  ON public.deals (updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: deal_stage_history
-- ─────────────────────────────────────────────────────────────────────────────
-- deal_id: core FK, used when loading stage timeline for a deal.
--   Using a composite (deal_id, changed_at DESC) also satisfies the FK index
--   requirement while optimising the most common query pattern (ordered audit log).
-- from_stage_id / to_stage_id: FK columns; used in stage transition analytics.
-- changed_by: FK column; used in audit/user-activity queries.

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal_changed_at
  ON public.deal_stage_history (deal_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_from_stage_id
  ON public.deal_stage_history (from_stage_id);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_to_stage_id
  ON public.deal_stage_history (to_stage_id);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_changed_by
  ON public.deal_stage_history (changed_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: hid_records
-- ─────────────────────────────────────────────────────────────────────────────
-- account_id: all HID queries are scoped by account; also used in RLS.
-- (hid_number has an existing UNIQUE index — no action needed.)

CREATE INDEX IF NOT EXISTS idx_hid_records_account_id
  ON public.hid_records (account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: notes
-- ─────────────────────────────────────────────────────────────────────────────
-- created_by: FK column; used when querying notes by author.
--
-- (entity_type, entity_id) pattern is already covered by the existing unique
-- index notes_entity_text_unique(entity_type, entity_id, note_text). However,
-- the health score activityRecency component runs:
--   SELECT MAX(created_at) FROM notes WHERE entity_type = 'deal' AND entity_id = ?
-- The existing index can satisfy the WHERE predicate but requires a heap fetch
-- to read created_at. Adding a covering composite index eliminates the heap fetch
-- and allows an index-only scan for this hot query path.

CREATE INDEX IF NOT EXISTS idx_notes_created_by
  ON public.notes (created_by);

CREATE INDEX IF NOT EXISTS idx_notes_entity_created_at
  ON public.notes (entity_type, entity_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: partners
-- ─────────────────────────────────────────────────────────────────────────────
-- account_id: optional FK (ON DELETE SET NULL); used for account ↔ partner links.
-- account_manager_id: used in partners RLS (INSERT/UPDATE ownership) and filtering.
-- status: used in partner list filtering (active / at_risk / churned).

CREATE INDEX IF NOT EXISTS idx_partners_account_id
  ON public.partners (account_id);

CREATE INDEX IF NOT EXISTS idx_partners_account_manager_id
  ON public.partners (account_manager_id);

CREATE INDEX IF NOT EXISTS idx_partners_status
  ON public.partners (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: partner_health_alerts
-- ─────────────────────────────────────────────────────────────────────────────
-- partner_id: FK column; used to load all alerts for a given partner.
-- (Not covered by any unique constraint on this table.)

CREATE INDEX IF NOT EXISTS idx_partner_health_alerts_partner_id
  ON public.partner_health_alerts (partner_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10: partner_metrics
-- ─────────────────────────────────────────────────────────────────────────────
-- created_by: FK column; not covered by the existing unique constraint
--   (partner_id, metric_date, metric_key) — needs its own index.
-- Note: partner_id is already indexed as the leading column of the UNIQUE
--   constraint, so no additional partner_id index is needed here.

CREATE INDEX IF NOT EXISTS idx_partner_metrics_created_by
  ON public.partner_metrics (created_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11: admin config tables (low-frequency, completeness)
-- ─────────────────────────────────────────────────────────────────────────────
-- updated_by / imported_by: FK columns referencing auth.users.
-- These tables are single-row or low-cardinality admin tables with very low
-- query frequency. Indexes are added purely to satisfy FK index requirements
-- and silence Supabase Performance Advisor warnings.

CREATE INDEX IF NOT EXISTS idx_health_score_config_updated_by
  ON public.health_score_config (updated_by);

CREATE INDEX IF NOT EXISTS idx_inspection_config_updated_by
  ON public.inspection_config (updated_by);

CREATE INDEX IF NOT EXISTS idx_partner_health_config_updated_by
  ON public.partner_health_config (updated_by);

CREATE INDEX IF NOT EXISTS idx_partner_health_import_log_imported_by
  ON public.partner_health_import_log (imported_by);
