# WearWise — Changelog

## Phase 3 — Swap One Item · Another Option · Why This Works (2026-07-10)

The trust features. The outfit the user liked stays; only what they asked
changes; every outfit explains itself. Swaps move from Pro-gated to **free with
caps** (handbook §5 P3, the decided model), and every swap is lock-and-replace:
the rest of the look is contractually stable.

**Schema — migration `0022_swap_trust.sql` (+ down), applied to the `wearwise`
project (additive, reversible).**

- `daily_recommendations`: `swap_candidates` (precomputed top-5 per slot, IDs
  only), `base_item_ids` (pristine generated outfit), `pre_swap_item_ids`
  (exact pre-swap snapshot for undo), `swaps_used` / `options_used` cap counters
  (non-negative CHECKs). A fresh/re-prepared drop resets counters + undo.
- New `drop_feedback` table (👎 + one optional reason chip: too_formal /
  not_my_style / uncomfortable / weather / repeat), owner-insert + owner/admin
  read RLS. Corrections are append-only and **always free**.

**Engine (pure, tested).**

- `src/lib/engine/swap.ts` — lock-and-replace: swapping one item locks every
  other slot + occasion + formality window + colour theme; candidates must pass
  ALL hard filters against the locked items (fail closed) and are ranked by
  `outfit_score`, top-5. Layer/Accessory swaps resolve to "none — this outfit is
  complete" as a first-class result; core slots return a specific, actionable
  no-candidate message (never silently relaxes a filter). `moodSwap` changes the
  minimum items (1, max 2, fewest-changes-first) toward More formal / casual /
  comfortable / modest / Weather-safer. Every replacement's one-line reason is
  drawn 1:1 from a real scoring factor of the resulting outfit.
- `src/lib/swap-caps.ts` — decided caps: 3 swaps/day, 2 options/drop; first 3
  sessions cap-exempt. Confidence-framed cap copy verbatim from §5 P3 **with the
  Pro line omitted** (TODO hook `PRO_UPSELL_LINE` + `capMessage({ includePro })`
  for Phase 8).
- Generation precomputes top-5 candidates per outfit piece (`swap_candidates`)
  so a swap renders < 1s p75.

**API (cap-gated, server-authoritative, telemetry).**

- `POST /api/daily-drop/swap` reworked from Pro-gate to cap-gate; validates the
  replacement against the precompute (or re-derives), snapshots the pre-swap
  outfit, re-explains, counts the swap. `POST /mood-swap`, `POST /put-back`
  (undo; no cap refund), `POST /feedback` (always free) added.
  `POST /another-option` cap-gated (2/drop) with cache-first alternates.
  `GET /swap-candidates` returns lock-and-replace candidates + reasons + slot +
  cap. Events: `swap_requested`/`swap_kept`/`swap_reverted`, `another_option`,
  `cap_hit_swap`/`cap_hit_option`, `feedback_negative(reason)`, `why_expanded`.

**UI.**

- `SwapSheet` bottom sheet: item chips + mood chips + separated "New mood";
  result row **[Keep it] [Try another] [Put back]**; specific no-candidate + cap
  states; "Not for me" feedback with soft ack ("Noted — tomorrow gets sharper").
- `WhyThisWorks` collapsible chip on the Today card, rendered 1:1 from stored
  scoring factors. Today card's Swap / Show-another now open the sheet.

**Tests / quality.** `tsc` clean · ESLint clean · 29 new pure unit tests
(`tests/engine/swap.test.ts`) green alongside the existing 28 (golden +
laundry): cap counting incl. session exemption, unlocked-slot immutability,
undo integrity, explanation-factor 1:1 mapping, completion + mood-min-change.

## Phase 2 — Laundry / Availability System (2026-07-09)

The app now always knows what's clean, with zero nagging. Availability is a hard
filter everywhere (already true in the engine); Phase 2 makes the whole loop
around it real: a state machine, a quiet post-wear flow, a laundry basket, a soft
auto-return nudge, and honest constrained-inventory copy.

**Schema — migration `0021_laundry_availability.sql` (+ down), applied to the
`wearwise` project (additive, reversible).**

- `wardrobe_items.availability_status` CHECK widened to add `archived` (legacy
  `unavailable` kept). `in_wash_since` reconciled with status; partial index on
  `(user_id, in_wash_since)` for fast auto-return scans.
- `profiles`: `postwear_sheet_enabled`, `postwear_prompt_dismissals`,
  `wash_cycle_days` (default 4), `laundry_return_prompt_at`, `laundry_wash_note_at`.
- New `laundry_wear_stats` table (per-category wear/wash counters — learning
  stub, counts only) with owner-only RLS (select/insert/update/delete). Supabase
  security advisor confirms RLS enabled + policies present, no new lints.

**Engine + logic (pure, tested).**

- `src/lib/laundry.ts` — state transitions that keep `in_wash_since` honest
  (`toInWash`/`toAvailable`/`toArchived`/`toggleWashTransition`), post-wear smart
  defaults (`washDisposition`), wash-cycle estimate (`washCycleDaysFor`: 4d
  default, 14d dry-clean), soft auto-return (`readyToReturn`/`countReadyToReturn`),
  and the constrained-inventory honesty note (`constrainedInventoryNote`).
- `recommendOutfits` now returns `constrainedNote` on its result payload,
  computed from the full wardrobe (incl. in_wash). Availability filter confirmed
  as the single gate for drop, backups, Style Me, and swap candidates.

**Surfaces (each ships empty/loading/error states + telemetry).**

