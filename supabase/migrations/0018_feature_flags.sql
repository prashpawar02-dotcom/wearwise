-- =====================================================================
-- 0018 — Feature flags: Admin Control Panel backing store.
-- Keys: '<feature>.mode' ('auto'|'human'), '<feature>.enabled' (bool),
-- 'ai.daily_budget' (INR/day), 'ai.per_user_daily_cap' (calls/day),
-- 'eco_mode' (bool: rules-only, AI paused).
-- =====================================================================
create table if not exists feature_flags (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz default now()
);
alter table feature_flags enable row level security;
create policy "admin read flags" on feature_flags for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
-- writes: service role only (admin API route verifies is_admin, then writes).

insert into feature_flags (key, value) values
  ('daily_drop.mode',      '"auto"'),
  ('daily_drop.enabled',   'true'),
  ('occasions.mode',       '"auto"'),
  ('occasions.enabled',    'true'),
  ('manual_analysis.mode', '"auto"'),
  ('manual_analysis.enabled', 'true'),
  ('swaps.enabled',        'true'),
  ('share_vote.enabled',   'true'),
  ('notifications.enabled','true'),
  ('referral.enabled',     'true'),
  ('billing.enabled',      'true'),
  ('eco_mode',             'false'),
  ('ai.daily_budget',      '200'),
  ('ai.per_user_daily_cap','10')
on conflict (key) do nothing;
