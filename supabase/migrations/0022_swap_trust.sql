-- =====================================================================
-- WearWise — Migration 0022: Swap · Another Option · Why This Works (Phase 3)
-- Run in the Supabase SQL editor. ADDITIVE and REVERSIBLE
-- (see 0022_swap_trust_down.sql for the rollback).
--
-- Adds the trust-feature infrastructure:
--   * daily_recommendations.swap_candidates  — precomputed top-5 replacement
--     candidates per present slot (IDs ONLY — never image paths/URLs), so a
--     swap renders < 1s p75 (handbook §5 P3 acceptance).
--   * daily_recommendations.base_item_ids    — the pristine generated outfit,
--     never mutated by swaps/options (anchors "Another Option" and analytics).
--   * daily_recommendations.pre_swap_item_ids — snapshot taken immediately
--     before the most recent swap so "Put back" restores it exactly (undo).
--   * daily_recommendations.swaps_used / options_used — per-drop cap counters
--     (3 swaps/day, 2 options/drop free; first 3 sessions exempt). Enforced
--     SERVER-SIDE; UI is cosmetic.
--   * drop_feedback — 👎 + one optional reason chip, persisted for Phase 7
--     learning. Corrections are ALWAYS free (never gated).
--
-- Privacy: no image paths/URLs and no free text are stored here. swap_candidates
-- and the *_item_ids columns hold wardrobe_items.id values only. drop_feedback
-- stores a coarse reason enum, never a note.
-- RLS: daily_recommendations already owner-scoped (0009). drop_feedback gets its
-- own owner-insert / owner-read + admin-read policies below.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. daily_recommendations — swap/undo/cap columns (all additive)
-- ---------------------------------------------------------------------
alter table public.daily_recommendations
  add column if not exists swap_candidates    jsonb   not null default '{}'::jsonb,  -- { slot: [itemId,...] }
  add column if not exists base_item_ids      uuid[]  not null default '{}',         -- pristine generated outfit (never mutated)
  add column if not exists pre_swap_item_ids  uuid[],                                -- snapshot before the latest swap; NULL = nothing to undo
  add column if not exists swaps_used         int     not null default 0,
  add column if not exists options_used       int     not null default 0;

-- Cap counters can never go negative.
do $$ begin
  alter table public.daily_recommendations
    add constraint daily_recommendations_swaps_used_nonneg check (swaps_used >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.daily_recommendations
    add constraint daily_recommendations_options_used_nonneg check (options_used >= 0);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. drop_feedback — 👎 + optional reason chip (Phase 3 → Phase 7 learning)
-- ---------------------------------------------------------------------
create table if not exists public.drop_feedback (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  recommendation_id  uuid references public.daily_recommendations(id) on delete set null,
  local_date         date,                              -- the drop's local date (context, not PII)
  item_ids           uuid[] not null default '{}',      -- the outfit the 👎 was about (IDs only)
  reason             text,                              -- optional structured reason chip; NULL = plain 👎
  occasion_context   text,                              -- coarse occasion label at the time
  created_at         timestamptz not null default now(),
  constraint drop_feedback_reason_check
    check (reason is null or reason in ('too_formal', 'not_my_style', 'uncomfortable', 'weather', 'repeat'))
);

create index if not exists drop_feedback_user_idx on public.drop_feedback(user_id, created_at desc);
create index if not exists drop_feedback_reason_idx on public.drop_feedback(reason);

-- =====================================================================
-- Row Level Security — owner-scoped. Corrections are the user's own data.
-- =====================================================================
alter table public.drop_feedback enable row level security;

-- INSERT: a signed-in user may only submit feedback as themselves.
drop policy if exists "drop_feedback_insert_own" on public.drop_feedback;
create policy "drop_feedback_insert_own" on public.drop_feedback
  for insert with check (user_id = auth.uid());

-- SELECT: owner may read their own feedback; admins may read all (Phase 7 review).
drop policy if exists "drop_feedback_select_own" on public.drop_feedback;
create policy "drop_feedback_select_own" on public.drop_feedback
  for select using (user_id = auth.uid() or public.is_admin());

-- No UPDATE / DELETE policies => append-only for all clients.

-- =====================================================================
-- End migration 0022.
-- =====================================================================
