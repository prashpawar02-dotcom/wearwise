-- =====================================================================
-- WearWise — Migration 0023 ROLLBACK (Atomic Wear Confirmation)
-- Reverses 0023_atomic_wear_confirmation.sql. Run only to undo the Phase 4C
-- atomicity hotfix. No columns or data were added by 0023 — this migration
-- only removed the previous non-atomic client-side write path in
-- application code, so the rollback here is purely dropping the function
-- and its grants. No data is lost.
--
-- After running this rollback, /api/daily-drop/wear/route.ts MUST be
-- reverted to a pre-0023 revision (or redeployed with a compatible RPC) —
-- the route as of migration 0023 calls confirm_daily_drop_wear() and will
-- fail closed (RPC not found) once this function is dropped.
-- =====================================================================

revoke all on function public.confirm_daily_drop_wear(uuid, uuid[]) from authenticated;
revoke all on function public.confirm_daily_drop_wear(uuid, uuid[]) from anon;
revoke all on function public.confirm_daily_drop_wear(uuid, uuid[]) from public;

drop function if exists public.confirm_daily_drop_wear(uuid, uuid[]);
