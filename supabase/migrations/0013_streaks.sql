-- =====================================================================
-- 0013 — Streaks. Read-own via RLS; ALL writes via service role only so a
-- client can never fake a streak.
-- =====================================================================
create table if not exists streaks (
  user_id uuid primary key references auth.users on delete cascade,
  current_count int not null default 0,
  longest_count int not null default 0,
  last_active_date date,
  freezes_remaining int not null default 0,
  freezes_reset_at timestamptz,
  updated_at timestamptz default now()
);
alter table streaks enable row level security;
create policy "own streak read" on streaks for select using (auth.uid() = user_id);
-- no insert/update policies: service role only.
