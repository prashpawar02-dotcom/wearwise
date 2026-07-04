-- =====================================================================
-- WearWise — Migration 0010: server-controlled daily_recommendations inserts
-- Run in the Supabase SQL editor. Additive/permission change only.
--
-- Purpose (Phase 3A): prepared drops are now written by SERVER routes using the
-- service-role key (scheduled cron + the authenticated manual prepare route),
-- never by a browser client session. Removing the client insert-own policy
-- ensures no signed-in client can insert daily_recommendations directly.
--
-- IMPORTANT — apply order:
--   Set SUPABASE_SERVICE_ROLE_KEY in the server env BEFORE applying this
--   migration. After this runs, the manual prepare route MUST use the admin
--   client (it does), otherwise inserts would be blocked. The service-role key
--   bypasses RLS, so server preparation continues to work.
--
-- What stays owner-scoped (unchanged):
--   - SELECT own rows  (dashboard read)
--   - UPDATE own rows  (Wear this / opened / worn / skipped from the client)
--   The service role bypasses RLS for server-side inserts.
-- =====================================================================

-- Remove the client-session INSERT capability. Inserts now happen only via the
-- service-role client on the server.
drop policy if exists "dailyrec_insert_own" on public.daily_recommendations;

-- (Intentionally NOT re-creating an insert policy — no client insert path.)

-- Reads and updates remain owner-scoped exactly as before:
--   dailyrec_select_own : for select using (user_id = auth.uid())
--   dailyrec_update_own : for update using/with check (user_id = auth.uid())
-- These are unchanged by this migration.

-- FUTURE HARDENING (not required for this pass): restrict client UPDATE to the
-- lifecycle columns only (status/opened_at/worn_at/skipped_at) via column
-- privileges or a trigger, so clients can't rewrite selected_item_ids/reasoning.
