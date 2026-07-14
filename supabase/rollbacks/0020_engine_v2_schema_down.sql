-- =====================================================================
-- WearWise — Migration 0020 ROLLBACK (Recommendation Engine v2 schema)
-- Reverses 0020_engine_v2_schema.sql. Run only to undo Phase 1 schema.
-- Drops added columns and the three engine data tables. Data in the
-- dropped columns/tables is lost (expected for a rollback).
-- =====================================================================

-- 6. daily_recommendations columns
alter table public.daily_recommendations
  drop column if exists confidence,
  drop column if exists factor_breakdown,
  drop column if exists is_dual_pick,
  drop column if exists engine_version;

-- 5. ethnic_pairing_rules
drop table if exists public.ethnic_pairing_rules;

-- 4. occasion_profiles
drop table if exists public.occasion_profiles;

-- 3. engine_config
drop table if exists public.engine_config;

-- 2b. profiles exclusion columns
alter table public.profiles
  drop column if exists excluded_colors,
  drop column if exists excluded_categories,
  drop column if exists excluded_footwear;

-- 1. wardrobe_items constraints + columns
alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_formality_range,
  drop constraint if exists wardrobe_items_modesty_range,
  drop constraint if exists wardrobe_items_warmth_range,
  drop constraint if exists wardrobe_items_pattern_boldness_range;

drop index if exists public.wardrobe_items_set_idx;

alter table public.wardrobe_items
  drop column if exists color_family,
  drop column if exists pattern_boldness,
  drop column if exists fabric,
  drop column if exists sleeve_length,
  drop column if exists fit,
  drop column if exists formality,
  drop column if exists warmth,
  drop column if exists min_temp_c,
  drop column if exists max_temp_c,
  drop column if exists weather_tags,
  drop column if exists cultural_tag,
  drop column if exists modesty_level,
  drop column if exists layering_role,
  drop column if exists accessory_role,
  drop column if exists footwear_formality,
  drop column if exists footwear_weather,
  drop column if exists set_id,
  drop column if exists set_required_components,
  drop column if exists in_wash_since,
  drop column if exists avoid_with,
  drop column if exists tag_confidence,
  drop column if exists photo_quality_flag;
