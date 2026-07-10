# WearWise — Opus 4.8 Phase Prompts
Paste-ready prompts. **Usage:** open Opus 4.8 in the WearWise repo → attach `WearWise-Execution-Handbook.md` → paste the **Master Preamble** + the **one phase prompt** you're running. Never run two phases in one session.

---

## MASTER PREAMBLE (paste at the top of every phase session)

```
You are Claude Opus 4.8 acting as the lead engineer and design implementer for WearWise, a mobile-first PWA wardrobe assistant (Next.js App Router + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel + Razorpay + PostHog + Sentry).

Your contract:
1. The attached WearWise-Execution-Handbook.md is the source of truth. Read §2 (Ground Truth) and §3 (Global Build Rules) fully before writing any code. Where the repo disagrees with §2, the repo wins — but list the differences before proceeding.
2. Execute ONLY the phase scope in this prompt. If you discover work belonging to another phase, append it to IDEAS.md — do not build it.
3. Non-negotiables from the handbook: fail-closed validation (extend the existing 3-place enforcement pattern); RLS on every user-data table; One-Screen Rule (§3.2); sheets over pages; design tokens only (no raw hex in components); every new surface ships with empty/loading/error states and PostHog events (§3.9 naming); copy rules (§3.4) — no jargon, guilt, shame, body talk, or fake scarcity anywhere.
4. Quality bar per session: tsc clean, lint clean, new migrations numbered sequentially from the current max and reversible, unit tests for all logic specified in the phase, CHANGELOG.md entry describing the phase outcome.
5. Work module by module: for each module — plan briefly, implement, verify (typecheck/tests), then move on. At the end, print the phase Acceptance Checklist from the handbook with pass/fail per item and list anything incomplete honestly.
6. Ambition mandate: within this phase's scope, exceed expectations — better micro-interactions, smarter empty states, tighter copy — as long as no handbook rule breaks. Permanent exclusions regardless of ambition: body scoring/attractiveness ratings, public social feeds, shopping-first flows.
7. Environment notes: verify package availability before adding dependencies; prefer zero new deps. Do not touch billing keys or production config.
```

---

## PHASE 1 PROMPT — Recommendation Engine v2 + Schema

```
Execute Phase 1 of the handbook (§5, Phase 1): Recommendation Engine v2 + Schema.

Objective: replace generic outfit generation with a deterministic three-stage pipeline — HARD FILTERS → SCORING → RANK & EXPLAIN — that gates every outfit shown anywhere in the app.

Build, in order:
1. Schema migration(s): extend the items table with the Phase-1 field list (handbook §5 P1 Data). Include tag_confidence jsonb and set_id + set_required_components. Write a safe backfill for existing items: conservative defaults, never auto-assign formality > 3, unknown cultural_tag stays null and such items are excluded from auto-recommendation until confirmed.
2. Filter layer (ordered, fail-closed): availability, weather/fabric exclusion, formality window (occasion ±1 on 1–5 scale), cultural pairing legality via a seeded ethnic rule table (kurta/dupatta/saree/sherwani/fusion rules — handbook references Product Plan §7.4; implement as data rows, not code branches), modesty floor, user absolute exclusions, structure completeness, piece-count caps (casual ≤4, office ≤5, festive ≤6).
3. Structure templates incl. ethnic sets (set integrity is a FILTER) and gym/activewear (formality bypassed, comfort weight ×2, no accessories, shorter repeat cooldown).
4. Scoring layer: weighted sum with weights in a config table; factors: color_harmony (rule table: neutrals free, ≤2 saturated hues, metallics = accents), formality_coherence, occasion_fit, comfort, user_style_alignment, novelty; penalties: repeat (item cooldown 4d casual/7d office; pair cooldown 14d), weather_soft, pattern_risk (≤1 bold pattern), accessory_irrelevance. Persist per-recommendation factor contributions.
5. Guards as named, testable functions: AccessoryRelevanceGuard (default NO accessory; requires formality-gap/weather/favorite/festive justification), DupattaLayerGuard, PatternClashGuard, ShoeCompatibility.
6. Confidence score + dual-pick mode flag when below threshold (threshold in config).
7. Golden test suite (minimum): belt+kurta blocked; dupatta never on western top+pants; wool/velvet blocked ≥30°C; in_wash item never emitted; interview outfits all-items formality ≥4; gym returns activewear only; one-piece never paired with separate bottom; 10-item wardrobe still yields hero + 2 backups.
8. Optional if time allows: minimal admin QA route showing an outfit's factor breakdown.

Acceptance: handbook §5 Phase 1 checklist. Engine p75 < 800ms server-side for a 60-item wardrobe. Print the checklist with pass/fail at the end.
```

