-- =====================================================================
-- 0026 — Authoritative recommendation metadata (Phase 4 hotfix)
-- Adds the engine-owned completeness + honest-reason + freshness columns so no
-- reader ever has to infer them from selected_item_ids. Additive & nullable:
-- legacy rows carry NULL authority metadata and are regenerated ONCE on the next
-- authoritative read before being trusted (see ensureTodayDrop / prepareDailyDrop).
-- Do NOT apply to hosted Supabase during implementation.
-- =====================================================================

alter table public.daily_recommendations
  add column if not exists outfit_status         text,
  add column if not exists missing_slots          text[] not null default '{}',
  add column if not exists partial_reason          text,
  add column if not exists inventory_fingerprint   text;

-- CHECK constraint limited to the states the application actually stores.
-- NULL is allowed for legacy rows (they regenerate once before being authoritative).
alter table public.daily_recommendations
  drop constraint if exists daily_recommendations_outfit_status_check;

alter table public.daily_recommendations
  add constraint daily_recommendations_outfit_status_check
  check (outfit_status is null or outfit_status in ('complete', 'partial', 'constrained'));

comment on column public.daily_recommendations.outfit_status is
  'Engine-owned completeness: complete | partial | constrained (NULL = legacy, regenerate once).';
comment on column public.daily_recommendations.missing_slots is
  'Canonical slots the stored outfit is honestly missing (e.g. {footwear}).';
comment on column public.daily_recommendations.partial_reason is
  'Fine-grained honest reason code for a partial/constrained result (engine/footwear.ts).';
comment on column public.daily_recommendations.inventory_fingerprint is
  'Canonical inventory fingerprint at generation time (freshness; recommendation.fingerprint).';
