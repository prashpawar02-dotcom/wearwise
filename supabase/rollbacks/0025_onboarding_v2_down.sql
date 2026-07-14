-- =====================================================================
-- WearWise — Rollback for Migration 0025: Onboarding v2. NOT executed by
-- `supabase db reset` (lives outside supabase/migrations/ deliberately —
-- see the migration-chain repair, 2026-07-11).
--
-- Drops the two columns this migration added. Safe to run on a disposable
-- local database; on any database with real onboarding progress in
-- flight, dropping `onboarding_step` will make in-progress users resume
-- from `new` again (their profile fields already saved — name, city,
-- style_preferences, default_occasion — are NOT lost, only the "which
-- step was I on" checkpoint is). `onboarded` (0001) is untouched by this
-- rollback, so already-completed users are never sent back through
-- onboarding by running this.
-- =====================================================================

alter table public.profiles
  drop constraint if exists profiles_onboarding_step_check;

alter table public.profiles
  drop column if exists onboarding_step,
  drop column if exists default_occasion;
