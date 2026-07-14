-- =====================================================================
-- WearWise — Migration 0023: Atomic Wear Confirmation (Phase 4C hotfix)
-- Run in the Supabase SQL editor. ADDITIVE and REVERSIBLE
-- (see supabase/rollbacks/0023_atomic_wear_confirmation_down.sql).
--
-- Fixes a release blocker found in a transactional-integrity audit of
-- /api/daily-drop/wear: the route previously performed the idempotency
-- check, the daily_recommendations UPDATE, and the wardrobe_items UPDATE as
-- THREE independent PostgREST round trips with no shared transaction and no
-- row locking. That allowed: two concurrent confirms both passing the
-- application-level status check, worn_at being overwritten by whichever
-- request committed last, and a wardrobe_items write failure being silently
-- swallowed (never checked, never reported) after daily_recommendations had
-- already committed status='worn' — a permanent partial-success state with
-- no repair path, since the next request's idempotency check would short-
-- circuit to "already" before ever retrying the dangling write.
--
-- This migration moves the ENTIRE wear-confirmation contract — ownership,
-- idempotency, exact item-set validation, availability re-check, row
-- locking, and both core writes — inside ONE PL/pgSQL function that runs in
-- ONE database transaction. Postgres itself is now the concurrency and
-- atomicity boundary, not application code.
--
-- LOCAL-DATE FIX (2026-07-11, same day as original ship): the first cut of
-- this function derived wardrobe_items.last_worn_at from the database
-- session's current-timestamp-cast-to-date — the DATABASE SESSION'S
-- calendar date, not the user's local calendar date the recommendation was
-- actually generated and confirmed for. A real embedded-Postgres execution
-- reproduced this: with daily_recommendations.local_date = '2026-01-15',
-- last_worn_at came back as the server's current date instead. Fixed by
-- reading local_date off the SAME locked daily_recommendations row (no
-- second query, no new race) and using it directly for the wardrobe_items
-- write. worn_at/updated_at are UNCHANGED — they are genuinely instant-in-
-- time timestamptz columns and correctly use the transaction's one shared
-- clock-reading variable (v_now); only the DATE column that represents
-- "which day did you wear this" was wrong.
--
-- Column types verified against the live schema before writing this
-- function (not assumed):
--   daily_recommendations.id                 uuid            (0009)
--   daily_recommendations.user_id             uuid            (0009)
--   daily_recommendations.local_date          date            (0009)
--   daily_recommendations.status              text + check    (0009)
--   daily_recommendations.selected_item_ids   uuid[]          (0009)
--   daily_recommendations.worn_at             timestamptz     (0009)
--   daily_recommendations.updated_at          timestamptz     (0009)
--   wardrobe_items.id                         uuid            (0000 base)
--   wardrobe_items.user_id                    uuid            (0000 base)
--   wardrobe_items.last_worn_at               date            (0000 base)
--   wardrobe_items.availability_status        text + check    (0007, widened
--                                              to add 'archived' by 0021) —
--                                              allowed values are exactly
--                                              'available' | 'in_wash' |
--                                              'unavailable' | 'archived'.
--
-- Security model — SECURITY INVOKER, not DEFINER:
--   Both tables already carry owner-scoped RLS policies that grant the
--   authenticated owner exactly the SELECT/UPDATE this function needs
--   (dailyrec_select_own / dailyrec_update_own from 0009; wardrobe_owner_all
--   "for all using (user_id = auth.uid())" from the base schema). A
--   SECURITY INVOKER function executes with the CALLING role's privileges,
--   so RLS is enforced exactly as if the client ran these statements
--   directly — no privilege escalation, no bypass, nothing this function can
--   do that the owner couldn't already do via PostgREST. That is a strictly
--   safer posture than SECURITY DEFINER here, and DEFINER is NOT used
--   because it is not required: there is no cross-user aggregation, no
--   service-role-only table, and no reason for this function to run as its
--   owner rather than as the caller. `search_path` is still pinned (defense
--   in depth against search_path hijacking even under INVOKER — a caller
--   cannot shadow public.wardrobe_items etc. via a schema earlier in a
--   manipulated path). EXECUTE is revoked from PUBLIC and anon; granted only
--   to authenticated. auth.uid() is read directly inside the function — no
--   user_id parameter exists, so a caller can never confirm wear on
--   another user's recommendation by passing someone else's id.
--
-- Concurrency contract:
--   `SELECT ... FOR UPDATE` on the daily_recommendations row makes it the
--   serialization point. Request A locks the row, runs to completion, and
--   COMMITs (or rolls back) before request B's SELECT ... FOR UPDATE can
--   proceed — B blocks, not races. Once A commits, B's FOR UPDATE returns
--   the now-committed row with status='worn', so B takes the idempotency
--   branch and returns 'already' with A's original worn_at, performing ZERO
--   writes. Postgres's MVCC + row lock guarantees this ordering; no
--   TypeScript busy-flag or client-side guard is part of this contract.
--   (Unaffected by the local-date fix — the fix only changes WHAT DATE
--   value is written, not the locking/idempotency contract itself.)
--
-- Rollback guarantee:
--   Everything from the FOR UPDATE lock through both core UPDATEs runs
--   inside this function's implicit transaction (a PL/pgSQL function body is
--   one transaction unless it starts a subtransaction). Any exception raised
--   after the wardrobe_items UPDATE but before the daily_recommendations
--   UPDATE completes aborts the whole transaction — Postgres rolls back
--   BOTH writes. There is no code path that can commit one core write
--   without the other. (Also unaffected by the local-date fix.)
--
-- Scope boundary (intentional, documented — not silently glossed over):
--   This function re-validates ITEM-level availability
--   (available/in_wash/archived/unavailable) atomically, matching the audit's
--   step 9. It does NOT re-run the TypeScript engine's outfit-combination
--   hard-filter legality check (candidateRejection / validateOutfitCurrent's
--   `opts.ctx` path) — that logic lives in the application layer and is not
--   ported into SQL here. A combination that was legal at generation time
--   but would now fail a hard filter (e.g. a colour-clash rule) is out of
--   scope for THIS fix; it was already a pre-existing, separately-tracked
--   gap in every read path, not something this migration introduces.
-- =====================================================================

