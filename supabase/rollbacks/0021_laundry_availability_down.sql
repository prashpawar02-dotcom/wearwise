-- =====================================================================
-- WearWise — Migration 0021 ROLLBACK (Laundry / Availability System)
-- Reverses 0021_laundry_availability.sql. Run only to undo Phase 2 schema.
-- Data in the dropped columns/table is lost (expected for a rollback).
-- =====================================================================

-- 3. laundry_wear_stats (policies drop with the table)
drop table if exists public.laundry_wear_stats;

-- 2. profiles laundry columns + constraints
alter table public.profiles
  drop constraint if exists profiles_wash_cycle_days_check,
  drop constraint if exists profiles_postwear_dismissals_check;

alter table public.profiles
  drop column if exists postwear_sheet_enabled,
  drop column if exists postwear_prompt_dismissals,
  drop column if exists wash_cycle_days,
  drop column if exists laundry_return_prompt_at,
  drop column if exists laundry_wash_note_at;

-- 1. wardrobe_items availability CHECK — restore the pre-0021 (0007) set.
drop index if exists public.wardrobe_items_in_wash_since_idx;

alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_availability_status_check;

-- Fold any 'archived' rows back to a still-valid value before re-adding the
-- narrower constraint, so the rollback cannot fail on existing data.
update public.wardrobe_items
  set availability_status = 'unavailable'
  where availability_status = 'archived';

do $$ begin
  alter table public.wardrobe_items
    add constraint wardrobe_items_availability_status_check
    check (availability_status in ('available', 'in_wash', 'unavailable'));
exception when duplicate_object then null; end $$;
