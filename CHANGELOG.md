# WearWise — Changelog

## Phase 3 hotfix 4 — Dashboard single-write recommendation contract (2026-07-10)

Local-only correctness fix (no schema/prod changes). Follow-up to the single-hero
dashboard audit: `ensureTodayDrop` could, in a TOCTOU availability race, perform
BOTH a create (missing row) AND a regeneration (stale check) in the same request.

Fix — `src/app/(app)/dashboard/page.tsx` `ensureTodayDrop`:
- A request now performs **at most one write-producing action**: exactly one
  create (missing row, `if (!rec)`) XOR one regenerate (pre-existing stale row,
  `else if`). The two are mutually exclusive branches, and an explicit
  `writeAttempted` flag + a `source: "existing" | "created" | "regenerated"`
  path variable make the contract explicit and guard against future refactors.
- Regeneration is reachable ONLY on the pre-existing-row branch — never after a
  create — so a create and a regenerate can never both run in one request.
- A **final `validateOutfitCurrent` always runs** on the selected IDs for
  existing, created, AND regenerated results (validation is never skipped for a
  freshly created row). If a created/regenerated outfit lost the create/validate
  race and is stale, the request **fails closed** to the honest constrained/retry
  state — it does NOT regenerate a second time.
- Preserved: `ignoreOptIn` bypasses only creation eligibility (no notifications);
  atomic upsert on `(user_id, local_date)` (backed by the live
  `daily_recommendations_user_date_unique` constraint); no legacy Best Pick
  fallback; exactly one Today's Drop hero; no stale/in-wash item can render.

Tests: `tests/engine/dashboard-wiring.test.ts` extended to 24 assertions (8 new
single-write guards: exactly one create + one regenerate, mutual exclusion,
`writeAttempted`, final-validation-always, created-stale-fails-closed). `tsc`
clean · ESLint clean · engine suite 182 assertions green. `next build` bundling
still can't complete inside the sandbox (webpack over the mount > shell time cap)
— verify locally.

## Phase 3 hotfix 3 — Single-hero Today dashboard (2026-07-10)

Local-only render-contract fix (no schema/prod changes). Root cause of two
divergent broken states:
- **Localhost showed two competing heroes:** the dashboard rendered the legacy
  Best Pick section UNCONDITIONALLY (`{bestPick ? <RealBestPick/> : <SampleBestPick/>}`)
  in addition to the new Today's Drop card, so a duplicate legacy card rendered
  underneath Today's Drop.
- **Production could fall back to legacy-only:** `loadTodayDrop()` only READ
  today's `daily_recommendations` row and returned `null` when none existed (it
  depended on the cron/manual prepare) and was gated on the notification opt-in;
  with no row, `DailyDropCard` was absent while the unconditional Best Pick still
  rendered — legacy-only.

Fix:
- The **dashboard now uses one authoritative Today's Drop path**: `ensureTodayDrop()`
  (get-or-create + validate). If today's row is absent it creates ONE from the
  current available wardrobe (idempotent upsert on `(user_id, local_date)`; one
  attempt per request; bypasses the notification opt-in via `prepareDailyDrop`'s
  new `ignoreOptIn`). Stale drops regenerate once from valid inventory. When no
  valid drop can be formed it shows one honest constrained state (or build-wardrobe
  onboarding) with a Retry — never the legacy Best Pick.
- The **legacy Best Pick dashboard fallback is removed**: `RealBestPick`,
  `SampleBestPick`, `buildBestPick`, the approved-`outfit_suggestions` query,
  "Best Pick Today", and "View full look & alternatives" are all gone from the
  dashboard render path. Exactly one `<DailyDropCard>` renders.
- The authenticated dashboard stays `export const dynamic = "force-dynamic"`
  (not globally cached), so laundry/swap/option/new-drop changes reflect on load.
- Different accounts may correctly receive different outfits/wardrobes/streaks/
  weather/titles — release comparison is structural, not content-identical.

Tests: new `tests/engine/dashboard-wiring.test.ts` (16 structural guards: single
`DailyDropCard`, no RealBestPick/SampleBestPick/buildBestPick, no "Best Pick
Today"/"View full look", ensureTodayDrop get-or-create with `ignoreOptIn`, stale
regenerate-once, honest constrained state, `force-dynamic`, no legacy suggestions
query). `tsc` clean · ESLint clean · engine suite 174 assertions green (incl. 16
dashboard + 19 swap-wiring). `next build` bundling still can't complete inside the
sandbox (webpack over the mount > shell time cap) — verify locally.

## Phase 3 hotfix 2 — Swap UI: slot-first flow + true button/handler separation (2026-07-10)

Local-only UI fix (no schema/prod changes). Reported: "Swap one thing" did
nothing / behaved like "Another option"; the slot-first flow wasn't visible.