---

## PHASE 2 PROMPT — Laundry / Availability System

```
Execute Phase 2 of the handbook (§5, Phase 2): Laundry / Availability.

Objective: WearWise always knows what's clean. Zero laundry violations; zero nagging.

Build:
1. State machine on items: available ⇄ in_wash (+ archived), with in_wash_since timestamp. One-tap toggle in the item detail sheet and on item cards.
2. Post-wear bottom sheet after "Wore It": "Where does this go tonight?" — per-item chips for multi-item outfits with category smart defaults (tees/kurtas→wash suggested, jeans/dupattas/layers→wardrobe suggested), [Back in wardrobe] [Into the wash] [Ask me less]. "Ask me less": after 3 uses/dismissals the sheet stops appearing globally and a setting appears in You.
3. Laundry section at the bottom of the Wardrobe board: basket visual, thumbnails, "in wash · Nd" badges, header count, bulk "Laundry done" multi-select. Empty state: "Nothing in the wash. Everything's ready to wear."
4. Soft auto-return: quiet badge in Wardrobe (never push) after per-user wash-cycle estimate (default 4 days; dry-clean categories 14): "5 items might be back from laundry — mark what's clean?" Store per-category wear-per-wash counters (learning stub only).
5. Recommendation wiring: confirm engine's availability filter reads real state; add constrained-inventory honesty line to explanation payload ("Your top office picks are in the wash — this is the best clean combination today"); if >60% of an occasion-critical category is in wash, emit ONE inline note per wash-cycle (no push).
6. Telemetry: laundry_marked, laundry_cleaned, postwear_sheet_shown/completed/dismissed, ask_me_less_activated.
7. Tests: in_wash item cannot surface through drop, Style Me, swap, or backups; state transitions; auto-return prompt timing.

Copy rule: every string must pass the flatmate test (helpful flatmate, said once, quietly — never a parent or a chore app). Acceptance: handbook §5 Phase 2 checklist, printed pass/fail.
```

---

## PHASE 3 PROMPT — Swap One Item · Another Option · Why This Works

```
Execute Phase 3 of the handbook (§5, Phase 3). These are the trust features.

Contract with the user: the outfit they liked stays; only what they asked changes; every outfit explains itself.

Build:
1. Swap sheet (bottom sheet over the outfit): item chips for slots present (Top/Bottom/Shoes/Layer/Accessory) + mood chips (More formal · More casual · More comfortable · More modest · Weather-safer) + visually separated "New mood" (full re-theme).
2. Lock-and-replace engine calls: single-item swap locks ALL other slots + occasion + formality window + color theme; candidates must pass all hard filters against locked items; rank by outfit_score with locked items fixed. Mood swaps change minimum items (usually 1, max 2, "fewest changes first"). Layer/Accessory swap may return "none — this outfit is complete" as a first-class result.
3. Precompute top-5 candidates per slot at generation time so swap results render <1s p75.
4. Result row: [Keep it] [Try another] [Put back]. Put back always restores the exact pre-swap outfit. One-line reason with each replacement.
5. No-candidate state: specific and actionable ("No clean top matches this bottom for office. Swap the bottom instead, or loosen to smart-casual?"). NEVER silently relax a hard filter.
6. Another Option: full-outfit alternates as horizontal swipe on the hero (not a list).
7. Caps (decided): 3 swaps/day, 2 options/drop; first 3 sessions cap-exempt; cap sheet copy exactly per handbook §5 P3 (confidence framing + 👎 feedback path). OMIT the Pro line until Phase 8; leave a marked TODO hook.
8. Why This Works: render top-3 positive stored factor contributions as one plain-language line each; collapsible chip on every outfit card (Today, Style Me, swap results, backups). Strings must map 1:1 to stored factors — no free-generated reasons.
9. Feedback: 👎 + optional reason chip (too formal / not my style / uncomfortable / weather / repeat) → persisted for Phase 7 learning; immediate soft ack ("Noted — tomorrow gets sharper").
10. Telemetry: swap_requested/kept/reverted, another_option, cap_hit_swap, cap_hit_option, feedback_negative(reason), why_expanded.
11. Tests: unlocked-slot immutability; undo integrity; cap counting incl. session exemption; explanation-factor 1:1 mapping.

Acceptance: handbook §5 Phase 3 checklist, printed pass/fail.
```

