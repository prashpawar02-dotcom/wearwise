-- =====================================================================
-- WearWise — Migration 0025: Onboarding v2 (resume state + default occasion)
-- Run in the Supabase SQL editor. Additive only (2 nullable columns, no
-- schema shape changes, no RLS changes). Reversible
-- (see supabase/rollbacks/0025_onboarding_v2_down.sql).
--
-- WHY THIS MIGRATION EXISTS (ground truth checked before writing it, not
-- assumed):
--
--   The existing `profiles.onboarded boolean` (0001) can represent exactly
--   two states: "not done" and "done". Phase 4D's required state model has
--   six: new / in_progress / wardrobe_incomplete / ready / completed /
--   error. Four of those six do NOT need new storage:
--     - `completed`   = `onboarded = true` (unchanged, still the single
--                       authoritative gate every existing redirect in
--                       dashboard/page.tsx, plan/page.tsx, profile/page.tsx
--                       already checks — none of those three files change).
--     - `wardrobe_incomplete` / `ready` are computed LIVE from
--       wardrobe_items at read time (tops/bottoms/footwear presence +
--       count) — wardrobe composition can change between visits, so
--       persisting a snapshot would go stale; the live table is always the
--       correct source of truth. No column needed.
--     - `error` is a transient request/save failure, never something a
--       user "resumes into" — it's retried, not stored. No column needed.
--
--   That leaves exactly ONE genuine gap: distinguishing `new` from
--   `in_progress`, and knowing WHICH step to resume at, without losing or
--   re-asking answers. This is not fully derivable from existing columns:
--   the style-preferences step is explicitly skippable (per the product
--   requirement — "Allow skip. Do not present fake precision."), so an
--   empty `style_preferences` array is genuinely ambiguous between "user
--   skipped this step" and "user never reached this step yet" — the two
--   need different resume behavior (skipped => move on; never-reached =>
--   show it). `onboarding_step` resolves exactly that ambiguity and
--   nothing else.
--
-- `default_occasion` is a second, separate, genuine gap: the Required
-- onboarding outcome explicitly includes "a selected default occasion/
-- context", and no existing column stores one. Real, already-wired use:
-- src/app/(app)/occasion/new/occasion-form.tsx's `submitDefault()` (the
-- "Use today's default" button) currently falls back to a hardcoded
-- weekday/weekend heuristic ("work on weekdays, casual on weekends") with
-- no per-user signal at all. This migration lets that button prefer the
-- user's own stated default when set, with the exact same honest
-- weekday/weekend fallback preserved for anyone who skips or never set one
-- (this migration does not change occasion-form.tsx itself; a separate,
-- non-schema code change wires the read).
--
-- Explicitly NOT added, and why (ground-truth checked, not assumed):
--   - No gender column: grep-confirmed absent from schema and never read
--     by src/lib/engine/**. Not added.
--   - age_range is NOT extended or newly required here: grep-confirmed it
--     is read nowhere under src/lib/engine/** — it is stored and DISPLAYED
--     only (existing onboarding-form.tsx). Onboarding v2 stops ASKING for
--     it (see the code-level change), but the column itself is left alone
--     — dropping it would be destructive schema surgery for a UI-only
--     change and is out of scope for an additive Phase 4D pass.
-- =====================================================================

alter table public.profiles
  add column if not exists onboarding_step text,     -- null | 'welcome' | 'context' | 'style' | 'wardrobe' | 'ready' | 'completed'
  add column if not exists default_occasion text;     -- one of occasion-form.tsx's STYLE_OCCASIONS keys (e.g. 'work','casual','college',...); null = not set

-- Guard onboarding_step to a known, closed set of resume checkpoints so a
-- typo or a future stray value can never produce an unresumable state.
do $$ begin
  alter table public.profiles
    add constraint profiles_onboarding_step_check
    check (
      onboarding_step is null
      or onboarding_step in ('welcome', 'context', 'style', 'wardrobe', 'ready', 'completed')
    );
exception when duplicate_object then null; end $$;

-- default_occasion is intentionally NOT constrained to a DB enum/check —
-- its valid value set lives in occasion-form.tsx's STYLE_OCCASIONS (a
-- UI-layer list, already unconstrained by the DB for the same reason
-- outfit_requests.occasion accepts free values beyond the enum's own
-- labels via `tag`). A stored value that no longer matches a current
-- STYLE_OCCASIONS key simply fails a lookup at read time and the code
-- falls back to the existing weekday/weekend heuristic — fails soft, never
-- breaks the button.

-- No RLS policy change: the existing "profiles_update_own" policy (0001)
-- already governs ALL columns on a user's own profiles row (`for update
-- using (id = auth.uid())`), a pattern already relied on unmodified by
-- every prior additive profiles migration (0008, 0020, 0021). Verified,
-- not assumed: RLS is enabled on public.profiles (0001) and no
-- column-level privilege exists in Postgres/Supabase RLS to need a
-- separate grant here — migration 0024's table-level GRANT already covers
-- SELECT/INSERT/UPDATE on this table for `authenticated`.
