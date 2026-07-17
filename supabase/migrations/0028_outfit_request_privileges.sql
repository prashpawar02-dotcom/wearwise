-- =====================================================================
-- WearWise — Migration 0028: public.outfit_requests role privileges + RLS.
-- Applied by `supabase db reset`. ADDITIVE (grant/revoke + policy replace — no
-- schema shape change) and REVERSIBLE
-- (supabase/rollbacks/0028_outfit_request_privileges_down.sql).
--
-- CONFIRMED DEFECT (local information_schema): the Style Me flow
-- (occasion-form.tsx, browser client) does
--   insert into outfit_requests (...) returning id
-- and PostgREST rejects it with 42501 "permission denied for table
-- outfit_requests" — the table-privilege check runs BEFORE RLS, and
-- `authenticated` holds no SELECT/INSERT/UPDATE.
--
-- ROOT CAUSE (source-proven):
--   * 0001_initial_schema.sql created public.outfit_requests with RLS ENABLED
--     and two broad "for all" policies (requests_owner_all, requests_admin_rw)
--     but issued NO table grants.
--   * 0024_app_role_privileges.sql fixed only profiles / wardrobe_items /
--     daily_recommendations and OMITTED public.outfit_requests. No migration
--     ever granted it. The {REFERENCES,TRIGGER,TRUNCATE} baseline is the
--     Supabase platform default, not an app grant.
--
-- PROVEN OPERATIONS (every .from("outfit_requests") caller inspected):
--   authenticated (browser + SSR):
--     INSERT  — occasion-form.tsx (insert own request, returning id)
--     SELECT  — occasion-form (returning id), outfits/[id] page, admin pages,
--               generate route (own select)
--     UPDATE  — admin curation: suggestion-builder.tsx (browser),
--               generate-drafts & suggestions/approve routes (SSR, is_admin)
--     (no DELETE anywhere)
--   service_role (createAdminClient):
--     UPDATE  — generate route sets status in_review/fulfilled (return=minimal,
--               no .select() → UPDATE only; no service_role SELECT/INSERT/DELETE)
--
-- SEQUENCE: PK is id uuid default gen_random_uuid() — no serial/identity/owned
-- sequence, so NO sequence privilege is granted.
--
-- LEAST-PRIVILEGE MATRIX:
--   anon          : none.
--   authenticated : SELECT, INSERT, UPDATE (no DELETE/TRUNCATE/TRIGGER/REFERENCES).
--   service_role  : UPDATE only.
--   postgres      : owner (untouched).
--
-- RLS: the two broad "for all" policies are replaced by command-specific,
-- TO authenticated policies (tighter than the previous roles=public ALL). The
-- insert-returning-id flow needs BOTH the INSERT with-check AND the SELECT using
-- policy (PostgREST returns the inserted row, which RLS must also permit).
-- Admin curation keeps a broad admin policy (is_admin() is SECURITY DEFINER,
-- STABLE, search_path=public, own-scoped → safe). RLS stays ENABLED (0001).
-- =====================================================================

-- ---- Table privileges (idempotent revoke-then-grant) ----
revoke all on table public.outfit_requests from public;
revoke all on table public.outfit_requests from anon;
revoke all on table public.outfit_requests from authenticated;
revoke all on table public.outfit_requests from service_role;

grant select, insert, update on table public.outfit_requests to authenticated;
grant update on table public.outfit_requests to service_role;
-- anon: intentionally left with zero table privileges (no grant statement).

-- Schema USAGE (idempotent; required for the grants to be reachable).
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- ---- RLS: command-specific owner policies + admin curation ----
drop policy if exists "requests_owner_all" on public.outfit_requests;
drop policy if exists "requests_owner_insert" on public.outfit_requests;
drop policy if exists "requests_owner_select" on public.outfit_requests;
drop policy if exists "requests_admin_rw" on public.outfit_requests;
drop policy if exists "requests_admin_all" on public.outfit_requests;

-- Owner may INSERT only their own request (blocks inserting another user_id).
create policy "requests_owner_insert" on public.outfit_requests
  for insert to authenticated
  with check (user_id = auth.uid());

-- Owner may SELECT only their own request (also permits the INSERT ... RETURNING
-- id row to come back to the inserting owner).
create policy "requests_owner_select" on public.outfit_requests
  for select to authenticated
  using (user_id = auth.uid());

-- Admin curation: full access for admins only (select any / update any). The
-- DELETE/INSERT branches are unreachable without a matching table grant.
create policy "requests_admin_all" on public.outfit_requests
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
