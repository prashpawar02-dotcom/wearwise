-- =====================================================================
-- WearWise — Migration 0001: Initial schema (reconstructed baseline)
--
-- WHY THIS FILE EXISTS
-- `supabase/schema.sql` was historically the source of truth and was run
-- by hand in the Supabase SQL editor. It was never split into the
-- migration chain, and over time it silently absorbed changes that were
-- ALSO shipped as forward migrations 0002-0004 (auto-tagging columns,
-- the 'dinner_date' occasion value, and AI-outfit-draft columns). That
-- made `schema.sql` unsafe to use verbatim as 0001: applying it and then
-- replaying 0002-0004 on top would either error (duplicate column) or
-- silently no-op, masking real drift.
--
-- This migration is `schema.sql` with that overlap surgically removed,
-- so that the sequential chain 0001 -> 0002 -> 0003 -> 0004 -> ... -> 0023
-- reproduces the exact same end state as running `schema.sql` once and
-- then 0002-0023 on top. Verified overlap (see repair report for the
-- full dependency/overlap map):
--   - 0002_auto_tagging.sql owns: the `ai_tag_status` enum type, and
--     wardrobe_items.{ai_tag_status, ai_confidence, user_facing_name,
--     sub_category, style, secondary_colors, ethnic_western_fusion,
--     auto_tagged_at, user_corrected_tags}. NOT created here.
--   - 0003_occasions.sql owns: the 'dinner_date' value of occasion_type
--     (added via ALTER TYPE ADD VALUE). The enum below is created with
--     its ORIGINAL 8-value list, matching pre-0003 state.
--   - 0004_ai_outfit_drafts.sql owns: outfit_suggestions.{avoid_note,
--     missing_item_suggestion, ai_confidence, source}. NOT created here.
-- Everything else below (profiles, outfit_requests, outfit_suggestions'
-- original columns including approved_by/approved_at, feedback,
-- worn_history, is_admin(), handle_new_user(), all RLS policies, the
-- 'wardrobe' storage bucket and its policies) has no overlapping forward
-- migration and is reproduced from schema.sql as-is.
--
-- PRODUCTION WARNING: this file is for reproducible CLEAN/local databases
-- only. The hosted WearWise Supabase project already has this schema and
-- migrations through 0022 applied via the original schema.sql + forward
-- migrations path — it has NEVER run this file and MUST NOT run it
-- (every `create table`/`create type` here would either no-op harmlessly
-- via `if not exists`/exception guards or, worse, mask real drift). See
-- the migration-repair report for the production migration-history
-- reconciliation this implies is still needed before 0023 can ever be
-- applied there.
-- =====================================================================

-- Extensions ----------------------------------------------------------
create extension if not exists "pgcrypto";

-- Enums ---------------------------------------------------------------
-- Original 8-value list. 'dinner_date' is added by 0003_occasions.sql.
do $$ begin
  create type occasion_type as enum
    ('work','casual','college','ethnic','festive','party','travel','family_function');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_status as enum ('pending','in_review','fulfilled','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type suggestion_status as enum ('draft','approved','rejected');
exception when duplicate_object then null; end $$;

-- NOTE: ai_tag_status enum type is intentionally NOT created here.
-- It is created by 0002_auto_tagging.sql, along with the wardrobe_items
-- column that uses it.

-- ---------------------------------------------------------------------
-- profiles : 1:1 with auth.users
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  age_range text,            -- e.g. '22-25', '26-30'
  city text,
  style_preferences text[],  -- e.g. {minimal,traditional,bold}
  is_admin boolean not null default false,
  is_premium boolean not null default false,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- wardrobe_items : a user's clothes (photos stored in private bucket)
-- Auto-tagging columns (ai_tag_status, ai_confidence, user_facing_name,
-- sub_category, style, secondary_colors, ethnic_western_fusion,
-- auto_tagged_at, user_corrected_tags) are added by 0002_auto_tagging.sql.
-- ---------------------------------------------------------------------
create table if not exists public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null,          -- path inside the 'wardrobe' storage bucket
  category text,                     -- top, bottom, dress, kurta, saree, dupatta, footwear, outerwear, accessory
  color text,                        -- primary colour
  pattern text,                      -- solid, printed, embroidered, striped, floral
  occasion_tags occasion_type[] default '{}',
  notes text,
  last_worn_at date,
  created_at timestamptz not null default now()
);
create index if not exists wardrobe_items_user_idx on public.wardrobe_items(user_id);

-- ---------------------------------------------------------------------
-- outfit_requests : "what should I wear today" for an occasion
-- ---------------------------------------------------------------------
create table if not exists public.outfit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occasion occasion_type not null,
  notes text,                        -- weather, vibe, constraints
  status request_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists outfit_requests_user_idx on public.outfit_requests(user_id);
