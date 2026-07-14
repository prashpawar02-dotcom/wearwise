-- =====================================================================
-- WearWise — Migration 0022 ROLLBACK (Swap · Another Option · Why This Works)
-- Reverses 0022_swap_trust.sql. Run only to undo Phase 3 schema.
-- Data in the dropped columns/table is lost (expected for a rollback).
-- =====================================================================

-- 2. drop_feedback (policies drop with the table)
drop table if exists public.drop_feedback;

-- 1. daily_recommendations swap/undo/cap columns + constraints
alter table public.daily_recommendations
  drop constraint if exists daily_recommendations_swaps_used_nonneg,
  drop constraint if exists daily_recommendations_options_used_nonneg;

alter table public.daily_recommendations
  drop column if exists swap_candidates,
  drop column if exists base_item_ids,
  drop column if exists pre_swap_item_ids,
  drop column if exists swaps_used,
  drop column if exists options_used;
