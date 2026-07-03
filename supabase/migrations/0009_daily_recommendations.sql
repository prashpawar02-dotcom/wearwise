-- =====================================================================
-- WearWise — Migration 0009: daily_recommendations cache (v0.9, Phase 2)
-- Run in the Supabase SQL editor. Additive only.
--
-- Purpose: cache ONE prepared outfit recommendation per user per LOCAL date
-- (docs/strategy/daily-outfit-drop-architecture.md, §3b). This is the
-- "today's pick is ready" record that the authenticated Today screen reads.
--
-- Scope guardrail:
--   - Rows are written by prepareDailyDrop() running server-side as the
--     signed-in user (their session; RLS applies). No cron, no notifications,
--     no service-role writes in this pass.
--   - The table stores wardrobe item IDs ONLY. It NEVER stores image paths or
--     signed URLs. Signed URLs are resolved at render time on the authenticated
--     dashboard, exactly like the rest of the app.
--
-- Uniqueness (user_id, local_date) makes prepare idempotent: the same day can
-- only ever hold one recommendation, so repeated prepare calls upsert instead
-- of duplicating.
-- =====================================================================

create table if not exists public.daily_recommendations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  local_date         date not null,                       -- user's LOCAL calendar date for this drop
  status             text not null default 'prepared',    -- prepared | opened | worn | skipped | failed
  selected_item_ids  uuid[] not null default '{}',        -- references wardrobe_items.id (IDs only — never URLs)
  weather_summary    text,                                -- short text e.g. "28° · Humid"; null if unavailable
  occasion_context   text default 'daily',                -- best-guess context label for the day
  reasoning          text,                                -- honest "why it works" copy
  daily_insight      text,                                -- one calm insight line
  fail_reason        text,                                -- set when status='failed' (disabled|too_few_items|no_wardrobe|generation_error|...)
  opened_at          timestamptz,
  worn_at            timestamptz,
  skipped_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint daily_recommendations_status_check
    check (status in ('prepared', 'opened', 'worn', 'skipped', 'failed')),
  constraint daily_recommendations_user_date_unique
    unique (user_id, local_date)
);

create index if not exists daily_recommendations_user_date_idx
  on public.daily_recommendations(user_id, local_date desc);

-- =====================================================================
-- Row Level Security — owner-scoped. A user can only ever see or change
-- their own recommendations. There is no admin or public access.
-- =====================================================================
alter table public.daily_recommendations enable row level security;

-- SELECT: owner only.
drop policy if exists "dailyrec_select_own" on public.daily_recommendations;
create policy "dailyrec_select_own" on public.daily_recommendations
  for select using (user_id = auth.uid());

-- INSERT: only for the signed-in user's own row. prepareDailyDrop() runs as the
-- authenticated user in this pass (no service role yet), so it needs to insert
-- its own recommendation. Still fully owner-scoped.
drop policy if exists "dailyrec_insert_own" on public.daily_recommendations;
create policy "dailyrec_insert_own" on public.daily_recommendations
  for insert with check (user_id = auth.uid());

-- UPDATE: owner only (idempotent re-prepare upserts, plus client actions like
-- opened / worn / skipped later).
drop policy if exists "dailyrec_update_own" on public.daily_recommendations;
create policy "dailyrec_update_own" on public.daily_recommendations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- NOTE: no DELETE policy => clients cannot delete recommendations.
-- When a scheduled cron is added later (Phase 3) it will use the service-role
-- key (which bypasses RLS) to prepare drops for many users; at that point the
-- insert policy above can be narrowed if desired.
