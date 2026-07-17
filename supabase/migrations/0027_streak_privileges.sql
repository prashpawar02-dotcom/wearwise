-- =====================================================================
-- WearWise — Migration 0027: public.streaks role table privileges
-- Run in the Supabase SQL editor / applied by `supabase db reset`. ADDITIVE
-- (grant/revoke only — no schema shape changes) and REVERSIBLE
-- (see supabase/rollbacks/0027_streak_privileges_down.sql).
--
-- CONFIRMED DEFECT (real local information_schema inspection):
--   [checkinStreak] streaks read failed { code: '42501',
--   message: 'permission denied for table streaks' }.
-- Table-privilege check runs BEFORE RLS, so a role with no SELECT/INSERT/
-- UPDATE grant is rejected at the privilege layer regardless of policies.
--
-- ROOT CAUSE (source-proven):
--   * 0013_streaks.sql created public.streaks with RLS + a "own streak read"
--     SELECT policy, but issued NO grants at all.
--   * 0024_app_role_privileges.sql revoked the platform baseline and re-granted
--     DML for profiles / wardrobe_items / daily_recommendations ONLY — it
--     OMITTED public.streaks. So streaks kept only the Supabase platform
--     baseline {REFERENCES, TRIGGER, TRUNCATE} for anon/authenticated/
--     service_role and never received the SELECT/INSERT/UPDATE the code needs.
--   No app migration ever GRANTED those REFERENCES/TRIGGER/TRUNCATE — they are
--   the Supabase platform default privileges on public tables (the same
--   baseline 0024's header documents for the other three tables). There is no
--   app-level ALTER DEFAULT PRIVILEGES to correct; this migration simply revokes
--   the unused baseline privileges on streaks and grants least privilege.
--
-- PRIVILEGE MATRIX (least privilege):
--   anon           : none.
--   authenticated  : SELECT only. PROVEN direct dependency —
--                    src/app/(app)/dashboard/page.tsx reads the user's own
--                    streak with the AUTHENTICATED session client, gated by
--                    0013's "own streak read" RLS policy (auth.uid() = user_id).
--                    No INSERT/UPDATE/DELETE: every write goes through service
--                    role (checkinStreak → createAdminClient).
--   service_role   : SELECT, INSERT, UPDATE — checkinStreak reads the row then
--                    UPSERTs (INSERT ... ON CONFLICT (user_id) DO UPDATE).
--                    NOT DELETE/TRUNCATE/TRIGGER/REFERENCES (never used).
--   postgres       : remains owner (untouched).
--
-- Sequence grants: none required — the PK is user_id (uuid FK to auth.users),
-- there is no serial/identity column and no owned sequence on public.streaks
-- (0013). No sequence privilege is granted.
--
-- RLS is NOT touched: 0013's "own streak read" policy and enabled RLS remain.
-- =====================================================================

-- Clear the unused platform-baseline privileges on streaks from every
-- client-facing role (idempotent), then grant exactly what the code requires.
revoke all on table public.streaks from public;
revoke all on table public.streaks from anon;
revoke all on table public.streaks from authenticated;
revoke all on table public.streaks from service_role;

-- authenticated: read-own only (RLS-gated). Required by the dashboard SSR read.
grant select on table public.streaks to authenticated;

-- service_role: read + upsert (SELECT + INSERT + UPDATE). No DELETE/TRUNCATE/
-- TRIGGER/REFERENCES.
grant select, insert, update on table public.streaks to service_role;

-- anon: intentionally left with zero table privileges (no grant statement).

-- Schema USAGE — required for any table grant above to be reachable. Idempotent.
grant usage on schema public to authenticated;
grant usage on schema public to service_role;
