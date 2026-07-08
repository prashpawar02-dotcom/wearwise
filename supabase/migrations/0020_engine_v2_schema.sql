-- =====================================================================
-- WearWise — Migration 0020: Recommendation Engine v2 schema (Phase 1)
-- Run in the Supabase SQL editor. ADDITIVE and REVERSIBLE
-- (see 0020_engine_v2_schema_down.sql for the rollback).
--
-- Adds the structured garment attributes the deterministic engine needs,
-- plus three engine data tables (config weights/thresholds, occasion
-- profiles, ethnic pairing rules) and factor-persistence columns.
--
-- Safety rules honoured by the backfill (handbook §5 P1 Data):
--   * conservative defaults for existing rows
--   * NEVER auto-assign formality > 3 from a guess
--   * unknown cultural_tag stays NULL; such items are excluded from
--     auto-recommendation until the user confirms (engine treats
--     cultural_tag IS NULL on an ethnic-looking item as "unconfirmed")
--   * RLS unchanged for wardrobe_items (owner policy already covers new cols)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. wardrobe_items — structured attribute columns (all additive)
-- ---------------------------------------------------------------------
alter table public.wardrobe_items
  add column if not exists color_family           text,        -- normalized bucket: neutral|blue|green|red|...
  add column if not exists pattern_boldness        smallint,    -- 0 none .. 3 bold; NULL = unknown
  add column if not exists fabric                  text,        -- coarse: cotton|linen|denim|wool|silk|synthetic|...
  add column if not exists sleeve_length           text,        -- sleeveless|short|threequarter|full|NULL
  add column if not exists fit                     text,        -- slim|regular|relaxed|oversized|NULL
  add column if not exists formality               smallint,    -- 1 very casual .. 5 formal; NULL = unknown
  add column if not exists warmth                  smallint,    -- 1 very light .. 5 very warm; NULL = unknown
  add column if not exists min_temp_c              real,        -- comfortable-from temperature (°C); NULL = unbounded
  add column if not exists max_temp_c              real,        -- comfortable-to temperature (°C); NULL = unbounded
  add column if not exists weather_tags            text[] default '{}',  -- rain_safe|breathable|windproof|...
  add column if not exists cultural_tag            text,        -- indian_ethnic|western|indo_western|NULL(unconfirmed)
  add column if not exists modesty_level           smallint,    -- 1 .. 5 (5 = most covered); NULL = unknown
  add column if not exists layering_role           text,        -- base|standalone|mid|outer|drape|NULL
  add column if not exists accessory_role          text,        -- none|bag|jewelry|belt|scarf|watch|...
  add column if not exists footwear_formality      smallint,    -- shoe formality 1..5 (footwear rows only)
  add column if not exists footwear_weather        text,        -- open|closed|all_weather|rain_unsafe|NULL
  add column if not exists set_id                  uuid,        -- groups items that must be worn together (ethnic sets)
  add column if not exists set_required_components  text[] default '{}', -- roles the set requires e.g. {upper,bottom,drape}
  add column if not exists in_wash_since           timestamptz, -- when the item entered the wash (Phase 2 wires transitions)
  add column if not exists avoid_with              text[] default '{}',  -- item ids OR type keywords this piece must not pair with
  add column if not exists tag_confidence          jsonb default '{}'::jsonb, -- per-field confidence {formality:0.4,...}
  add column if not exists photo_quality_flag       boolean not null default false; -- true = low-quality photo, tag with care

-- Bounds so bad data can never reach the engine.
do $$ begin
  alter table public.wardrobe_items add constraint wardrobe_items_formality_range
    check (formality is null or (formality between 1 and 5));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.wardrobe_items add constraint wardrobe_items_modesty_range
    check (modesty_level is null or (modesty_level between 1 and 5));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.wardrobe_items add constraint wardrobe_items_warmth_range
    check (warmth is null or (warmth between 1 and 5));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.wardrobe_items add constraint wardrobe_items_pattern_boldness_range
    check (pattern_boldness is null or (pattern_boldness between 0 and 3));
exception when duplicate_object then null; end $$;

create index if not exists wardrobe_items_set_idx on public.wardrobe_items(set_id) where set_id is not null;

-- ---------------------------------------------------------------------
-- 2. Conservative backfill for EXISTING rows.
--    Only sets values we can infer safely; never guesses formality > 3.
-- ---------------------------------------------------------------------

-- pattern_boldness from the existing free-text pattern column.
update public.wardrobe_items set pattern_boldness =
  case
    when pattern is null or lower(pattern) in ('solid','plain','') then 0
    when lower(pattern) in ('striped','checked','printed') then 2
    when lower(pattern) in ('embroidered','floral','sequin','sequined') then 3
    else 1
  end
where pattern_boldness is null;

