-- =====================================================================
-- WearWise — Migration 0029: Quiet-Gem cooldown state + durable removal
-- idempotency + wear skip-reset (Phase 5, Modules B + F). Applied by
-- `supabase db reset`. REVERSIBLE (supabase/rollbacks/0029_gem_cooldown_down.sql,
-- NON-executed). NOT applied to hosted Supabase.
-- =====================================================================

-- ---- PART 1: per-item cooldown columns (Module B) ----
alter table public.wardrobe_items
  add column if not exists gem_skip_count integer not null default 0,
  add column if not exists gem_cooldown_until timestamptz,
  add column if not exists gem_rested_notified boolean not null default false;

alter table public.wardrobe_items drop constraint if exists wardrobe_items_gem_skip_count_nonneg;
alter table public.wardrobe_items add constraint wardrobe_items_gem_skip_count_nonneg check (gem_skip_count >= 0);
alter table public.wardrobe_items drop constraint if exists wardrobe_items_gem_rested_requires_cooldown;
alter table public.wardrobe_items add constraint wardrobe_items_gem_rested_requires_cooldown
  check (not (gem_rested_notified and gem_cooldown_until is null));

comment on column public.wardrobe_items.gem_skip_count is
  'Phase 5: explicit item-specific Quiet-Gem removals in the CURRENT cycle. Reset on cooldown expiry or a confirmed gem wear.';
comment on column public.wardrobe_items.gem_cooldown_until is
  'Phase 5: Quiet-Gem cooldown expiry (timestamptz). NULL = not resting. Excluded as a gem while now() < this (exclusive).';
comment on column public.wardrobe_items.gem_rested_notified is
  'Phase 5: true once the one-time rest message has been shown for the CURRENT cooldown cycle (cleared on expiry).';

-- ---- PART 2: durable processed-removal record (Module F6) ----
-- Integrity state, NOT a user-editable log: only the SECURITY DEFINER function
-- below inserts. Clients get read-own SELECT, but NO insert/update/delete.
create table if not exists public.gem_removal_events (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  operation_id       uuid not null,                        -- client-generated once per committed accept
  recommendation_id  uuid references public.daily_recommendations(id) on delete set null,
  gem_item_id        uuid references public.wardrobe_items(id) on delete set null,
  outfit_fingerprint text not null,                        -- server-derived canonical sorted post-swap ids (no PII)
  created_at         timestamptz not null default now(),
  constraint gem_removal_events_owner_op_uniq unique (user_id, operation_id)
);

comment on table public.gem_removal_events is
  'Phase 5 (F6): append-only, function-written record of committed Quiet-Gem removals. UNIQUE(user_id, operation_id) makes the removal transition idempotent. Clients cannot insert (only record_gem_removal, SECURITY DEFINER, does).';

alter table public.gem_removal_events enable row level security;

drop policy if exists "gem_removal_owner_select" on public.gem_removal_events;
create policy "gem_removal_owner_select" on public.gem_removal_events
  for select using (user_id = auth.uid());
-- No INSERT/UPDATE/DELETE policy: clients never mutate this table directly.

revoke all on table public.gem_removal_events from public;
revoke all on table public.gem_removal_events from anon;
revoke all on table public.gem_removal_events from authenticated;
revoke all on table public.gem_removal_events from service_role;
grant select on table public.gem_removal_events to authenticated;  -- read-own only (no insert)
grant all on table public.gem_removal_events to service_role;

