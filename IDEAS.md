# WearWise — IDEAS backlog (out-of-scope work discovered during phases)

Log only. Do not build without CEO approval / the owning phase.

## Discovered during Phase 4B (Today v2)

- **Wardrobe item-count + recent-requests removed from Today.** The old
  dashboard showed a "quick stats" grid (item count, recent Style Me
  requests) and a "Recent requests" list. Phase 4B's required hierarchy is
  exactly 8 items and explicitly bans "full wardrobe analytics on the Today
  screen," so both were removed rather than fit into the new layout. Belongs
  on Wardrobe (§6.2, Phase 5 insight cards) and/or Style Me (§6.3, Phase 6)
  instead — not lost, just relocated when those tabs are built.
- **Page-level quiet-gem/weekly-worn "Daily insight" removed, consolidated
  to `drop.dailyInsight`.** The old Today had TWO insight sources: a
  page-level `buildDailyInsight()` (wardrobe-wide quiet-gem/weekly-worn stat)
  and the per-drop `daily_insight` column (engine-grounded, tied to today's
  actual outfit). Required hierarchy item 7 is ONE compact insight, so we
  kept the per-drop one (more honestly "grounded in engine factors" per the
  state-B requirement) and dropped the wardrobe-wide one. The quiet-gems
  stat itself is real, still computed by `buildInsight()` inside
  `daily-drop.ts`, and stays that way — it's the Wardrobe (§6.2) "quiet gems"
  insight card, not a Today concern.
- **"Legacy" trust-signal paragraph removed from the hero card.** The old
  card rendered a 3-line plain-text block (weather line, repeat-safe line,
  "Uses available clothes only") that was NOT engine-grounded (handbook
  §3.5 explicitly requires Why This Works to be scoring-factor-derived, never
  free text). Removed the rendered paragraph; kept the underlying
  `repeatStatus` computation only for the pre-existing
  `daily_drop_trust_signals_viewed` telemetry (no behavior change to
  analytics, just to the screen). If repeat-safe status is wanted back as a
  UI signal, it should be a short chip on the hero card, not a paragraph —
  worth a design pass in Phase 5/6, not re-added ad hoc.
