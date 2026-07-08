# WearWise — Changelog

## Phase 1 hotfix — Partial outfit when footwear is missing (2026-07-08)

Constraint-based no-result states shouldn't be dead ends. When a valid garment
pairing exists but the wardrobe has **no usable footwear**, the engine now
returns a **partial** outfit instead of `hero: null`.

- New completeness concept in `engine/types.ts`: `OutfitCompleteness`
  (`"complete" | "partial"`), `MissingSlot`, `PartialReason`. `ScoredOutfit`
  gains `completeness`, `missingSlots`, `partialReason`; `RecommendationResult`
  gains `outfitStatus`, `missingSlots`, `partialReason`; diagnostics gain
  `partialCandidatesBuilt` / `partialCandidatesValid` / `missingSlots` /
  `partialReason`.
- `recommend.ts`: tries **complete** outfits first (unchanged behaviour when
  any exist); only if none exist does it fall back to partial garment-only
  outfits. Partial outfits are truthfully capped at **confidence ≤ 0.45**, carry
  `missing_slots: ["footwear"]`, an honest note ("Top and bottom are ready. I do
  not have shoes in your wardrobe yet, so choose your own footwear."), and
  `fail_reason: "partial_missing_footwear"` (not `no_valid_outfit`).
  `partialReason` is `no_footwear_in_wardrobe` (none owned) vs
  `no_available_footwear` (owned but all in-wash/unavailable).
- **No hard rule relaxed**: partial candidates still pass every filter — never
  in-wash/unavailable, weather-blocked fabric, culturally illegal pairing
  (belt-over-kurta, dupatta-on-western), one-piece + separate bottom. Footwear
  is never fabricated and no accessory is added to feel complete. If the
  garments themselves fail (e.g. no valid top+bottom), it still returns
  `hero: null` with a helpful reason.
- Admin QA route surfaces `outfit_status`, `missing_slots`, `partial_reason`
  and the partial diagnostics/counts per outfit.
- Tests: +23 golden assertions (partial returns hero; missing_slots + partial
  status; no fabricated footwear; partial still blocks in-wash / weather /
  cultural; no-pairing still null; footwear-present stays complete). 47/47 green.
- No schema/migration changes.

## Phase 1 — Recommendation Engine v2 + Schema (2026-07-07)

The generic outfit generator is replaced by a deterministic, rules-gated,
explainable pipeline: **HARD FILTERS → SCORING → RANK & EXPLAIN**. Every
engine-produced outfit now passes eight ordered, fail-closed filters and is
scored from a runtime-tunable weight table before it can be shown.

### Schema (migration 0020, reversible)
- Extended `wardrobe_items` with structured attributes: `color_family`,
  `pattern_boldness`, `fabric`, `sleeve_length`, `fit`, `formality` (1–5),
  `warmth`, `min_temp_c`/`max_temp_c`, `weather_tags`, `cultural_tag`,
  `modesty_level`, `layering_role`, `accessory_role`, `footwear_formality`,
  `footwear_weather`, `set_id` + `set_required_components`, `in_wash_since`,
  `avoid_with`, `tag_confidence` (jsonb), `photo_quality_flag`, with range
  CHECK constraints.
- Safe backfill for existing rows: conservative defaults; **never** auto-assigns
  `formality > 3`; unknown `cultural_tag` stays NULL and such ethnic-looking
  items are held back from auto-recommendation until confirmed.
- New global reference tables (RLS: all authenticated read, admin write):
  `engine_config` (scoring/penalty weights, thresholds, colour rules),
  `occasion_profiles` (formality window, piece caps, comfort multiplier,
  accessory policy — includes gym & interview without an enum migration),
  `ethnic_pairing_rules` (cultural legality as **data rows**, seeded with
  belt/kurta, dupatta/western, lehenga/choli, saree/belt).
- `profiles` gains absolute-exclusion columns (`excluded_colors/categories/footwear`).
- `daily_recommendations` gains `confidence`, `factor_breakdown` (jsonb),
  `is_dual_pick`, `engine_version`.
- Rollback: `supabase/migrations/0020_engine_v2_schema_down.sql`.

### Engine (`src/lib/engine/*`, pure & dependency-free)
- `filters.ts` — ordered fail-closed hard filters: availability · weather/fabric ·
  formality window (occasion window) · cultural pairing legality (rule table) ·
  modesty floor · user absolute exclusions · structure completeness ·
  piece-count cap by occasion.
- `scoring.ts` — weighted sum of color_harmony, formality_coherence, occasion_fit,
  comfort, user_style_alignment, novelty; minus repeat, weather_soft, pattern_risk,
  accessory_irrelevance penalties. Every factor persists its raw value, weight and
  signed contribution.
- `guards.ts` — `AccessoryRelevanceGuard` (default = no accessory; needs a
  justification), `DupattaLayerGuard`, `PatternClashGuard`, `ShoeCompatibilityGuard`.
- `templates.ts` — structure templates incl. ethnic sets (set integrity is a
  filter) and gym/activewear (formality bypassed, comfort ×2, no accessories,
  footwear allowed).
- `recommend.ts` — pipeline returning hero + 2 backups + confidence; dual-pick
  honest mode below threshold; never fabricates an outfit (null + reason).
- `config.ts` defaults mirror the migration seeds; `loadContext.ts` hydrates
  from the DB and falls back to defaults gracefully.

### Wiring & enforcement
- `outfitValidation.ts` (the fail-closed **3-place** gate — AI generation, admin
  curation UI, server approve API) extended with the cultural hard rules
  (belt-over-kurta/saree, dupatta-without-ethnic-anchor). Pattern **extended, not
  bypassed**.
- `engineOutfits()` now delegates to the v2 pipeline, so the occasion and
  analysis generate routes transparently use it.
- Daily-drop prepare scores its selected outfit and **stores** the factor
  breakdown + confidence + dual-pick flag (selection logic unchanged; Phase 4
  rewires selection itself).
- Optional admin QA route `GET /api/admin/engine-qa` returns per-outfit factor
  breakdowns + diagnostics.

### Tests & quality
- 24 golden assertions (`tests/engine/golden.test.ts`), all green: belt+kurta
  blocked; dupatta never on western; wool blocked ≥30 °C; in-wash never emitted;
  interview all items formality ≥4; gym activewear-only; one-piece never with a
  separate bottom; 10-item wardrobe → hero + 2 backups; 60-item wardrobe scored
  under the 800 ms budget.
- Runner `scripts/run-engine-tests.mjs` (`npm run test:engine`) compiles the pure
  engine subset with `tsc` and runs esbuild-free (works in the CI sandbox); on
  Windows use `npx tsx tests/engine/golden.test.ts`.
- `tsc --noEmit` clean · ESLint clean on all new/touched files.