- `Sheet` bottom-sheet primitive (grabber, blur, 220ms spring, reduced-motion,
  Esc/scroll-lock) + global `prefers-reduced-motion` guard in `globals.css`.
- `PostWearSheet` — after "Wore It", per-item Wardrobe/Wash chips pre-answered
  with smart defaults (≤2 taps: one "Done"), bulk apply, and "Ask me less"
  (silences the sheet after 3, re-enable in You). Wired into the daily drop card
  and the occasion Wore-It button.
- Wardrobe: dedicated **Laundry basket** section (thumbnails, "in wash · Nd"
  badges, count header, multi-select "Laundry done", positive empty state:
  "Nothing in the wash. Everything's ready to wear."), a quiet **auto-return**
  badge (throttled, never a push), item-card one-tap toggle, and an item-detail
  availability control (available / in wash / archived).
- Drop reasoning gains the constrained-inventory line when >60% of an
  occasion-critical category is in the wash — once per wash-cycle, no push.

**Server.** Single write path `/api/wardrobe/laundry` (toggle, set_state,
bulk_clean, postwear, ask_me_less, dismiss_return_prompt, set_postwear_enabled) —
keeps `in_wash_since` honest, updates the learning stub, enforces the "ask me
less" + throttle preferences. Owner-scoped via RLS.

**Telemetry.** `laundry_marked`, `laundry_cleaned`, `postwear_sheet_shown`,
`postwear_sheet_completed`, `postwear_sheet_dismissed`, `ask_me_less_activated`
(+ `postwear_pref_changed`).

**Tests / gates.** New `tests/engine/laundry.test.ts` (28 assertions): in_wash
/archived/unavailable never surface via `eligiblePool` or `recommendOutfits`
(drop/backups/Style Me path); `isWearable` predicate (shared by swap); transitions
set/clear `in_wash_since`; auto-return timing (4d vs 14d dry-clean); smart
defaults; constrained note presence/absence + engine payload. Runner extended to
execute all `tests/engine/*.test.js`. `tsc` clean · `next lint` clean · engine
suite 62 + laundry 28 = 90 green.


## Phase 1 hotfix 2 — Everyday formality window + normalization diagnostics (2026-07-08)

Fixes a production report where `/api/admin/engine-qa?occasion=work` returned
`hero: null` (`afterAvailability: 3`, `candidatesBuilt: 0`) for a real 10-item
work wardrobe: 4 Top, 3 Bottom, 3 Kurta, 0 Footwear, all `availability_status =
'available'`.

**Root cause — not column normalization.** The engine already reads
`availability_status`, `category` ("Top"/"Bottom"/"Kurta", case-insensitive),
`user_facing_name`, and `sub_category` correctly. The conservative tag backfill
(migration 0020) assigns `formality = 2` to untagged tops/bottoms, and the
formality-window HARD filter for `work` (floor 3) excluded all of them — leaving
only the 3 backfilled kurtas (`formality = 3`, `cultural_tag = 'indian_ethnic'`),
which then had no bottom to pair with. Hence `afterAvailability: 3` / `hero: null`.

**Fix** (`src/lib/engine/filters.ts`): formality is a hard gate ONLY for
reputation occasions (interview / wedding_guest / formal_event, floor ≥ 4) —
these stay strict (unknown excluded; interview stays all-items ≥ 4). For everyday
occasions (work / casual / dinner / ethnic / festive) formality is a SOFT ranking
signal (scoring), with a ceiling guard so a too-formal piece can't be forced into
a lower-key occasion. No weather / cultural / availability rule relaxed; footwear
never fabricated.

Result for the reported wardrobe: `afterAvailability: 10`,
`partialCandidatesBuilt/Valid: 21`, `outfit_status: "partial"`, `missing_slots:
["footwear"]`, `partial_reason: "no_footwear_in_wardrobe"`, `fail_reason:
"partial_missing_footwear"`, `hero != null`.

Admin QA route (`/api/admin/engine-qa`) gains normalization diagnostics:
`categoryCountsRaw`, `categoryCountsAfterAvailability`, `availabilityStatusCounts`,
`eligiblePoolSize`, `rejectionCounts` (per hard filter), `normalizedItemsSample`.

Tests: +15 golden assertions (DB-shaped rows normalize; category→role mapping;
10-item no-footwear wardrobe → partial; null color_family/fabric don't block;
in_wash still excluded). **62/62 green.** No schema/migration change.

## Phase 1 hotfix — Partial outfit when footwear is missing (2026-07-08)

Constraint-based no-result states shouldn't be dead ends. When a valid garment
pairing exists but the wardrobe has no usable footwear, the engine returns a
**partial** outfit instead of `hero: null`.

- `engine/types.ts`: `OutfitCompleteness` (`"complete" | "partial"`),
  `MissingSlot`, `PartialReason`; `ScoredOutfit` gains `completeness`,
  `missingSlots`, `partialReason`; `RecommendationResult` gains `outfitStatus`,
  `missingSlots`, `partialReason`; diagnostics gain `partialCandidatesBuilt/Valid`.
- `recommend.ts`: tries COMPLETE outfits first (unchanged when any exist); only
  if none exist falls back to partial garment-only outfits — confidence capped
  **≤ 0.45**, `missing_slots: ["footwear"]`, honest note ("Top and bottom are
  ready. I do not have shoes in your wardrobe yet, so choose your own footwear."),
  `fail_reason: "partial_missing_footwear"`. No hard rule relaxed; footwear never
  fabricated; no accessory added to feel complete.
- Admin QA surfaces `outfit_status` / `missing_slots` / `partial_reason`.
- Tests: +23 golden assertions. No schema/migration change.

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
