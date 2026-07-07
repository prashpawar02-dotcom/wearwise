-- =====================================================================
-- 0017 — Server-side analytics mirror (PostHog is primary).
-- Service-role writes only; admin read.
-- =====================================================================
create table if not exists app_events (
  id bigint generated always as identity primary key,
  user_id uuid,
  name text not null,
  props jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists app_events_name_idx on app_events (name, created_at desc);
alter table app_events enable row level security;
create policy "admin read events" on app_events for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
-- writes service role only.
