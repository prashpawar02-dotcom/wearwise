-- =====================================================================
-- WearWise — Rollback for Migration 0024: Application role table
-- privileges. NOT executed by `supabase db reset` (lives outside
-- supabase/migrations/ deliberately — see the migration-chain repair,
-- 2026-07-11).
--
-- WARNING — read before ever running this: this is a STRUCTURAL undo of
-- exactly what 0024 did, not a "safe" state. Applying this script
-- restores the CONFIRMED-DEFECTIVE pre-0024 privilege set: authenticated
-- loses SELECT/INSERT/UPDATE(/DELETE on wardrobe_items) on all three
-- tables (breaking confirm_daily_drop_wear and every authenticated
-- read/write path that depends on it), and anon/authenticated regain
-- TRUNCATE/TRIGGER/REFERENCES (the confirmed security issue this
-- migration closed). Only ever run this for rollback-mechanism testing on
-- a disposable local database, never against anything with real data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- public.profiles — revoke what 0024 granted, restore what it revoked.
-- ---------------------------------------------------------------------
revoke select, insert, update on table public.profiles from authenticated;
revoke all on table public.profiles from service_role;

grant references, trigger, truncate on table public.profiles to anon;
grant references, trigger, truncate on table public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- public.wardrobe_items — revoke what 0024 granted, restore what it
-- revoked.
-- ---------------------------------------------------------------------
revoke select, insert, update, delete on table public.wardrobe_items from authenticated;
revoke all on table public.wardrobe_items from service_role;

grant references, trigger, truncate on table public.wardrobe_items to anon;
grant references, trigger, truncate on table public.wardrobe_items to authenticated;

-- ---------------------------------------------------------------------
-- public.daily_recommendations — revoke what 0024 granted, restore what
-- it revoked.
-- ---------------------------------------------------------------------
revoke select, insert, update on table public.daily_recommendations from authenticated;
revoke all on table public.daily_recommendations from service_role;

grant references, trigger, truncate on table public.daily_recommendations to anon;
grant references, trigger, truncate on table public.daily_recommendations to authenticated;

-- ---------------------------------------------------------------------
-- Schema USAGE is intentionally NOT revoked here — USAGE on public is a
-- baseline every Supabase project depends on for every other table and
-- function in the schema (including ones unrelated to this migration);
-- revoking it would be far broader than undoing 0024 and is out of scope
-- for this rollback.
-- ---------------------------------------------------------------------
