-- =====================================================================
-- 0015 — Push subscriptions (FCM tokens + reminder prefs).
-- =====================================================================
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  fcm_token text not null,
  reminder_time time default '07:30',
  channel text default 'push',       -- push|whatsapp|email
  timezone text default 'Asia/Kolkata',
  enabled boolean default true,
  created_at timestamptz default now(),
  unique(user_id, fcm_token)
);
alter table push_subscriptions enable row level security;
create policy "own push all" on push_subscriptions
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
