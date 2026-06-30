-- =====================================================================
-- WearWise — Migration 0005: AI usage logs (v0.5)
-- Run in the Supabase SQL editor. Additive only.
--
-- Purpose: meter every OpenAI call so we can compute real cost per user,
-- per wardrobe item, and per outfit request BEFORE scaling.
--
-- Privacy: this is a pure METERING table. It stores token counts, status,
-- latency, model and an estimated cost only. It NEVER stores image bytes,
-- prompt text, or user notes — only foreign-key IDs. Admin-readable only;
-- users can never SELECT these rows (RLS below).
-- =====================================================================

create table if not exists public.ai_usage_logs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete set null,
  feature             text    not null,        -- 'wardrobe_autotag' | 'outfit_draft_generation'
  target_id           uuid,                     -- wardrobe_items.id or outfit_requests.id (nullable)
  model               text    not null,        -- e.g. 'gpt-4o-mini'
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  image_count         integer not null default 0,
  status              text    not null,        -- 'success' | 'failed'
  error_message       text,                     -- short reason on failure; never prompt/user content
  latency_ms          integer,
  estimated_cost_usd  numeric(10,6),            -- null when token usage is unavailable
  created_at          timestamptz not null default now()
);

create index if not exists ai_usage_logs_feature_idx    on public.ai_usage_logs(feature);
create index if not exists ai_usage_logs_user_idx       on public.ai_usage_logs(user_id);
create index if not exists ai_usage_logs_created_at_idx on public.ai_usage_logs(created_at desc);

-- =====================================================================
-- Row Level Security
--   - SELECT: admins only. Regular users must NEVER see these logs.
--   - INSERT: the wardrobe owner logging their own auto-tag call
--     (user_id = auth.uid()), OR an admin logging a draft-generation call
--     on a customer's behalf (is_admin()). This mirrors who performs each
--     call: auto-tag runs as the signed-in user; draft generation runs as
--     an admin acting on the requesting user's row.
--   - No UPDATE / DELETE policies => immutable append-only log for clients.
-- =====================================================================
alter table public.ai_usage_logs enable row level security;

drop policy if exists "ai_usage_admin_read" on public.ai_usage_logs;
create policy "ai_usage_admin_read" on public.ai_usage_logs
  for select using (public.is_admin());

drop policy if exists "ai_usage_insert_owner_or_admin" on public.ai_usage_logs;
create policy "ai_usage_insert_owner_or_admin" on public.ai_usage_logs
  for insert with check (user_id = auth.uid() or public.is_admin());
