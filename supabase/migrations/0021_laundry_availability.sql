-- =====================================================================
-- WearWise — Migration 0021: Laundry / Availability System (Phase 2)
-- Run in the Supabase SQL editor. ADDITIVE and REVERSIBLE
-- (see 0021_laundry_availability_down.sql for the rollback).
--
-- Builds on migration 0007 (availability_status) and 0020 (in_wash_since).
-- Phase 2 introduces the state machine available ⇄ in_wash (+ archived),
-- a quiet post-wear flow with an "ask me less" preference, a learned
-- wash-cycle estimate, and a per-category wear/wash learning stub.
--
-- Safety:
--   * All columns are additive with safe defaults; existing rows are unchanged.
--   * The availability CHECK is widened (never narrowed): the legacy
--     'unavailable' value stays valid; 'archived' is added.
--   * RLS: wardrobe_items / profiles reuse existing owner policies. The new
--     laundry_wear_stats table gets its own owner-only policy.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. availability_status — widen the allowed set to add 'archived'.
--    State machine (Phase 2): available ⇄ in_wash, plus archived and the
--    legacy 'unavailable' (kept so older rows/clients never break).
-- ---------------------------------------------------------------------
alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_availability_status_check;

do $$ begin
  alter table public.wardrobe_items
    add constraint wardrobe_items_availability_status_check
    check (availability_status in ('available', 'in_wash', 'unavailable', 'archived'));
exception when duplicate_object then null; end $$;

-- Keep in_wash_since honest with the state: only in_wash rows may carry a
-- timestamp; anything else must have none. (One-time cleanup for legacy rows
-- written before Phase 2 wired the transitions.)
update public.wardrobe_items
  set in_wash_since = coalesce(in_wash_since, now())
  where availability_status = 'in_wash' and in_wash_since is null;

update public.wardrobe_items
  set in_wash_since = null
  where availability_status <> 'in_wash' and in_wash_since is not null;

-- Fast "what's ready to come back?" scans (auto-return badge).
create index if not exists wardrobe_items_in_wash_since_idx
  on public.wardrobe_items(user_id, in_wash_since)
  where availability_status = 'in_wash';

-- ---------------------------------------------------------------------
-- 2. profiles — post-wear sheet preference + learned wash-cycle estimate
--    + quiet throttles for the "never nag" guarantees.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists postwear_sheet_enabled    boolean     not null default true,  -- master switch for the post-wear sheet
  add column if not exists postwear_prompt_dismissals smallint    not null default 0,     -- "Ask me less" counter; 3 → sheet goes silent
  add column if not exists wash_cycle_days            smallint    not null default 4,     -- learned est.; default 4d (dry-clean handled per-category)
  add column if not exists laundry_return_prompt_at   timestamptz,                        -- last time the soft auto-return badge was shown (throttle)
  add column if not exists laundry_wash_note_at        timestamptz;                        -- last time the >60%-in-wash inline note fired (one per cycle)

do $$ begin
  alter table public.profiles
    add constraint profiles_wash_cycle_days_check
    check (wash_cycle_days between 1 and 60);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles
    add constraint profiles_postwear_dismissals_check
    check (postwear_prompt_dismissals between 0 and 100);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 3. laundry_wear_stats — per-category wear/wash counters (learning STUB).
--    Counts only; nothing reads these to change recommendations yet. They
--    exist so a future per-category wash-cycle estimate has ground truth.
-- ---------------------------------------------------------------------
create table if not exists public.laundry_wear_stats (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  category    text        not null,                       -- normalized wardrobe category bucket
  wears       integer     not null default 0,             -- times worn since last wash
  washes      integer     not null default 0,             -- times sent to the wash
  total_wears integer     not null default 0,             -- lifetime wears (never reset)
  updated_at  timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.laundry_wear_stats enable row level security;

-- Owner-only: a user can only ever see/among their own rows (matches the
-- wardrobe_items / profiles convention). Split policies so each command is
-- explicit and testable.
do $$ begin
  create policy laundry_wear_stats_select_own on public.laundry_wear_stats
    for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy laundry_wear_stats_insert_own on public.laundry_wear_stats
    for insert with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy laundry_wear_stats_update_own on public.laundry_wear_stats
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy laundry_wear_stats_delete_own on public.laundry_wear_stats
    for delete using (user_id = auth.uid());
exception when duplicate_object then null; end $$;
