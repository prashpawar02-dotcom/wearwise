-- =====================================================================
-- WearWise — Migration 0003: add "Dinner/date" occasion
-- Run in the Supabase SQL editor. Additive only; RLS unchanged.
-- (ALTER TYPE ADD VALUE runs as its own statement — do not wrap in a txn.)
-- =====================================================================
alter type occasion_type add value if not exists 'dinner_date';