---

## PHASE 4 PROMPT — Today Screen v2 + One-Screen Shell + Onboarding v2

```
Execute Phase 4 of the handbook (§5, Phase 4 + §6.1 + §6.7).

Objective: the morning surface, perfected — one viewport, one answer, under 60 seconds to a decision. This screen is the product.

Build:
1. Shared screen shell used by ALL tabs: context strip (top, one line) → answer card (middle) → action row (bottom 40%, thumb zone) → tab bar (Today · Wardrobe · Style Me · Plan · You). 380px baseline; default content ≤1 viewport; add a dev-mode scroll-audit warning when a tab exceeds 1.3×.
2. Today per handbook §6.1: serif time-aware greeting; weather+occasion strip (occasion tappable); hero card ~60% viewport — flat-lay collage per §4.3 (auto-arranged item photos, occasion/weather chips, repeat-safe chip, gem note when applicable); collapsed chip row (Why This Works ▾ · laundry note) expanding IN PLACE; action row: Wore it (primary) · Swap one thing · Show another; backups via horizontal swipe with dots; overflow: Save for later · Share · 👎.
3. Wore It flow: tap → sage sweep confirm (restrained; single sparkle allowed on first-ever wear; respect prefers-reduced-motion) → post-wear laundry sheet (Phase 2) → undo toast (8s).
4. All states: empty (<8 items → upload coach w/ progress "6 of 8"); loading (skeleton hero, <2s, drop is pre-generated server-side — never computed on open); error (proven-favorite fallback: "Having trouble — here's a proven favorite"); low-confidence dual-pick ("Two good options today — your call"); weekend occasion shift; no-push-permission fallback messaging.
5. Onboarding v2 (≤6 questions, ≤90 seconds, per §6.7): dressing category → age band → lifestyle → city → style vibe (3 image chips + "you decide") → comfort/polish → drop-time + push opt-in. Each: one input per screen, why-we-ask microcopy, skip, progress dots. Then camera-first batch upload coach: "10 items ≈ 2 minutes", background auto-tagging note, privacy line ("Private to you. Never shared. Never used to train shared models."), first-outfit celebration at item 8.
6. Telemetry: drop_opened, wore_it_tapped, onboarding_step_completed(step), first_outfit_generated (with minutes-from-signup), open-to-decision timing.
7. Tests: shell renders all five tabs; state machine coverage for Today; onboarding completable with all skips.

Acceptance: handbook §5 Phase 4 checklist + a fresh-signup walkthrough reaching a first outfit in <5 minutes. Print pass/fail.
```

---

## PHASE 5 PROMPT — Wardrobe / Closet Board v2 + Insights + Quiet Gems

