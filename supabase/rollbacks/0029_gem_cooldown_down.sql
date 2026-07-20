-- Rollback for 0029_gem_cooldown.sql (NON-executed; not a forward migration).
drop function if exists public.reset_gem_skip_after_wear(uuid, uuid);
drop function if exists public.record_gem_removal(uuid, uuid, uuid, uuid[]);
drop policy if exists "gem_removal_owner_select" on public.gem_removal_events;
drop table if exists public.gem_removal_events;
alter table public.wardrobe_items drop constraint if exists wardrobe_items_gem_rested_requires_cooldown;
alter table public.wardrobe_items drop constraint if exists wardrobe_items_gem_skip_count_nonneg;
alter table public.wardrobe_items
  drop column if exists gem_rested_notified,
  drop column if exists gem_cooldown_until,
  drop column if exists gem_skip_count;