-- ---- PART 2b: atomic removal transition (SECURITY DEFINER) ----
-- Runs as the table owner so it (and ONLY it) can insert the integrity record,
-- while every ownership decision is derived from auth.uid(). search_path pinned.
create or replace function public.record_gem_removal(
  p_operation_id uuid,
  p_recommendation_id uuid,
  p_gem_item_id uuid,
  p_expected_post_swap_ids uuid[]
)
returns table (status text, show_rest_message boolean, skip_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_rec public.daily_recommendations%rowtype;
  v_item public.wardrobe_items%rowtype;
  v_rowcount integer := 0;
  v_fingerprint text;
  v_expected text;
  v_new_count integer;
  v_now timestamptz := now();
  v_cooldown_days constant integer := 90;
  v_unavailable integer := 0;
begin
  if v_uid is null then
    return query select 'error'::text, false, null::integer; return;
  end if;

  -- Owner-scoped lock of the authoritative recommendation (DEFINER bypasses RLS,
  -- so ownership is enforced explicitly here).
  select * into v_rec from public.daily_recommendations
    where id = p_recommendation_id and user_id = v_uid
    for update;
  if not found then
    return query select 'not_found'::text, false, null::integer; return;
  end if;

  if v_rec.outfit_status is distinct from 'complete' then
    return query select 'not_complete'::text, false, null::integer; return;
  end if;

  -- Owner of the gem item.
  perform 1 from public.wardrobe_items where id = p_gem_item_id and user_id = v_uid;
  if not found then
    return query select 'item_not_found'::text, false, null::integer; return;
  end if;

  -- The pre-swap outfit MUST have contained the gem (a real removal, not inferred
  -- merely from the gem's current absence).
  if v_rec.pre_swap_item_ids is null or not (p_gem_item_id = any(v_rec.pre_swap_item_ids)) then
    return query select 'pre_swap_missing_gem'::text, false, null::integer; return;
  end if;

  -- The post-swap outfit must NOT contain the gem.
  if p_gem_item_id = any(v_rec.selected_item_ids) then
    return query select 'gem_still_present'::text, false, null::integer; return;
  end if;

  -- The current selected set must match the accepted post-swap identity.
  select coalesce(string_agg(x, ',' order by x), '') into v_fingerprint
    from unnest(v_rec.selected_item_ids::text[]) as x;
  select coalesce(string_agg(x, ',' order by x), '') into v_expected
    from unnest(coalesce(p_expected_post_swap_ids, '{}')::text[]) as x;
  if v_fingerprint is distinct from v_expected then
    return query select 'result_mismatch'::text, false, null::integer; return;
  end if;

  -- Every selected item must remain owned + available right now.
  select count(*) into v_unavailable
    from unnest(v_rec.selected_item_ids) as sid
    where not exists (
      select 1 from public.wardrobe_items wi
      where wi.id = sid and wi.user_id = v_uid and coalesce(wi.availability_status, 'available') = 'available'
    );
  if v_unavailable > 0 then
    return query select 'outfit_unavailable'::text, false, null::integer; return;
  end if;

  -- Idempotent insert of the processed-removal record (server-derived fingerprint).
  insert into public.gem_removal_events
    (user_id, operation_id, recommendation_id, gem_item_id, outfit_fingerprint)
  values (v_uid, p_operation_id, p_recommendation_id, p_gem_item_id, v_fingerprint)
  on conflict (user_id, operation_id) do nothing;
  get diagnostics v_rowcount = row_count;

  if v_rowcount = 0 then
    select gem_skip_count into v_new_count from public.wardrobe_items where id = p_gem_item_id and user_id = v_uid;
    return query select 'duplicate'::text, false, coalesce(v_new_count, 0); return;
  end if;

  select * into v_item from public.wardrobe_items where id = p_gem_item_id and user_id = v_uid for update;

  if v_item.gem_cooldown_until is not null and v_item.gem_cooldown_until <= v_now then
    v_item.gem_skip_count := 0; v_item.gem_cooldown_until := null; v_item.gem_rested_notified := false;
  end if;

  if v_item.gem_cooldown_until is not null and v_item.gem_cooldown_until > v_now then
    update public.wardrobe_items
      set gem_skip_count = v_item.gem_skip_count, gem_cooldown_until = v_item.gem_cooldown_until, gem_rested_notified = v_item.gem_rested_notified
      where id = p_gem_item_id;
    return query select 'cooling'::text, false, v_item.gem_skip_count; return;
  end if;

  v_new_count := v_item.gem_skip_count + 1;
  if v_new_count >= 2 and not v_item.gem_rested_notified then
    update public.wardrobe_items
      set gem_skip_count = v_new_count, gem_cooldown_until = v_now + make_interval(days => v_cooldown_days), gem_rested_notified = true
      where id = p_gem_item_id;
    return query select 'rested'::text, true, v_new_count; return;
  else
    update public.wardrobe_items
      set gem_skip_count = v_new_count, gem_cooldown_until = v_item.gem_cooldown_until, gem_rested_notified = v_item.gem_rested_notified
      where id = p_gem_item_id;
    return query select 'counted'::text, false, v_new_count; return;
  end if;
end;
$$;

revoke all on function public.record_gem_removal(uuid, uuid, uuid, uuid[]) from public;
revoke all on function public.record_gem_removal(uuid, uuid, uuid, uuid[]) from anon;
grant execute on function public.record_gem_removal(uuid, uuid, uuid, uuid[]) to authenticated;

-- ---- PART 2c: best-effort skip reset after a confirmed gem wear (F7/F9) ----
-- Verifies (server-side) the gem is in the authoritative worn outfit, resets an
-- INCOMPLETE skip progression, and NEVER cancels an active cooldown. Idempotent.
create or replace function public.reset_gem_skip_after_wear(
  p_recommendation_id uuid,
  p_gem_item_id uuid
)
returns table (reset boolean, is_gem_wear boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_rec public.daily_recommendations%rowtype;
  v_rowcount integer := 0;
begin
  if v_uid is null then return query select false, false; return; end if;
  select * into v_rec from public.daily_recommendations where id = p_recommendation_id and user_id = v_uid;
  if not found then return query select false, false; return; end if;
  if not (p_gem_item_id = any(v_rec.selected_item_ids)) then return query select false, false; return; end if;

  -- Reset only an incomplete progression; never touch an active cooldown / availability.
  update public.wardrobe_items
    set gem_skip_count = 0
    where id = p_gem_item_id and user_id = v_uid and gem_cooldown_until is null and gem_skip_count > 0;
  get diagnostics v_rowcount = row_count;
  return query select (v_rowcount > 0), true; return;
end;
$$;

revoke all on function public.reset_gem_skip_after_wear(uuid, uuid) from public;
revoke all on function public.reset_gem_skip_after_wear(uuid, uuid) from anon;
grant execute on function public.reset_gem_skip_after_wear(uuid, uuid) to authenticated;