```
Execute Phase 5 of the handbook (§5, Phase 5 + §6.2).

Objective: the emotional ownership surface — screenshot-beautiful, honest, and feeding the engine.

Build:
1. Closet Board: sections in order — Hanging Rail (tops/dresses/outerwear), Folded Shelf (bottoms/tees/knits), Occasion & Traditional (ethnic sets/festive), Shoe Rack, Accessories Tray, Laundry basket (Phase 2 section slots in, visually distinct). Horizontal virtualized shelves (smooth at 200 items), collapsible sections, persistent Add button.
2. Item cards: photo on ivory, single-line name, state dot (sage available / slate in-wash); wear count on long-press only. Missing photo → line-style category illustration, never a grey box.
3. Item detail sheet: photo, all tags editable (chips/selects, ≤3 taps from board to edited tag), state toggle, wear history, archive (two-step).
4. Tag-check queue: "N items need a quick check" chip → per item show ONLY the 3 lowest-confidence, highest-impact fields (formality, category, cultural_tag priority). Completing is optional; never blocks anything. User edits set tag_confidence to 1 and feed the auto-tagger feedback store.
5. Insight cards (max 3, every number query-backed — fabricating = release blocker): most-worn item, quiet gems count ("4 pieces resting 6+ weeks"), laundry snapshot. "Missing basics" ONLY when rule-derivable (e.g., office lifestyle + zero formality≥3 bottoms), framed as a gap, links nowhere.
6. Quiet Gems logic: compatibility_score × low wear_count × available. Surface: one Wardrobe insight card + a gem note inside Daily Drop copy when a gem is included ("That kurta hadn't been out in 7 weeks. Welcome back."). Gem skipped 2× → one-time "Not feeling this one? I'll rest it." → long cooldown (90d), stored per item.
7. Batch upload hardening: multi-photo capture/pick, background tagging with shimmer badges, failure retry without photo loss.
8. Telemetry: tag_edited(field), tagcheck_completed, gem_shown/worn/rested, insight_card_tapped, board_section_toggled.
9. Tests: virtualization renders; gem selection + cooldown; insight queries against seeded fixtures.

Acceptance: handbook §5 Phase 5 checklist, printed pass/fail.
```

---

## PHASE 6 PROMPT — Style Me v2 · Plan · You

```
Execute Phase 6 of the handbook (§5, Phase 6 + §6.3–6.5).

Build:
1. Style Me (§6.3): occasion grid — Work, Casual, Festival, Family function, Wedding guest, Date, College, Travel, Dinner, Interview, Gym, Formal event (this priority order). After pick: ONE result card + refine chips row (More formal · More casual · More modest · More comfortable · Ethnic/Western/Mixed · Weather-safe · Reuse favorites · Avoid repeats) + same action row as Today (Wear this · Swap one thing · Show another). Free usage: 3 requests/day metered but NOT enforced yet (Phase 8 wires enforcement); Interview + Wedding guest flagged always-free in the entitlements config. Thin-inventory state: honest, names the constraint ("2 suitable items are in the wash"), offers closest alternative and loosen-occasion path — never an empty dead end, never a dirty item.
2. Plan (§6.4 — deliberately minimal): Tomorrow slot (any outfit card gains "Save for tomorrow"; tomorrow's drop honors it), Saved Looks grid (2-col, cap 20 free — metered, enforcement Phase 8), 7-dot week strip (planned/worn/empty). Empty state: "Nothing planned. Mornings still covered — your daily pick arrives at 7:00." Do NOT build trips, calendars, or laundry planning.
3. You (§6.5): accordion sections — Style preferences (all onboarding inputs editable); "What I've learned about you" (live learned prefs, each with [That's right] [Remove] — Remove must actually clear the store); Daily Drop & notifications (time picker, one-tap pause honored indefinitely); Privacy & data (plain-language storage explanation, export JSON, delete-all that deletes DB rows AND storage objects — verify in a test); Wardrobe stats (honest counts); Feedback history (past 👎s, deletable); Account. Premium row: hidden behind eligibility flag (Phase 8).
4. Telemetry: styleme_requested(occasion), refine_chip_used(chip), saved_look_created, tomorrow_planned, learned_pref_removed, pause_notifications, delete_all_completed.
5. Tests: one-screen audit all three tabs; learned-pref remove; delete-all end-to-end; tomorrow slot → next drop honoring.

Acceptance: handbook §5 Phase 6 checklist, printed pass/fail.
```

