# WearWise — IDEAS backlog (out-of-scope work discovered during phases)

Log only. Do not build without CEO approval / the owning phase.

## Discovered during Phase 1 (Recommendation Engine v2)
- **Rewire daily-drop selection onto `recommendOutfits()`** (Phase 4 — "drop
  pre-generation wiring"). Today `daily-drop.ts` still assembles via
  `assembleOutfit()` and only *scores* the result with the engine to persist the
  factor breakdown. Phase 4 should make the engine the selector and store
  hero + backups + dual-pick from `RecommendationResult` directly.
- **Rewire swap / "another option"** (`swapCandidates`, `alternativeOutfitItems`
  in `daily-drop.ts`) onto the engine's precomputed candidate ranking (Phase 3).
- **Occasion enum vs. engine occasions.** Engine adds gym/interview/wedding_guest/
  dinner/formal_event via `occasion_profiles` (text-keyed) rather than altering
  the `occasion_type` DB enum. If Style Me (Phase 6) needs these as first-class
  request rows, decide then whether to extend the enum or keep the text mapping.
- **Auto-tagger population of new columns.** Migration 0020 backfills conservative
  defaults; the vision auto-tagger should be upgraded to populate
  formality/fabric/color_family/cultural_tag/modesty with `tag_confidence`
  (Phase 5 tag-check queue surfaces the low-confidence ones).
- **Admin QA UI.** A visual factor-breakdown panel over the
  `/api/admin/engine-qa` JSON (currently JSON only).
- **Colour-family normalisation.** `color_family` currently falls back to the raw
  `color` string; a proper colour→family mapping (reuse `colorToHex` buckets)
  would tighten the color_harmony factor.
- **Pair-cooldown store.** `pair_cooldown_days` threshold exists but pair-history
  isn't recorded yet; the learning loop (Phase 7) should add a `pair_affinity` /
  worn-pair table so the repeat penalty can act on pairs, not just items.

## Discovered during Phase 1 hotfixes (partial / missing-footwear / formality)
- **Phase 4 UI:** render a "Missing shoes in wardrobe" chip on the Today card
  and Style Me result when `outfit_status === "partial"` / `missing_slots`
  includes `footwear`, with a one-tap "add footwear" nudge.
- **Auto-tagger formality confidence:** the conservative backfill defaults
  formality to 2 for untagged tops/bottoms. Once the vision tagger populates
  real formality + `tag_confidence`, revisit whether everyday occasions should
  tighten the (now soft) formality gate for high-confidence items.
- **Belt-on-ethnic template quirk (latent, safe):** for ethnic occasions the
  accessory picker can attach a belt to a kurta/saree candidate, which
  `candidateRejection` then correctly drops (fail closed). Harmless but wasteful;
  skip belts for ethnic anchors in the accessory picker.

## Discovered during Phase 2 (Laundry / Availability)
- **Per-category learned wash-cycle (Phase 7 learning loop).** `laundry_wear_stats`
  now records per-category wears/washes (stub, counts only) and `profiles.wash_cycle_days`
  is a single global estimate. Phase 7 should derive a per-category cycle from the
  wear/wash ratio (and dry-clean class) and feed it into `readyToReturn` /
  `washCycleDaysFor` instead of the global default.
- **Canonical "Wore It" owner (Phase 4).** The post-wear sheet is wired into the
  daily-drop card and the occasion Wore-It button. When Today Screen v2 (Phase 4)
  becomes the canonical morning surface, route its Wore-It through the same
  `PostWearSheet` + `/api/wardrobe/laundry` `postwear` action (single source).
- **Archived items view (Phase 5).** `archived` state now exists and is excluded
  everywhere, but there's no dedicated "Archived" shelf/filter to browse or
  un-archive in bulk. Wardrobe v2 (Phase 5) should add one alongside the Laundry
  section (kept minimal here to honour scope).
- **Post-wear reservation awareness (Phase 6/7).** When an item disposed to "wash"
  is reserved for Tomorrow (Plan), warn gently (the Plan spec already notes a
  "reserved-item-in-wash" warning for Phase 7).
- **`laundry_marked`/`laundry_cleaned` server mirror.** Client fires the canonical
  PostHog events; if the server-side `app_events` mirror (`src/lib/events.ts`)
  should also capture laundry transitions for cohorting, wire it in the
  `/api/wardrobe/laundry` route during the Phase 7 learning-loop work.

## Phase 3 — deferred polish (logged, not built, to honour scope)

- **Hero swipe carousel for Another Option (Phase 4 polish).** §5 P3 asks for
  full-outfit alternates as a horizontal swipe on the hero. Phase 3 ships
  functional in-place alternation (New mood advances; Put back = previous),
  which is behaviourally equivalent. A dedicated swipe carousel on the Today
  hero belongs with Today Screen v2 (Phase 4), where the hero is rebuilt.
- **Per-user prefs in swap context (Phase 4).** Swap/mood validation uses the
  same context as the heuristic base outfit (`defaultContext` + weather,
  `EMPTY_PREFERENCES`) so a precomputed candidate stays valid on apply. When
  Phase 4 rewires selection onto `recommendOutfits()`, swap context should adopt
  the same per-user `EngineContext` (exclusions, modesty floor, learned prefs).
- **`swap_kept`/`another_option` cohort dashboard (Phase 7).** Server events are
  emitted (`src/lib/events.ts` mirror + PostHog). Wire the swap-kept / revert /
  cap-hit funnel into the Phase 7 telemetry dashboard.
- **Direct one-tap 👎 from the Today card.** Feedback is reachable via the swap
  sheet ("Not for me") and the cap state. A card-level overflow 👎 that opens
  the sheet straight to the feedback view is a small nicety for Phase 4's
  card rebuild (kept out of chrome now to respect §4.5 no-emoji-in-chrome).

## Phase 3 hotfix — RESOLVED (2026-07-10, not deferred)

- **Stale-outfit render blocker: RESOLVED.** In-wash / unavailable / archived /
  deleted items can no longer render on any surface. New server-only validator
  `src/lib/outfit-validity.ts` gates every read/apply path (daily drop regenerates
  on stale; legacy best-pick + /outfits validate; swap/another-option revalidate
  at apply time; laundry writes invalidate the active drop). Legacy free-generated
  copy ("Would complete it: …") removed from Phase-3 surfaces.
- **Follow-up (Phase 4, low priority):** the legacy `/outfits/[requestId]` multi-
  look list stays as full-alternatives-for-reference; convert to the final
  horizontal hero carousel when Today Screen v2 rebuilds the hero.
