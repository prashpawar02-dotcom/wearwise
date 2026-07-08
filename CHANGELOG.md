# WearWise — Changelog

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