Root cause (three compounding issues):
1. The **legacy Best-Pick card** (`RealBestPick`, dashboard/page.tsx) rendered
   "Swap one item" and "Another option" as `<Link>`s to `/outfits` — both just
   navigated to a full-look list, so they looked identical and never ran a real
   swap. Removed (Wear this + "View full look" remain); the Daily Drop card is
   the single, correct swap surface.
2. The **swap sheet mixed mood chips + a "New mood" full re-theme** into the
   same menu as the item chips, so it wasn't a clean slot picker and the
   full-outfit action sat inside the single-item swap sheet.
3. **"Another option" reused the swap sheet** (`initialAction="option"`).

Fix:
- **`SwapSheet.tsx` rebuilt as SLOT-FIRST, single-item ONLY.** First screen asks
  only "What do you want to swap?" ("The rest of your outfit will stay the
  same.") and shows just the slots present. No candidates/full look are fetched
  before a slot is chosen. Choosing a slot fetches replacements for that slot
  (all other items locked, shown as "Keeping …"); applying changes exactly one
  item; result row = Keep it / Try another / Put back. Mood chips, "New mood",
  and `initialAction` removed. Stale outfit → refresh + close honestly.
- **`daily-drop-card.tsx`:** "Another option" is now a completely separate
  handler (`anotherOption`) that calls only `/api/daily-drop/another-option`
  with its own loading state + message, and never opens the sheet or calls the
  single-slot route. "Swap one thing" opens the sheet only. Both triggers set
  `type="button"`; distinct `onClick`s; correct labels.

Tests: new `tests/engine/swap-wiring.test.ts` (19 structural regression checks:
slot-first sheet, no full-outfit/mood route in the sheet, separate handlers,
type=button, distinct loading state, correct labels). `tsc` clean · ESLint clean
· engine suite 158 assertions green. `next build` bundling still can't complete
inside the sandbox (webpack over the mount > shell time cap) — verify locally.

## Phase 3 hotfix — Stale-outfit render blocker + slot-first swap + explainability (2026-07-10)

Production blocker: the engine correctly excluded an `in_wash` item (engine-QA
showed `available: 9, in_wash: 1`), yet user-facing cards still rendered it, and
a legacy card showed free-generated copy ("Would complete it: A classic black
belt"). Proven root cause: **read/render paths never revalidated stored/cached
outfits against current availability**, and legacy `outfit_suggestions` copy
bypassed explainability. No schema change.

**Authoritative validator — `src/lib/outfit-validity.ts` (new, server-only).**
`validateOutfitCurrent(supabase, userId, itemIds, { ctx? })` reloads current
wardrobe rows (owner-scoped) and fails closed: `missing` (also covers other-user
via RLS), `in_wash`, `unavailable`, `archived`, and — when a ctx is passed —
`hard_filter_failed` (re-runs the hard-filter layer). Returns the still-available
rows in input order.

**Read paths repaired (never render stale).**
- Daily Drop (`dashboard/page.tsx` `loadTodayDrop`): validates the stored drop;
  if stale, **regenerates around what's clean** (`prepareDailyDrop force`) and
  re-validates; if nothing valid remains, shows an honest constrained state —
  never the dirty item. Emits `stale_outfit_blocked` / `stale_outfit_regenerated`.
- Legacy Best Pick (`buildBestPick`): skips any approved suggestion containing an
  unavailable/missing item (renders none rather than a stale look); the
  free-generated reasoning ("Why this works" paragraph, avoid tip, "Would
  complete it") is removed — the Daily Drop card's WhyThisWorks (1:1 from stored
  factors) is the canonical explanation.
- `/outfits/[requestId]`: same free copy removed; looks containing in-wash pieces
  are marked historical and never offered as today's wearable choice (Wore-this
  hidden).

**Write-time invalidation + concurrency (apply-time revalidation).**
- Laundry route: when an item leaves `available` (toggle/set_state/postwear-wash),
  best-effort regenerates today's active drop if it referenced that item (which
  also refreshes precomputed `swap_candidates` + `alt_item_ids`).
- Swap apply now revalidates the FULL resulting outfit (locked pieces included)
  at apply time — a precomputed candidate that went stale is rejected with
  `status:"stale"` and the client reloads fresh candidates. Another-Option
  validates its precomputed cache before serving (falls through to recompute).

**Slot-first Swap UX + telemetry.** The swap sheet opens on a slot picker
(Top/Bottom/Shoes/Layer/Accessory, computed server-side) before any candidate or
full look. Added `swap_sheet_opened`, `swap_slot_selected`, `stale_outfit_blocked`,
`stale_outfit_regenerated` (no duplicate firing).

**Tests / quality.** `tsc` clean · ESLint clean · engine suite green: 28 golden +
29 swap + **20 new validity/slot tests** (in_wash/unavailable/archived/missing/
hard-filter reasons, availability restore, order preservation, slot labels).
`next build` bundling was not runnable to completion inside the sandbox
(webpack over the mount exceeds the shell time cap) — verify on deploy.

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
