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
