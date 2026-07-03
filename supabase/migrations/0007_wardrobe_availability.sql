-- =====================================================================
-- WearWise — Migration 0007: wardrobe item availability (Laundry V1)
-- Run in the Supabase SQL editor. Additive only, non-breaking.
--
-- Purpose: let a user mark an item's availability so outfit generation can
-- skip clothes that are in the wash or otherwise unavailable, without deleting
-- them from the wardrobe.
--
-- Smallest safe change: ONE text column with a CHECK constraint (not a new
-- table, not a new enum type — text+check is easy to extend later). Existing
-- rows default to 'available', so nothing changes for current data.
--
-- Security: no RLS change needed. The existing "wardrobe_owner_all" policy
-- (for all using user_id = auth.uid()) already governs updates to this column,
-- so a user can only change availability on their own items.
-- =====================================================================

alter table public.wardrobe_items
  add column if not exists availability_status text not null default 'available';

do $$ begin
  alter table public.wardrobe_items
    add constraint wardrobe_items_availability_status_check
    check (availability_status in ('available', 'in_wash', 'unavailable'));
exception when duplicate_object then null; end $$;

create index if not exists wardrobe_items_availability_idx
  on public.wardrobe_items(availability_status);