---

## PHASE 7 PROMPT — Learning Loop · Notifications · Streaks Conversion · Weekly Recap

```
Execute Phase 7 of the handbook (§5, Phase 7).

Objective: the app gets visibly smarter every week — with zero manipulation.

Build:
1. Learning signals → stores (item_preference, pair_affinity, occasion_fit_offset, accessory_relevance, style_alignment, confidence calibration), exactly per this table:
   - Wore It: strong positive to both items + pair affinity + occasion fit; capped delta per event.
   - Swap-out: CONTEXT penalty for removed item (occasion-scoped, not global); kept-items affinity up. Effect after 2–3 occurrences.
   - Dislike + reason chip: strong, targeted to the chip's dimension; decays over 60 days.
   - Saved outfit: medium pair affinity (below Wore It weight).
   - Accessory removed: relevance down for this outfit-type; global aversion only after 3+.
   - Mood swap (more modest/casual/formal/comfortable): recalibrate per-occasion offset after 2 consistent uses; never global.
   - Tag edit: ground truth, immediate.
   - Favorite repeated: favorite_score up, novelty weight down slightly — but keep gems flowing (rut guard).
   - Notification ignored 5+ consecutive days: ONE in-app (not push) retime/pause prompt; never auto-increase frequency.
   All stores human-readable in an admin view; every signal has a unit test proving direction and magnitude cap.
2. Notifications: one/day at chosen time, content-forward ("Your Tuesday office look is ready — cotton day, 33°C"); pause honored forever; guilt strings banned (add a lint/grep check for banned phrases: "you haven't", "don't miss", "streak is about to").
3. Streaks conversion (CEO decision): replace daily-streak mechanics with weekly "mornings sorted" count; pause-and-repair semantics; migrate existing streak data to a lifetime "mornings sorted" total (never present as a broken streak); no fire imagery or loss framing anywhere.
4. Weekly Recap: Sunday-evening in-app card (never push): "5 mornings decided · 2 pieces rediscovered · smartest save: Thursday." Query-backed numbers only; shareable via existing share-card infra; leave a marked Pro-mention hook (Phase 8).
5. Cohort visibility: simple admin dashboard — Wore-It rate per user cohort week-over-week (the "is it getting smarter" chart).
6. Telemetry: signal_applied(type), recap_shown/shared, retime_prompt_shown/accepted, mornings_sorted_paused/repaired.

Acceptance: handbook §5 Phase 7 checklist, printed pass/fail.
```

---

## PHASE 8 PROMPT — Pro Tier · Caps Wiring · Festive Overlay · Launch Polish

