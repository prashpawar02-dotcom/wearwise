-- =====================================================================
-- WearWise — Rollback for Migration 0027: public.streaks role table
-- privileges. Lives OUTSIDE supabase/migrations/ (mirrors 0024's rollback):
-- NOT executed by `supabase db reset`.
--
-- WARNING — structural undo, NOT a safe state: applying this restores the
-- CONFIRMED-DEFECTIVE pre-0027 baseline — service_role loses SELECT/INSERT/
-- UPDATE (re-breaking checkinStreak → 42501), authenticated loses its RLS-gated
-- SELECT (the dashboard streak read silently reads 0), and anon/authenticated/
-- service_role regain the unused {REFERENCES, TRIGGER, TRUNCATE}. Only ever run
-- this for rollback-mechanism testing on a disposable local database.
-- =====================================================================

-- Revoke exactly what 0027 granted.
revoke select on table public.streaks from authenticated;
revoke select, insert, update on table public.streaks from service_role;

-- Restore the pre-0027 platform baseline on streaks.
grant references, trigger, truncate on table public.streaks to anon;
grant references, trigger, truncate on table public.streaks to authenticated;
grant references, trigger, truncate on table public.streaks to service_role;

-- Schema USAGE intentionally NOT revoked — it is a baseline the whole schema
-- depends on; revoking it would be far broader than undoing 0027.
