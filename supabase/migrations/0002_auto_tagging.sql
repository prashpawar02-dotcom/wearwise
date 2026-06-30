-- =====================================================================
-- WearWise — Migration 0002: Auto-Tagging v0.2
-- Run this in the Supabase SQL editor on an existing database that was
-- created from the original schema.sql. Idempotent and additive only —
-- no data loss, RLS unchanged (the owner policy already covers new cols).
-- =====================================================================

do $$ begin
  create type ai_tag_status as enum ('analyzing','tagged','needs_review','failed');
exception when duplicate_object then null; end $$;

alter table public.wardrobe_items
  add column if not exists ai_tag_status        ai_tag_status not null default 'tagged',
  add column if not exists ai_confidence         real,
  add column if not exists user_facing_name      text,
  add column if not exists sub_category           text,
  add column if not exists style                  text,
  add column if not exists secondary_colors       text[] default '{}',
  add column if not exists ethnic_western_fusion  text,
  add column if not exists auto_tagged_at         timestamptz,
  add column if not exists user_corrected_tags    boolean not null default false;

-- Existing rows (manual/seed) default to 'tagged' so they are treated as
-- already-confirmed. New uploads set 'analyzing' from the app.