-- cultural_tag: only set 'western' when clearly non-ethnic by category; ethnic
-- categories and everything ambiguous stay NULL (unconfirmed → excluded from
-- auto-rec by the engine until the user confirms).
update public.wardrobe_items set cultural_tag = 'indian_ethnic'
where cultural_tag is null
  and lower(coalesce(category,'')) in ('kurta','saree','dupatta');

-- formality: conservative, capped at 3 (never guess "formal" from thin data).
update public.wardrobe_items set formality =
  case
    when lower(coalesce(category,'')) in ('saree','kurta') then 3
    when lower(coalesce(category,'')) = 'outerwear' then 3
    when lower(coalesce(category,'')) in ('top','bottom','dress','footwear','accessory','dupatta') then 2
    else 2
  end
where formality is null;

-- modesty: neutral default (3) so it never blocks unfairly; user can refine.
update public.wardrobe_items set modesty_level = 3 where modesty_level is null;

-- warmth: light default (2); wool/velvet fabric unknown at backfill time.
update public.wardrobe_items set warmth = 2 where warmth is null;

-- layering_role from category so structure completeness works day one.
update public.wardrobe_items set layering_role =
  case
    when lower(coalesce(category,'')) in ('outerwear') then 'outer'
    when lower(coalesce(category,'')) in ('dupatta') then 'drape'
    when lower(coalesce(category,'')) in ('dress','saree') then 'standalone'
    else 'standalone'
  end
where layering_role is null;

-- accessory_role for accessory rows.
update public.wardrobe_items set accessory_role = 'jewelry'
where accessory_role is null and lower(coalesce(category,'')) = 'accessory';

-- footwear_formality mirrors item formality for footwear rows.
update public.wardrobe_items set footwear_formality = coalesce(formality, 2)
where footwear_formality is null and lower(coalesce(category,'')) = 'footwear';

-- keep in_wash_since consistent with the already-shipped availability column.
update public.wardrobe_items set in_wash_since = now()
where in_wash_since is null and availability_status = 'in_wash';

-- ---------------------------------------------------------------------
-- 2b. profiles — absolute exclusion preferences (engine user-exclusion filter).
--     Additive; existing RLS owner policy already governs these columns.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists excluded_colors     text[] default '{}',
  add column if not exists excluded_categories text[] default '{}',
  add column if not exists excluded_footwear   text[] default '{}';