create or replace function public.confirm_daily_drop_wear(
  p_recommendation_id uuid,
  p_item_ids uuid[]
)
returns table (
  status text,           -- confirmed | already | stale | invalid_items | not_found | error
  worn_at timestamptz,    -- set for confirmed/already; null otherwise
  item_count integer,     -- items covered by this result; 0 on any rejection
  reason text             -- machine-readable detail; null on confirmed.
                          -- 'missing_local_date' is a defensive 'error' case:
                          -- the locked recommendation row had a null
                          -- local_date, which should be impossible (NOT
                          -- NULL column, 0009) — fails closed with zero
                          -- writes rather than silently using the server's
                          -- date.
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_rec record;
  v_current_ids uuid[];
  v_local_date date;
  v_now timestamptz := clock_timestamp();
  v_missing_count integer;
  v_invalid_count integer;
begin
  -- 1-2. Resolve the authenticated user; reject unauthenticated calls.
  -- auth.uid() is read from the session JWT — never a parameter, so this
  -- function can never be pointed at another user's data.
  if v_uid is null then
    return query select 'error'::text, null::timestamptz, 0, 'unauthenticated'::text;
    return;
  end if;

  if p_recommendation_id is null then
    return query select 'error'::text, null::timestamptz, 0, 'bad_request'::text;
    return;
  end if;

  -- 3-4. Lock the recommendation row, scoped to this owner. RLS
  -- (dailyrec_select_own) already hides other users' rows under INVOKER;
  -- the explicit user_id filter is defense in depth and lets us return a
  -- clean 'not_found' instead of relying solely on RLS's silent zero rows.
  -- local_date is selected here, off the SAME locked row used for every
  -- other decision in this function — no second query, no extra race.
  select dr.id, dr.user_id, dr.status, dr.worn_at, dr.selected_item_ids, dr.local_date
    into v_rec
    from public.daily_recommendations dr
    where dr.id = p_recommendation_id
      and dr.user_id = v_uid
    for update;

  if not found then
    -- Deliberately indistinguishable from "forbidden": a row that exists but
    -- belongs to someone else is invisible under RLS before ownership can
    -- even be evaluated here. That is correct information-hiding, not a gap.
    return query select 'not_found'::text, null::timestamptz, 0, 'not_found'::text;
    return;
  end if;

  -- 5. Idempotency gate — checked with the row LOCKED, so this is the true
  -- serialization point (see concurrency contract above). A concurrent
  -- second caller cannot reach this line until the first caller's
  -- transaction has committed or rolled back.
  if v_rec.status = 'worn' then
    return query
      select 'already'::text, v_rec.worn_at, coalesce(array_length(v_rec.selected_item_ids, 1), 0), null::text;
    return;
  end if;

  -- 5b. Fail closed if local_date is unexpectedly missing. The column is
  -- NOT NULL (0009), so this should never happen — but this function must
  -- never silently fall back to the server's date, so it is checked
  -- explicitly, before any write, and before the rest of validation runs.
  if v_rec.local_date is null then
    return query select 'error'::text, null::timestamptz, 0, 'missing_local_date'::text;
    return;
  end if;
  v_local_date := v_rec.local_date;

  v_current_ids := coalesce(v_rec.selected_item_ids, '{}'::uuid[]);

  if v_current_ids is null or array_length(v_current_ids, 1) is null then
    return query select 'stale'::text, null::timestamptz, 0, 'no_items_selected'::text;
    return;
  end if;

  -- 7 (duplicates). A real outfit's item ids are always distinct — a
  -- duplicate in the submission means the payload is malformed or tampered,
  -- not merely stale, so it gets its own reason code.
  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    return query select 'invalid_items'::text, null::timestamptz, 0, 'empty_item_ids'::text;
    return;
  end if;

  if exists (select 1 from unnest(p_item_ids) x where x is null) then
    return query select 'invalid_items'::text, null::timestamptz, 0, 'null_item_id'::text;
    return;
  end if;

  if (select count(*) from unnest(p_item_ids)) <> (select count(distinct x) from unnest(p_item_ids) x) then
    return query select 'invalid_items'::text, null::timestamptz, 0, 'duplicate_item_ids'::text;
    return;
  end if;

  -- 6-7 (missing / extra / outside). Exact order-independent SET equality:
  -- same cardinality AND every submitted id is in the current set AND every
  -- current id is in the submitted set. Any mismatch — the client is
  -- missing an id that's really there, or is carrying one that isn't (e.g.
  -- a swap landed elsewhere since the client's last read) — fails closed as
  -- 'stale'. No write has happened by this point.
  if array_length(p_item_ids, 1) <> array_length(v_current_ids, 1)
     or exists (select 1 from unnest(p_item_ids) x where not (x = any(v_current_ids)))
     or exists (select 1 from unnest(v_current_ids) x where not (x = any(p_item_ids)))
  then
    return query select 'stale'::text, null::timestamptz, 0, 'outfit_changed'::text;
    return;
  end if;

  -- 8. Lock the referenced wardrobe_items rows in deterministic id order.
  -- ORDER BY id + FOR UPDATE acquires row locks in ascending id order as
  -- rows stream through the lock node — the standard Postgres pattern for
  -- avoiding deadlocks when multiple transactions may lock overlapping rows
  -- (e.g. this function and a future multi-item swap-apply path).
  perform 1
    from public.wardrobe_items wi
    where wi.id = any(v_current_ids)
      and wi.user_id = v_uid
    order by wi.id
    for update;

  -- 9a. Existence + ownership. A row that's missing (hard-deleted) or
  -- belongs to another owner (RLS hides it) won't appear in this scan —
  -- fewer matches than requested ids means at least one is invalid.
  select count(*) into v_missing_count
    from unnest(v_current_ids) want(id)
    where not exists (
      select 1 from public.wardrobe_items wi
      where wi.id = want.id and wi.user_id = v_uid
    );
  if v_missing_count > 0 then
    return query select 'invalid_items'::text, null::timestamptz, 0, 'missing_item'::text;
    return;
  end if;

  -- 9b. Availability — every item must be exactly 'available' right now
  -- (not in_wash, not archived, not the legacy 'unavailable'). Matches the
  -- allowed-value set enforced by wardrobe_items_availability_status_check.
  select count(*) into v_invalid_count
    from public.wardrobe_items wi
    where wi.id = any(v_current_ids)
      and wi.user_id = v_uid
      and wi.availability_status <> 'available';
  if v_invalid_count > 0 then
    return query select 'stale'::text, null::timestamptz, 0, 'unavailable'::text;
    return;
  end if;

  -- 10. Every check passed with zero writes so far — everything above this
  -- line is read-only. 11. One shared instant-in-time timestamp (v_now,
  -- captured at function entry) drives worn_at/updated_at, so those two can
  -- never disagree; the DATE written to wardrobe_items comes from
  -- v_local_date (the locked recommendation's own local_date), never from
  -- v_now — see the LOCAL-DATE FIX note at the top of this file.

  -- 12. Update ONLY this recommendation's exact current items — never
  -- anything outside v_current_ids, never anything outside this owner.
  -- last_worn_at is a DATE column; v_local_date is the user's LOCAL calendar
  -- date for this recommendation (daily_recommendations.local_date),
  -- deliberately NOT derived from the server clock cast to a date,
  -- current_date, now() cast to a date, or the database session's
  -- timezone — those all describe the SERVER's notion of "today", which is
  -- not necessarily the day this outfit was actually worn from the user's
  -- perspective.
  update public.wardrobe_items
    set last_worn_at = v_local_date
    where id = any(v_current_ids)
      and user_id = v_uid;

  -- 13. Confirm the recommendation itself, same transaction, same timestamp.
  -- If this UPDATE (or anything above it after the wardrobe_items UPDATE)
  -- raises, Postgres rolls back the wardrobe_items UPDATE too — there is no
  -- way to commit one core write without the other.
  update public.daily_recommendations
    set status = 'worn', worn_at = v_now, updated_at = v_now
    where id = p_recommendation_id
      and user_id = v_uid;

  -- 14. Return the stored timestamp — not a value recomputed after the
  -- fact, so the caller's response always matches what was actually written.
  return query
    select 'confirmed'::text, v_now, coalesce(array_length(v_current_ids, 1), 0), null::text;
end;
$$;

comment on function public.confirm_daily_drop_wear(uuid, uuid[]) is
  'Atomic Wear Confirmation (Phase 4C hotfix, migration 0023, local-date '
  'fix same day). Locks the daily_recommendations row FOR UPDATE, validates '
  'ownership/idempotency/local_date-present/exact item-set/availability, '
  'then writes wardrobe_items.last_worn_at (from the recommendation''s own '
  'local_date, never the server clock date) and daily_recommendations.'
  'status/worn_at/updated_at (from one shared timestamptz) in the SAME '
  'transaction. SECURITY INVOKER — runs under the caller''s own RLS-scoped '
  'privileges, never elevated. See CHANGELOG.md.';

-- Least-privilege execution: only the authenticated role may call this.
-- Never anon, never PUBLIC.
revoke all on function public.confirm_daily_drop_wear(uuid, uuid[]) from public;
revoke all on function public.confirm_daily_drop_wear(uuid, uuid[]) from anon;
grant execute on function public.confirm_daily_drop_wear(uuid, uuid[]) to authenticated;
