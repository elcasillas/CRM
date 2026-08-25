-- ─────────────────────────────────────────────────────────────────────────────
-- Drop idx_followup_cache_generated_at
--
-- Added speculatively when deal_followup_cache was created. It cannot ever be
-- used: the table is read only by primary key, .eq('deal_id', id), and
-- generated_at is returned in the projection but never appears in a WHERE or
-- ORDER BY. Freshness is compared in application code after the row is
-- fetched, not in SQL. Flagged as 0005_unused_index.
--
-- The other twenty indexes in that report are deliberately kept. Sixteen back
-- foreign keys and exist to satisfy 0001_unindexed_foreign_keys, so dropping
-- them would trade one lint for another and make cascading deletes scan the
-- child table. The rest read as unused only because the tables are small
-- enough that Postgres prefers a sequential scan.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_followup_cache_generated_at;
