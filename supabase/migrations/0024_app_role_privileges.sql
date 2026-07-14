-- =====================================================================
-- WearWise — Migration 0024: Application role table privileges
-- Run in the Supabase SQL editor. ADDITIVE (grant/revoke only — no schema
-- shape changes) and REVERSIBLE
-- (see supabase/rollbacks/0024_app_role_privileges_down.sql).
--
-- CONFIRMED DEFECT (real local `information_schema.role_table_grants`
-- inspection, not assumed): on public.profiles, public.wardrobe_items, and
-- public.daily_recommendations, the `authenticated` role held only
-- REFERENCES, TRIGGER, and TRUNCATE — no SELECT, INSERT, UPDATE, or
-- DELETE. `service_role` also lacked normal DML on these tables. RLS
-- policies exist and are correctly scoped (see 0001, 0009, 0007), but
-- PostgreSQL's table-privilege layer runs BEFORE RLS is ever evaluated —
-- a role with no SELECT grant is rejected at the privilege check, so the
-- RLS policies for these three tables were, in effect, unreachable dead
-- code for both `authenticated` and (for DML) `service_role`.
--
-- SEPARATE security issue, same inspection: `anon` and `authenticated`
-- both held TRUNCATE, TRIGGER, and REFERENCES on these tables. RLS does
-- NOT gate TRUNCATE (TRUNCATE has no row-level concept — it empties the
-- whole table in one operation), so an unauthenticated `anon` role or any
-- signed-in `authenticated` user holding TRUNCATE could wipe
-- public.profiles / public.wardrobe_items / public.daily_recommendations
-- entirely, for every user, regardless of ownership. TRIGGER and
-- REFERENCES are similarly unnecessary for a client-facing REST/RPC role
-- and are revoked as unused attack surface, not because either was
-- individually exploited.
--
-- This migration is explicit revoke-then-grant, not a diff: every
-- statement below either removes a privilege that should never have been
-- present or adds exactly the privilege the confirmed application code
-- path requires. No RLS policy is touched (ownership/visibility logic is
-- unchanged); this migration governs ONLY whether a role's requests reach
-- the privilege layer that RLS then filters.
--
-- Why authenticated has no DELETE on profiles or daily_recommendations:
--   - profiles: the only account-deletion path
--     (src/app/api/account/delete/route.ts) deletes via
--     admin.auth.admin.deleteUser(user.id) using the SERVICE-ROLE client;
--     public.profiles rows are removed by the `on delete cascade` FK to
--     auth.users, not by the authenticated user's own session issuing a
--     DELETE. There is no other code path that deletes a profiles row as
--     the signed-in user. Granting authenticated DELETE here would be an
--     unused privilege, not a used one — omitted per least privilege.
--   - daily_recommendations: 0009 explicitly documents "no DELETE policy
--     => clients cannot delete recommendations" — even if this migration
--     granted DELETE, RLS has no delete policy for this table, so it
--     would be a privilege with no matching policy to ever allow through.
--     Omitted for the same least-privilege reason; can be added later in
--     its own migration alongside a real DELETE policy if a genuine
--     product need appears.
--   - wardrobe_items DOES get DELETE: RLS already grants the owner "for
--     all" (0001's wardrobe_owner_all policy covers ALL commands including
--     DELETE), and removing a wardrobe item the user owns is a real,
--     existing product capability — the table privilege was simply never
--     granted to match the RLS policy that already assumed it existed.
--
-- Sequence grants — verified, not assumed: all three tables use
-- `id uuid primary key default gen_random_uuid()` (0001), never a
-- serial/bigserial/identity column. `gen_random_uuid()` is a function
-- call, not a sequence, so there is no owned sequence backing any of
-- these primary keys and therefore nothing for a role to need USAGE/
-- SELECT on. Confirmed by inspecting each table's column defaults in
-- 0001_initial_schema.sql and 0009_daily_recommendations.sql — no
-- `nextval(...)` default exists on any column of any of these three
-- tables. No sequence grant statements appear in this migration because
-- none are required.
--
-- SECURITY INVOKER implication (migration 0023): confirm_daily_drop_wear
-- executes with the CALLING role's own privileges, not an owner's. Before
-- this migration, `authenticated` calling that function would have hit
-- this exact table-privilege wall on its `select ... for update` against
-- daily_recommendations and its `update` against wardrobe_items — meaning
-- migration 0023's RPC could never have actually succeeded end-to-end for
-- a real authenticated caller until this migration also lands. Table
-- grants do not replace RLS or the RPC's own ownership/exact-set/
-- availability/row-lock validation — 0023's checks remain fully mandatory
-- and unchanged; this migration only makes it possible for a correctly-
-- authorized request to reach them at all.
-- =====================================================================

-- ---------------------------------------------------------------------
-- public.profiles
-- ---------------------------------------------------------------------
revoke all on table public.profiles from public;
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;
-- anon: intentionally left with zero table privileges (no grant statement).

-- ---------------------------------------------------------------------
-- public.wardrobe_items
-- ---------------------------------------------------------------------
revoke all on table public.wardrobe_items from public;
revoke all on table public.wardrobe_items from anon;
revoke all on table public.wardrobe_items from authenticated;

grant select, insert, update, delete on table public.wardrobe_items to authenticated;
grant all on table public.wardrobe_items to service_role;
-- anon: intentionally left with zero table privileges (no grant statement).

-- ---------------------------------------------------------------------
-- public.daily_recommendations
-- ---------------------------------------------------------------------
revoke all on table public.daily_recommendations from public;
revoke all on table public.daily_recommendations from anon;
revoke all on table public.daily_recommendations from authenticated;

grant select, insert, update on table public.daily_recommendations to authenticated;
grant all on table public.daily_recommendations to service_role;
-- anon: intentionally left with zero table privileges (no grant statement).

-- ---------------------------------------------------------------------
-- Schema USAGE — verified required, granted defensively/idempotently.
-- Without USAGE on the schema, no table grant inside it is reachable
-- regardless of the table-level grants above.
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant usage on schema public to service_role;
