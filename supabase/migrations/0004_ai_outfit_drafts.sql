-- =====================================================================
-- WearWise — Migration 0004: AI outfit drafts (v0.4)
-- Run in the Supabase SQL editor. Additive only; RLS unchanged.
-- AI-generated suggestions are stored as status='draft', source='ai'.
-- Users still only ever see status='approved' (existing RLS policy).
-- =====================================================================
alter table public.outfit_suggestions
  add column if not exists avoid_note              text,
  add column if not exists missing_item_suggestion text,
  add column if not exists ai_confidence           real,
  add column if not exists source                  text not null default 'manual';
