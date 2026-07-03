-- =====================================================================
-- WearWise — Migration 0008: Daily Outfit Drop preferences (v0.8, Phase 1)
-- Run in the Supabase SQL editor. Additive only.
--
-- Purpose: persist a user's Daily Outfit Drop *preferences* on their own
-- profile row. This is Phase 1 of the Daily Outfit Drop plan
-- (docs/strategy/daily-outfit-drop-architecture.md, §3a).
--
-- Scope guardrail — this migration adds PREFERENCE COLUMNS ONLY.
--   - It does NOT create the daily_recommendations cache table.
--   - It does NOT schedule anything.
--   - It does NOT deliver notifications.
-- Storing a preference is not the same as acting on it; nothing reads these
-- columns to send anything yet.
--
-- Defaults are privacy-first: the feature is OFF (daily_drop_enabled = false)
-- until the user explicitly turns it on. Existing rows get safe defaults, so
-- nothing changes for current users.
--
-- Security: no RLS change needed. The existing "profiles_update_own" policy
-- (for update using id = auth.uid()) already governs these columns, so a user
-- can only change preferences on their own profile row.
-- =====================================================================

alter table public.profiles
  add column if not exists timezone               text,                       -- IANA tz, e.g. 'Asia/Kolkata'; null => default tz later
  add column if not exists daily_drop_enabled     boolean    not null default false,   -- master opt-in (off by default)
  add column if not exists daily_drop_time        time       not null default '07:30',  -- preferred local drop time
  add column if not exists daily_drop_days         smallint[] not null default '{0,1,2,3,4,5,6}', -- 0=Sun..6=Sat active days
  add column if not exists show_quiet_gems        boolean    not null default true,    -- resurface under-worn pieces
  add column if not exists weather_advice_enabled boolean    not null default true;    -- include weather line in the drop

-- Guard the day-of-week array so it can only ever hold valid weekday codes (0..6).
do $$ begin
  alter table public.profiles
    add constraint profiles_daily_drop_days_check
    check (
      daily_drop_days <@ array[0,1,2,3,4,5,6]::smallint[]
    );
exception when duplicate_object then null; end $$;
