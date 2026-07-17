-- =====================================================================
-- WearWise — Rollback for Migration 0028: public.outfit_requests privileges
-- + RLS. Lives OUTSIDE supabase/migrations/ (mirrors 0024/0027): NOT executed
-- by `supabase db reset`.
--
-- WARNING — structural undo, NOT a safe state: this restores the CONFIRMED
-- DEFECTIVE pre-0028 access behavior — authenticated loses SELECT/INSERT/UPDATE
-- (re-breaking Style Me with 42501), service_role loses UPDATE, the baseline
-- {REFERENCES,TRIGGER,TRUNCATE} return, and the original broad "for all"
-- policies (requests_owner_all / requests_admin_rw, roles=public) are restored.
-- Only run for rollback-mechanism testing on a disposable local database.
-- =====================================================================

-- Revoke exactly what 0028 granted.
revoke select, insert, update on table public.outfit_requests from authenticated;
revoke update on table public.outfit_requests from service_role;

-- Restore the pre-0028 platform baseline.
grant references, trigger, truncate on table public.outfit_requests to anon;
grant references, trigger, truncate on table public.outfit_requests to authenticated;
grant references, trigger, truncate on table public.outfit_requests to service_role;

-- Restore the original 0001 broad policies; drop the command-specific ones.
drop policy if exists "requests_owner_insert" on public.outfit_requests;
drop policy if exists "requests_owner_select" on public.outfit_requests;
drop policy if exists "requests_admin_all" on public.outfit_requests;

drop policy if exists "requests_owner_all" on public.outfit_requests;
create policy "requests_owner_all" on public.outfit_requests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "requests_admin_rw" on public.outfit_requests;
create policy "requests_admin_rw" on public.outfit_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- Schema USAGE intentionally NOT revoked (baseline shared by the whole schema).