- **Occasion chip in the context strip is display-only.** Handbook §6.1 says
  "occasion chip top-right, tappable to switch." Phase 4B's explicit context-
  strip spec only asked for date/weather/occasion to be shown, not
  interactive switching — building tap-to-switch would mean designing what
  switching actually regenerates (today's drop? a preview? does it write?),
  which is real scope. Logged for Phase 6 (Style Me/Plan work) or a
  dedicated Today follow-up, not built here.
- **Numeric confidence not surfaced.** `DailyDropView.confidence` is now
  passed through from the engine but intentionally never rendered as a raw
  number (per copy rules — no fake-precision claims). Only the boolean
  `isDualPick` drives one honest caption. A richer low-confidence treatment
  (side-by-side dual-pick cards, per handbook §5 Phase 4 "low-confidence
  dual-pick honest mode") is explicitly listed as OUT of 4B's scope in the
  CEO's brief and was not built.
- **RTL/DOM click-level tests still deferred.** Same sandbox limitation
  noted after Phase 3 (npm registry blocked, can't install jsdom/RTL). All
  Phase 4B test coverage (`tests/engine/today-v2.test.ts`) is structural
  source-assertion, same pattern as swap-wiring/dashboard-wiring. Real click
  tests (tap "Wear this", assert exactly one hero renders in the DOM, assert
  the skeleton swaps in without layout shift) need a DOM test runner not
  available in this sandbox.
- **`next build` cannot complete inside the sandbox.** Confirmed again this
  session (build was still running after 42s, exceeding the tool's call
  budget). Consistent with the Local-First Phase Gate note in the handbook
  addendum — production build and manual localhost verification remain the
  CEO's local steps before this phase can be considered closed.


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

## Phase 3 hotfix 2 — RESOLVED (2026-07-10, not an idea)

The slot-first swap sheet, the separate "Another option" handler, and removal of
the legacy Best-Pick duplicate controls are DONE and locked by 19 wiring
assertions (`tests/engine/swap-wiring.test.ts`). This is not a backlog item.

### Genuinely deferred polish (test tooling)
- **React Testing Library + jsdom for click-level UI tests.** The current wiring
  guards are structural (source assertions). Real click tests — tap "Swap one
  thing" and assert the sheet opens; assert no candidate fetch before a slot is
  chosen; assert "Another option" hits only the full-outfit route — need RTL + a
  DOM runner, which this sandbox can't install (npm registry blocked). Add when
  the local/CI test environment supports it, then upgrade the structural guards
  to true DOM click tests.

## Phase 3 hotfix 3 — RESOLVED (2026-07-10, not an idea)

Single-hero Today dashboard is DONE (legacy Best Pick render path removed;
`ensureTodayDrop` get-or-create replaces the cron-dependent read + legacy
fallback), locked by 16 dashboard-wiring assertions. Not a backlog item.

## Discovered during Phase 4C (Wore It flow)

### Genuinely deferred polish (test tooling)
- **WearConfirmSheet's state machine (idle → submitting → ok/already/stale/
  error) is verified structurally** (`tests/engine/postwear-wiring.test.ts`),
  same limitation as the existing RTL/jsdom note under Phase 3 hotfix 2 — no
  DOM runner available in this sandbox. Real click-level tests (tap Confirm,
  mock a stale response, assert the Refresh button appears and a second tap
  calls `router.refresh()` without a second POST) should be added once
  RTL + jsdom are installable locally/CI, replacing/augmenting the source
  assertions.

## Discovered during Phase 4C hotfix (Atomic Wear Confirmation) — RELEASE GATING, not a backlog nicety

- **Real database concurrency/rollback integration test is REQUIRED before
  migration 0023 ships, and was NOT run this session.** This sandbox has no
  `postgres`/`docker`/`supabase` binary and no package-install permission
  (confirmed via a direct `apt-get install` attempt — permission denied).
  The only reachable Supabase project is via the connected MCP, whose
  production/dev status could not be verified from this session, so it was
  deliberately left untouched (migration 0023 was not applied anywhere).
  Before release, run against a real local or disposable dev Supabase/
  Postgres instance:
  1. Apply `supabase/migrations/0023_atomic_wear_confirmation.sql`.
  2. Fire two concurrent `confirm_daily_drop_wear(...)` RPC calls for the
     same recommendation (e.g. two `Promise.all`-parallel requests, or two
     separate `psql` sessions calling `SELECT * FROM
     confirm_daily_drop_wear(...)` with one deliberately delayed via
     `pg_sleep` inside a wrapper to force the lock-wait). Assert exactly one
     result is `"confirmed"` and one is `"already"`, both report the SAME
     `worn_at`, and `daily_recommendations.worn_at` in the database matches
     the first caller's value (not overwritten by the second).
  3. Assert `wardrobe_items.last_worn_at` was written exactly once per item
     and no item outside the confirmed outfit changed.
  4. Force a mid-transaction failure (e.g. temporarily add a
     `RAISE EXCEPTION` after the `wardrobe_items` UPDATE in a throwaway copy
     of the function, or use `pg_cancel_backend`/a statement timeout) and
     confirm NEITHER `wardrobe_items.last_worn_at` NOR `daily_recommendations
     .status` changed — true rollback proof, not inferred from the absence
     of an `EXCEPTION WHEN` block in the source.
  `tests/engine/atomic-wear-confirmation.test.ts` proves the SQL is *shaped*
  correctly (locking clauses present, single shared timestamp, scoped
  writes, no exception-swallowing) but explicitly documents in its own
  header and console output that it cannot substitute for this.

- **Onboarding v2 (Phase 4D, 2026-07-14) — deferred items only:**
  - **Manual localhost acceptance at 390×844 was NOT run this session** —
    this sandbox has no browser. The exact 6-scenario checklist (new user,
    interrupted + resume, skip style preference, partial wardrobe,
    already-completed user, error + retry) is written out in the Phase 4D
    final report; it must be run by the user (or in a follow-up session
    with browser access) before this phase can be considered fully closed.
  - **`npm run build` did not complete in this sandbox** — the backgrounded
    process is killed when the shell call that started it ends (a
    session-isolation property of this sandbox, not a code defect).
    `tsc --noEmit` and `npm run lint` both pass clean on the same source;
    a real `next build` should still be run once in an environment that
    can hold a long-lived process (e.g. the user's own machine or CI)
    before shipping.
  - **`profiles.age_range` is now fully unused by the new onboarding flow**
    (it was already unused by the engine — ground-truth confirmed this
    session). The OLD settings-edit form (`onboarding-form.tsx`, still
    served to already-onboarded users) still collects and saves it. Once
    confidence is high that nothing depends on it, consider either wiring
    it to a real use or removing the field and its form control in a
    later, separate cleanup — not done here to keep this phase's diff
    scoped to onboarding-v2 itself.
