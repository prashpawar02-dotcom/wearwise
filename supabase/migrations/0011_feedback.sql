-- =====================================================================
-- WearWise — Migration 0011: private-beta feedback capture (v0.11)
-- Run in the Supabase SQL editor. Additive only.
--
-- Purpose: a lightweight place for beta users to report what felt confusing,
-- broken, or useful. This is NOT a support/helpdesk system.
--
-- NOTE ON NAMING: `public.feedback` already exists (suggestion ratings), so this
-- general beta feedback lives in `public.beta_feedback`.
--
-- Privacy: stores only the user's own typed message + a coarse context label.
-- No screenshots, no image paths/URLs, no email/name (user_id links to the
-- account but is nulled if the account is deleted).
-- =====================================================================

create table if not exists public.beta_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null, -- keep feedback if account is deleted
  type        text not null,           -- confusing | bug | missing_feature | praise | other
  message     text not null,
  context     text,                    -- coarse screen label (today/wardrobe/style_me/daily_drop/profile/admin/other)
  created_at  timestamptz not null default now(),
  constraint beta_feedback_type_check
    check (type in ('confusing', 'bug', 'missing_feature', 'praise', 'other'))
);

create index if not exists beta_feedback_created_idx on public.beta_feedback(created_at desc);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.beta_feedback enable row level security;

-- INSERT: a signed-in user may only submit feedback as themselves.
drop policy if exists "beta_feedback_insert_own" on public.beta_feedback;
create policy "beta_feedback_insert_own" on public.beta_feedback
  for insert with check (user_id = auth.uid());

-- SELECT: admins only (for beta review). Regular users cannot read feedback —
-- there is intentionally NO owner/public read policy.
drop policy if exists "beta_feedback_admin_read" on public.beta_feedback;
create policy "beta_feedback_admin_read" on public.beta_feedback
  for select using (public.is_admin());

-- No UPDATE / DELETE policies => append-only for all clients.
