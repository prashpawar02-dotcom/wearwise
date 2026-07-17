# WearWise — Authoritative Recommendation Pipeline

**Status: Approved architecture — implementation in progress, not production-verified.**

This proposal is the reference spec for the Phase 4 recommendation-consistency hotfix.
It is NOT a record that the defect is fixed. Do not treat any behaviour here as verified
until the local transition matrix and required tests pass on localhost.

## Root cause (proven in Stage 1 ground-truth audit)

WearWise ran **two** recommendation authorities plus **four** garment-role classifiers:

- Today generation used `daily-drop.ts` `assembleOutfit()` / `roleForItem()` (regex, category
  not prioritised, no cultural/formality gates).
- Admin QA, Swap, Another Option and read-time validity used the deterministic v2 engine
  (`engine/*`, `engineRole`, category-first, cultural + formality + weather gates).
- `outfitValidation.roleForItem` and `onboarding.computeWardrobeReadiness` added two more tables.
- Two context builders: `defaultContext` (swap/option, no per-user prefs) vs `loadEngineContext`.

**Defect B (footwear contradiction):** a stored partial [top+bottom] was generated *before*
footwear was uploaded (proven: shoes created 43s after the recommendation), and nothing
re-evaluated Today because freshness only fired when a *selected* item became unavailable.
The card then rendered a hardcoded "Missing shoes — none were available today", which was false —
the user owned two available, tagged `Footwear` rows.

**Defect A (same-slot / constrained):** Another Option's `alternativeOutfitItems` avoids *every*
current item (including shoes), and `assembleOutfit` treats footwear as optional, so it can strand
a shoeless 2-item outfit; multiple writers never reconverge on one availability-revalidated result.
Exact localhost data cause remains a mandatory transition test (local DB was not accessible in Stage 1).

## Approved direction

Adopt the deterministic v2 engine (`recommendOutfits` / `engineRole` / `eligiblePool` /
`candidateRejection`) as the single authority for Today generation, stale regeneration, Admin QA,
Another Option, Swap, mood swap, put-back, and partial/missing-slot diagnostics. Remove the
Today-only selection logic. Shared helpers are fine; duplicate rule tables are not.

## Locked decisions (authoritative)

1. **Cultural categories** — trust only structured `Kurta`/`Saree`/`Dupatta` to derive an effective
   cultural role when `cultural_tag` is null, recording `cultural_source="explicit_category"`. Never
   write/backfill `cultural_tag`. Do not add Lehenga/Sherwani/Ethnic-Bottom categories in this hotfix.
   Generic Top/Bottom/Dress whose *name* merely looks ethnic stay fail-closed `cultural_unconfirmed`.
2. **One role classifier** — `engineRole` is the sole classifier. `validateOutfitItems` keeps its
   structural rules but sources roles from `engineRole` (no private keyword table). Onboarding
   readiness, Today slot labels, and every recommendation path use `engineRole`. Display-only closet
   zoning may remain separate only where it never affects eligibility.
3. **Today occasion** — use `profile.default_occasion` when present and supported; else `traditional`
   context → `ethnic`, otherwise the current `daily`→`casual` fallback. Do NOT widen the casual
   formality profile. Record real formality/occasion rejection reasons in dev diagnostics.
4. **Canonical context** — all recommendation surfaces use the shared authenticated context loader
   (`loadEngineContext`). No writer scores/explains with a weaker context than Admin QA.
5. **Freshness** — canonical inventory fingerprint: stable hash over sorted wardrobe rows of
   eligibility-affecting fields only (`id, availability_status, category, sub_category, cultural_tag,
   formality, ai_tag_status, occasion_tags`, plus set membership). Exclude image path, last_worn_at,
   laundry notes, display copy. Policy: (A) selected item invalid → regenerate once; (B) stored
   partial/constrained/failed AND fingerprint changed → regenerate once; (C) complete + all selected
   valid → never churn on unrelated additions; (D) explicit actions may create a new recommendation.
   Covers every slot; no footwear special-case.
6. **No permanent legacy flag** — cutover on the branch; no long-lived flag keeping two authorities.
   Rollback = git revert + reversible migration. A dev-only comparison utility may exist temporarily
   and must be removed before completion.
7. **Engine-owned metadata** — fresh generation uses the engine's `outfit_status`, `missing_slots`,
   `partial_reason`, `confidence`, `factor_breakdown`, explanations, diagnostics as-is. For mutations,
   one engine-level `evaluateSelectedOutfit(items, ctx, inventory)` recomputes the same values. The
   persistence layer stores evaluated output; it must not independently decide partial reasons. No
   second partial-reason engine.
8. **Shared writer contract** — every writer of `daily_recommendations` (initial prep, dashboard
   get-or-create, stale regen, cron, Another Option, Swap, mood swap, put-back, laundry regen, and any
   route changing `selected_item_ids`) goes through the shared persistence contract, always writing
   matching `outfit_status`, `missing_slots`, `partial_reason`, `confidence`, `factor_breakdown`,
   reasoning, `engine_version`, `inventory_fingerprint`, `updated_at`. Feedback-only updates excepted.
9. **Another Option** — excludes only the exact current combination, never blacklists each item.
   Valid alternates include reusing Bottom B and Shoes C. Prefer complete before partial.
10. **Schema** — `supabase/migrations/0026_recommendation_authority.sql` +
    `supabase/rollbacks/0026_recommendation_authority_down.sql`. Add `outfit_status`, `missing_slots`,
    `partial_reason`, `inventory_fingerprint`; reuse confidence/factor_breakdown/is_dual_pick/
    engine_version/selected_item_ids/base_item_ids. CHECK constraint on `outfit_status`. Null/unknown
    authority metadata regenerates once. Do not apply to hosted Supabase.
11. **Honest partial copy** — UI renders persisted reason codes. Remove "Missing shoes — none were
    available today". Say no footwear is available only when diagnostics prove it. Distinct copy for:
    none owned / in wash / unavailable / archived / incomplete tagging / occasion-formality mismatch /
    genuinely constrained core. No raw diagnostics to users.
12. **Hosted parity** — do not touch hosted Supabase. Before release, report hosted ledger + schema
    status for 0020, 0023, 0024, 0025, proposed 0026. Prepare a separate production reconciliation plan.

## Implementation sequence

1. Shared classification/context utilities → 2. Evaluator + persistence contract →
3. Today generation → 4. Stale regeneration → 5. Another Option → 6. Swap/mood/put-back →
7. Onboarding readiness + slot labels → 8. Migration 0026 → 9. Persisted reason codes in UI →
10. Diagnostics → 11. Remove legacy classifier/assembler → 12. Repo-wide duplicate-authority audit.

## Verification (localhost — user-run where sandbox cannot)

`npx supabase@latest db reset`, `npm run test:engine`, `npm run test:atomic-wear:local`,
`npx tsc --noEmit`, `npm run lint`, `npm run build`, then the manual transition matrix A–F and
Today/Admin-QA diagnostics parity. Completion is NOT claimed from unit tests alone.