```
Execute Phase 8 of the handbook (§5 Phase 8 + §7 Pro Guide + §8 Launch Checklist). Final phase before launch.

Build:
1. Entitlements: server-side entitlements table + subscription state (none/trial/active/past_due/cancelled) driving the §7.2 tier matrix. EVERY gated API validates server-side; UI gating is cosmetic. Free caps now enforced: 3 swaps/day, 2 options/drop (first-3-sessions exemption stays), Style Me 3/day (Interview + Wedding guest always free), Saved Looks 20, items 200.
2. Pricing & billing via existing Razorpay scaffolding, UPI-first: Pro monthly ₹199, annual ₹1,999 (always show "₹1,999/yr = ₹167/mo"); 7-day trial; day-5 in-app trial reminder listing the user's OWN usage ("9 swaps, 2 planned mornings"); cancel in 2 taps, access till period end, no retention dark patterns; webhook lifecycle handled (trial→active→past_due 3-day quiet grace→cancelled) with idempotent handlers.
3. Value gate: NO Pro surface anywhere until user has 10 Wore Its OR 14 active days. Then wire the upgrade moments (each one line, dismissible, 30-day silence per trigger on dismiss): cap-hit sheets gain the Pro line ("Pro lets you keep exploring anyway"); Weekly Recap Pro hook; post-occasion-success trial offer (AFTER the event date); Saved-Looks cap; Tomorrow Prep 3rd use. Paywall sheet per §6.6: price, tier matrix summary, trial CTA, and the line "Everything you already use stays free."
4. Never paid (assert in tests): tag edits, feedback, laundry marking, privacy controls, Interview/Wedding occasions.
5. Pro features from the matrix not yet built: drop regenerate + style-mood variants; unlimited toggles; insights depth (combination coverage, occasion readiness, gem map); Tomorrow Prep reservations + week planning + laundry forecast; festive multi-event function planner (simple: N events → N non-repeating looks from owned clothes, same-audience repeat guard); priority generation queue flag.
6. Festive overlay: festival config table seeded — Diwali, Holi, Navratri/Durga Puja, Ganesh Chaturthi, Raksha Bandhan, Eid al-Fitr, Eid al-Adha, Christmas, New Year; regional opt-ins (Onam, Pongal, Baisakhi, Chhath, Gudi Padwa…) selectable in onboarding city step and You tab — never assumed from name/city. On festival dates: §4.1 overlay accents (max 2 visible), festive alternate drop ALONGSIDE the daily pick, festive notification variant. Auto-applies and auto-reverts by date.
7. Launch polish: run the full §8 checklist — Lighthouse ≥85, scroll audit, reduced-motion, copy sweep (grep banned phrases), a11y pass, RLS tests, delete-all E2E, payments E2E in test mode, telemetry dashboard, Sentry triage, PWA install prompt after 3rd Wore It, CHANGELOG.
8. Telemetry: value_gate_reached, pro_prompt_shown/dismissed(trigger), pro_trial_started, pro_paid, pro_cancelled, cap_hit_*, festive_overlay_shown, festive_alt_worn.

Acceptance: handbook §8 launch checklist printed with pass/fail per line. Anything red = list it, don't hide it.
```

---

## Tips for running these prompts
- One phase per Opus session; attach the handbook every time (sessions don't share memory).
- If Opus proposes deviating from the handbook, require it to state the rule, the reason, and get your yes before proceeding.
- After each phase, skim the printed Acceptance Checklist and the CHANGELOG entry; spot-check one golden test and one screen on your phone before starting the next phase.
- Keep `IDEAS.md` — it becomes the backlog review at the end of Phase 8.

---

## Addendum — Local-First Release Process & Corrected Action Separation (2026-07-10)

Paste this reminder into every phase/hotfix prompt going forward.

**Local-First Phase Gate (mandatory order):** implement on a dedicated local branch -> run the app on localhost -> complete manual UI acceptance testing -> run unit tests + typecheck + lint + production build -> fix all defects locally -> commit only after the complete phase acceptance checklist passes -> push and deploy once at phase completion -> run a final production smoke test. No phase or hotfix ships merely because automated tests pass; every user-facing interaction must be manually verified on localhost. See Execution Handbook §9 "Local-First Phase Gate".

**Corrected Phase 3 action separation (do not regress):**
- "Swap one thing" = slot picker first; no candidates before a slot is chosen; changes exactly one slot; every non-selected item locked; Try another stays within the selected slot; Put back restores exact pre-swap item IDs.
- "Another option" = separate button, handler, route, loading state, and cap; never opens the swap sheet; never uses the single-item swap route.

### Single-Hero Today Dashboard
- Today's Drop is the sole primary recommendation.
- Legacy Best Pick cards must never appear on the dashboard.
- Missing Daily Drop data triggers idempotent creation, not legacy fallback.
- Cron jobs may precompute recommendations but are not required for dashboard use.
- Different accounts may correctly receive different recommendation content.
- Release comparison checks structure and functionality, not identical outfits across accounts.
- Each dashboard request may perform at most one write-producing recommendation action. A newly created or regenerated outfit must pass final availability validation before rendering. If that validation fails, the request fails closed rather than writing again.
