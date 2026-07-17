-- =====================================================================
-- 0026 rollback — remove authoritative recommendation metadata columns.
-- Reversible: additive columns only, no data migration was performed.
-- =====================================================================
alter table public.daily_recommendations
  drop constraint if exists daily_recommendations_outfit_status_check;

alter table public.daily_recommendations
  drop column if exists outfit_status,
  drop column if exists missing_slots,
  drop column if exists partial_reason,
  drop column if exists inventory_fingerprint;