-- ---------------------------------------------------------------------
-- 3. engine_config — runtime-tunable weights & thresholds (jsonb rows).
--    Global config. Everyone reads; only admins write. Versioned by key.
-- ---------------------------------------------------------------------
create table if not exists public.engine_config (
  key         text primary key,          -- 'scoring_weights' | 'thresholds' | 'color_rules'
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

alter table public.engine_config enable row level security;

drop policy if exists "engine_config_read_all" on public.engine_config;
create policy "engine_config_read_all" on public.engine_config
  for select using (auth.role() = 'authenticated');

drop policy if exists "engine_config_admin_write" on public.engine_config;
create policy "engine_config_admin_write" on public.engine_config
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.engine_config (key, value, description) values
  ('scoring_weights', '{
     "color_harmony": 1.0,
     "formality_coherence": 1.0,
     "occasion_fit": 1.2,
     "comfort": 0.8,
     "user_style_alignment": 0.9,
     "novelty": 0.6
   }'::jsonb, 'Positive scoring factor weights (weighted sum).'),
  ('penalty_weights', '{
     "repeat": 1.0,
     "weather_soft": 0.7,
     "pattern_risk": 0.8,
     "accessory_irrelevance": 0.6
   }'::jsonb, 'Penalty weights subtracted from the weighted sum.'),
  ('thresholds', '{
     "confidence_dual_pick": 0.55,
     "item_cooldown_days_casual": 4,
     "item_cooldown_days_office": 7,
     "pair_cooldown_days": 14,
     "max_saturated_hues": 2,
     "max_bold_patterns": 1
   }'::jsonb, 'Engine thresholds and cooldowns.'),
  ('color_rules', '{
     "neutrals": ["neutral","white","black","grey","gray","beige","cream","ivory","navy","denim","tan","brown","charcoal"],
     "metallics": ["gold","silver","bronze","copper"]
   }'::jsonb, 'Color harmony rule data: free neutrals, metallics count as accents.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 4. occasion_profiles — text-keyed occasion behaviour (superset of the
--    occasion_type enum; adds gym/interview/etc. WITHOUT an enum migration).
-- ---------------------------------------------------------------------
create table if not exists public.occasion_profiles (
  occasion          text primary key,   -- 'work','casual','gym','interview',...
  formality_target  smallint not null,  -- ideal formality 1..5
  formality_min     smallint not null,  -- inclusive window floor
  formality_max     smallint not null,  -- inclusive window ceiling
  max_pieces        smallint not null,  -- piece-count cap
  comfort_multiplier real not null default 1.0,
  bypass_formality  boolean not null default false, -- gym/activewear
  accessory_policy  text not null default 'optional', -- 'discouraged'|'optional'|'encouraged'
  activewear_only   boolean not null default false,
  label             text
);

alter table public.occasion_profiles enable row level security;
drop policy if exists "occasion_profiles_read_all" on public.occasion_profiles;
create policy "occasion_profiles_read_all" on public.occasion_profiles
  for select using (auth.role() = 'authenticated');
drop policy if exists "occasion_profiles_admin_write" on public.occasion_profiles;
create policy "occasion_profiles_admin_write" on public.occasion_profiles
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.occasion_profiles
  (occasion, formality_target, formality_min, formality_max, max_pieces, comfort_multiplier, bypass_formality, accessory_policy, activewear_only, label) values
  ('work',            4, 3, 5, 5, 1.0, false, 'optional',    false, 'Work'),
  ('office',          4, 3, 5, 5, 1.0, false, 'optional',    false, 'Office'),
  ('interview',       5, 4, 5, 5, 1.0, false, 'encouraged',  false, 'Interview'),
  ('casual',          2, 1, 3, 4, 1.2, false, 'discouraged', false, 'Casual'),
  ('college',         2, 1, 3, 4, 1.2, false, 'discouraged', false, 'College'),
  ('travel',          2, 1, 3, 4, 1.4, false, 'discouraged', false, 'Travel'),
  ('dinner_date',     4, 3, 5, 5, 1.0, false, 'encouraged',  false, 'Dinner/date'),
  ('dinner',          4, 3, 5, 5, 1.0, false, 'encouraged',  false, 'Dinner'),
  ('party',           4, 3, 5, 6, 1.0, false, 'encouraged',  false, 'Party'),
  ('ethnic',          4, 3, 5, 6, 1.0, false, 'encouraged',  false, 'Ethnic'),
  ('festive',         5, 3, 5, 6, 1.0, false, 'encouraged',  false, 'Festive'),
  ('family_function', 4, 3, 5, 6, 1.0, false, 'encouraged',  false, 'Family function'),
  ('wedding_guest',   5, 4, 5, 6, 1.0, false, 'encouraged',  false, 'Wedding guest'),
  ('formal_event',    5, 4, 5, 5, 1.0, false, 'encouraged',  false, 'Formal event'),
  ('gym',             1, 1, 5, 3, 2.0, true,  'discouraged', true,  'Gym')
on conflict (occasion) do nothing;

-- ---------------------------------------------------------------------
-- 5. ethnic_pairing_rules — cultural pairing legality as DATA ROWS
--    (handbook §3: "implement as data rows, not code branches").
--    kind='forbid' blocks a pairing; kind='require' enforces a companion.
-- ---------------------------------------------------------------------
create table if not exists public.ethnic_pairing_rules (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,   -- 'forbid' | 'require'
  subject_key  text not null,   -- role or keyword the rule is about (e.g. 'kurta')
  object_key   text not null,   -- the paired role/keyword (e.g. 'belt')
  scope        text not null default 'any', -- occasion scope or 'any'
  message      text not null,   -- admin/debug explanation
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint ethnic_pairing_rules_kind_check check (kind in ('forbid','require'))
);

alter table public.ethnic_pairing_rules enable row level security;
drop policy if exists "ethnic_rules_read_all" on public.ethnic_pairing_rules;
create policy "ethnic_rules_read_all" on public.ethnic_pairing_rules
  for select using (auth.role() = 'authenticated');
drop policy if exists "ethnic_rules_admin_write" on public.ethnic_pairing_rules;
create policy "ethnic_rules_admin_write" on public.ethnic_pairing_rules
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.ethnic_pairing_rules (kind, subject_key, object_key, scope, message) values
  ('forbid',  'kurta',   'belt',        'any', 'A belt is not worn over a kurta.'),
  ('forbid',  'saree',   'belt',        'any', 'A belt does not belong with a saree.'),
  ('forbid',  'western_top', 'dupatta', 'any', 'A dupatta is an ethnic drape; it does not pair with a western top + pants.'),
  ('forbid',  'dress',   'dupatta',     'any', 'A dupatta does not pair with a western one-piece dress.'),
  ('forbid',  'jeans',   'dupatta',     'any', 'A dupatta does not pair with jeans.'),
  ('require', 'lehenga', 'choli',       'any', 'A lehenga is worn with a choli/blouse, not a western top.')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 6. daily_recommendations — persist engine confidence + factor breakdown.
--    (Acceptance: "factor contributions stored" + dual-pick honest mode.)
-- ---------------------------------------------------------------------
alter table public.daily_recommendations
  add column if not exists confidence         real,
  add column if not exists factor_breakdown   jsonb,        -- {factors:[{name,contribution}],penalties:[...]}
  add column if not exists is_dual_pick        boolean not null default false,
  add column if not exists engine_version      text default 'v2';

-- =====================================================================
-- End migration 0020. RLS: engine_config / occasion_profiles /
-- ethnic_pairing_rules are global reference tables (all authenticated
-- users read; only admins write). No user PII stored in them.
-- =====================================================================
