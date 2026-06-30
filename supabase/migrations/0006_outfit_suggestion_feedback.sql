-- =====================================================================
-- WearWise — Migration 0006: outfit suggestion feedback (v0.6)
-- Run in the Supabase SQL editor. Additive only.
--
-- Purpose: lightweight structured feedback a user can give on an APPROVED
-- outfit suggestion they were shown ("Was this useful?", "Would you wear
-- this?", an optional reason, and an optional short note).
--
-- Privacy / security:
--   - A user may INSERT feedback only for a suggestion that is their own
--     (suggestion.user_id = auth.uid()); the suggestion RLS already restricts
--     visibility to the owner's APPROVED suggestions.
--   - A user may SELECT only their own feedback. Admins may read all.
--   - No UPDATE / DELETE policies => append-only for clients.
-- =====================================================================

create table if not exists public.outfit_suggestion_feedback (
  id            uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.outfit_suggestions(id) on delete cascade,
  request_id    uuid references public.outfit_requests(id) on delete set null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  useful        boolean,                       -- "Was this useful?" yes=true / no=false / null
  would_wear    text,                          -- 'yes' | 'maybe' | 'no'
  reason        text,                          -- optional structured reason
  note          text,                          -- optional short free-text note
  created_at    timestamptz not null default now(),
  constraint outfit_suggestion_feedback_would_wear_check
    check (would_wear is null or would_wear in ('yes', 'maybe', 'no'))
);

create index if not exists outfit_suggestion_feedback_suggestion_idx
  on public.outfit_suggestion_feedback(suggestion_id);
create index if not exists outfit_suggestion_feedback_user_idx
  on public.outfit_suggestion_feedback(user_id);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.outfit_suggestion_feedback enable row level security;

-- INSERT: only for the signed-in user, and only on a suggestion that belongs
-- to them. The subquery is itself subject to outfit_suggestions RLS, which
-- exposes only the user's own APPROVED suggestions — so feedback can only be
-- attached to a suggestion the user was actually shown.
drop policy if exists "ssfeedback_insert_own" on public.outfit_suggestion_feedback;
create policy "ssfeedback_insert_own" on public.outfit_suggestion_feedback
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.outfit_suggestions s
      where s.id = suggestion_id and s.user_id = auth.uid()
    )
  );

-- SELECT: a user sees only their own feedback.
drop policy if exists "ssfeedback_select_own" on public.outfit_suggestion_feedback;
create policy "ssfeedback_select_own" on public.outfit_suggestion_feedback
  for select using (user_id = auth.uid());

-- SELECT: admins may read all feedback (for later analysis).
drop policy if exists "ssfeedback_admin_read" on public.outfit_suggestion_feedback;
create policy "ssfeedback_admin_read" on public.outfit_suggestion_feedback
  for select using (public.is_admin());