create index if not exists outfit_requests_status_idx on public.outfit_requests(status);

-- ---------------------------------------------------------------------
-- outfit_suggestions : up to 3 per request, human-in-the-loop approved
-- AI-draft columns (avoid_note, missing_item_suggestion, ai_confidence,
-- source) are added by 0004_ai_outfit_drafts.sql. approved_by/approved_at
-- are part of the ORIGINAL human-in-the-loop design (no overlapping
-- forward migration touches them) and are kept here.
-- ---------------------------------------------------------------------
create table if not exists public.outfit_suggestions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.outfit_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, -- denormalised for RLS
  title text,
  description text,
  item_ids uuid[] not null default '{}', -- references wardrobe_items.id
  status suggestion_status not null default 'draft',
  position smallint default 1,           -- 1..3 ordering
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists outfit_suggestions_request_idx on public.outfit_suggestions(request_id);
create index if not exists outfit_suggestions_user_idx on public.outfit_suggestions(user_id);

-- ---------------------------------------------------------------------
-- feedback : user rating on a suggestion
-- (distinct from 0006's outfit_suggestion_feedback and 0011's
-- beta_feedback — three separate tables, no naming or column overlap)
-- ---------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.outfit_suggestions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  liked boolean,
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_user_idx on public.feedback(user_id);

-- ---------------------------------------------------------------------
-- worn_history : "Worn Today" log
-- ---------------------------------------------------------------------
create table if not exists public.worn_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  suggestion_id uuid references public.outfit_suggestions(id) on delete set null,
  item_ids uuid[] not null default '{}',
  worn_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists worn_history_user_idx on public.worn_history(user_id);

-- =====================================================================
-- Helper: is the current user an admin?
-- SECURITY DEFINER avoids recursive RLS on profiles.
-- =====================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- =====================================================================
-- Auto-create a profile row when a new auth user signs up
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.wardrobe_items      enable row level security;
alter table public.outfit_requests     enable row level security;
alter table public.outfit_suggestions  enable row level security;
alter table public.feedback            enable row level security;
alter table public.worn_history        enable row level security;

-- ---- profiles -------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---- wardrobe_items : strictly private to owner ---------------------
drop policy if exists "wardrobe_owner_all" on public.wardrobe_items;
create policy "wardrobe_owner_all" on public.wardrobe_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Admins may READ wardrobe items (needed to build suggestions) but not edit.
drop policy if exists "wardrobe_admin_read" on public.wardrobe_items;
create policy "wardrobe_admin_read" on public.wardrobe_items
  for select using (public.is_admin());

-- ---- outfit_requests ------------------------------------------------
drop policy if exists "requests_owner_all" on public.outfit_requests;
create policy "requests_owner_all" on public.outfit_requests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "requests_admin_rw" on public.outfit_requests;
create policy "requests_admin_rw" on public.outfit_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- outfit_suggestions ---------------------------------------------
-- Users see ONLY approved suggestions for their own requests.
drop policy if exists "suggestions_owner_read_approved" on public.outfit_suggestions;
create policy "suggestions_owner_read_approved" on public.outfit_suggestions
  for select using (user_id = auth.uid() and status = 'approved');

-- Admins have full read/write (create drafts, edit, approve).
drop policy if exists "suggestions_admin_all" on public.outfit_suggestions;
create policy "suggestions_admin_all" on public.outfit_suggestions
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- feedback : owner can create/read their own; admin can read -----
drop policy if exists "feedback_owner_all" on public.feedback;
create policy "feedback_owner_all" on public.feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "feedback_admin_read" on public.feedback;
create policy "feedback_admin_read" on public.feedback
  for select using (public.is_admin());

-- ---- worn_history : owner only --------------------------------------
drop policy if exists "worn_owner_all" on public.worn_history;
create policy "worn_owner_all" on public.worn_history
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- Storage : private 'wardrobe' bucket. Photos are NEVER public.
-- Access via signed URLs only. Path convention: <user_id>/<filename>.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('wardrobe', 'wardrobe', false)
on conflict (id) do nothing;

drop policy if exists "wardrobe_storage_owner_read" on storage.objects;
create policy "wardrobe_storage_owner_read" on storage.objects
  for select using (
    bucket_id = 'wardrobe'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

drop policy if exists "wardrobe_storage_owner_insert" on storage.objects;
create policy "wardrobe_storage_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'wardrobe'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "wardrobe_storage_owner_delete" on storage.objects;
create policy "wardrobe_storage_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'wardrobe'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- To make yourself an admin after signing up, run:
--   update public.profiles set is_admin = true where id = '<your-auth-user-id>';
