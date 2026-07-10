# WearWise Execution Handbook
**Owner:** Prashant (CEO) · **Executor:** Claude Opus 4.8 · **Planner:** this handbook + `WearWise-Product-Plan.md` · **Date:** 7 July 2026

This is the single source of truth for building the next major WearWise phase. Workflow: for each phase, paste **this handbook** + the matching prompt from `WearWise-Opus-Phase-Prompts.md` into Opus 4.8 inside the project repo. Opus executes; this document decides.

---

## 0. How to Use This Handbook

1. Open a fresh Opus 4.8 session in the WearWise repo (Cowork/Claude Code with the project folder mounted).
2. Attach/paste: this handbook + the specific Phase Prompt. Optionally attach `WearWise-Product-Plan.md` for deep rationale.
3. Opus must read §2 (Ground Truth) and §3 (Global Build Rules) before writing any code, then execute only the scope of the given phase.
4. Every phase ends with the phase's Acceptance Checklist green, `tsc` + lint clean, and a short CHANGELOG entry.
5. Do not let Opus "helpfully" pull scope from future phases — cross-phase scope requires CEO approval.

**Phase order (dependencies respected):**

| Phase | Name | Depends on | Rough size |
|---|---|---|---|
| 1 | Recommendation Engine v2 + Schema | — | L |
| 2 | Laundry / Availability System | 1 | M |
| 3 | Swap One Item · Another Option · Why This Works | 1, 2 | L |
| 4 | Today Screen v2 + One-Screen Shell + Onboarding v2 | 1–3 | L |
| 5 | Wardrobe / Closet Board v2 + Insights + Quiet Gems | 1, 2 | M |
| 6 | Style Me v2 · Plan · You | 1–4 | M |
| 7 | Learning Loop · Notifications · Streaks Conversion · Weekly Recap | 1–6 | M |
| 8 | Pro Tier (₹199/₹1,999) · Caps · Festive Overlay · Launch Polish | all | L |

---

## 1. Mission and Competitive Bar

**Mission for this build:** make WearWise the most *accurate, trusted, and effortless* wardrobe assistant available — measurably better than every competitor at the one job: "what should I wear today, from my clothes, right now."

Beat-the-competition table — each row is a standing order:

| Competitor weakness (documented) | WearWise standard |
|---|---|
| Whering: outfit generation is basic | Engine v2: rules-gated, scored, explainable; every outfit passes 8 hard filters before display |
| Indyx: one-at-a-time upload; stats paywalled at $60/yr; pushy upsells | Batch upload; honest free insights; upgrade prompts only at value moments, one line, dismissible |
| Acloset: AI complaints; 100-item free cap hit mid-onboarding | Free cap ≥200 items; AI output never reaches the screen unless the deterministic layer approves |
| StyleDNA/others: generic AI after a week; Western-only fashion logic | Per-user learning loop + hand-built Indian ethnic rule table (kurta/dupatta/saree/festive) no competitor has |
| All: no laundry/availability awareness | Availability is a hard filter everywhere; laundry violations = 0 is a release gate |
| All: swap regenerates the whole look | Lock-and-replace swap; the rest of the outfit is contractually stable |
| All: no reasons given | Why This Works on every outfit, generated from real scoring factors |

**Ambition mandate (CEO, 7 Jul 2026):** it is OK to exceed the conservative plan — richer motion, more delightful micro-interactions, smarter empty states, earlier delivery of "Next" items — whenever it makes the product better without breaking §3 rules. Three exclusions stay permanent because they destroy the trust position (not because of caution): **no body scoring/attractiveness ratings, no public social feed, no shopping-first flows.** Everything else is negotiable in favor of excellence.

---

## 2. Ground Truth — Current Codebase State

Opus: verify against the repo; where the repo disagrees with this section, the repo wins — but flag the difference.

- **Stack:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase (Postgres, Auth, Storage, RLS) + Vercel + Razorpay + Resend + PostHog + Sentry. Mobile-first PWA. No native app.
- **Already shipped (Modules A–G, Jul 2026):** app skeleton with `(app)` route group; migrations 0012–0019; a first-gen outfit engine; feature flags; Razorpay billing scaffolding; streaks; web push (drop + cron live); share cards + friend vote (private links).
- **Design system in place:** warm ivory / charcoal / plum / muted rose / sage tokens; Inter (UI) + Instrument Serif (display); reusable card/button components; assets drop-in structure.
- **Conventions (mandatory):** RLS on every user-data table (users read/write only their own rows); human-in-the-loop for risky mutations; outfit validation is enforced in 3 places (AI generation, admin UI, server approve API) and **fails closed** — extend this pattern, never bypass it.
- **Existing migrations end at 0019** — new migrations continue from 0020.

## 3. Global Build Rules (apply to every phase)

1. **Fail closed.** Any validator/filter error → no recommendation shown, fallback per spec. Never show an unvalidated outfit.
2. **One-Screen Rule.** Every tab answers its question within one viewport (380px baseline); no scrolling required to act; secondary flows are bottom sheets; primary actions in the thumb zone (bottom 40%). Scroll audit: default content ≤1.3× viewport.
3. **Sheets over pages.** Swap, feedback, post-wear laundry, item detail, refine controls = bottom sheets. Full navigation only via the 5 tabs.
4. **Copy rules.** Plain language, no fashion jargon, no guilt/fear/shame, no body talk, no fake scarcity, no clickbait pushes. Every AI output is within one tap of a correction control. Every "why we ask" is answered inline. Laundry copy = helpful flatmate, never parent.
5. **Explainability.** Why This Works strings must be rendered from actual scoring-factor contributions — never free-generated text disconnected from the score.
6. **Privacy.** No public surfaces. Upload flow shows: "Private to you. Never shared. Never used to train shared models." Delete-all must actually delete (DB rows + storage objects).
7. **Performance budgets.** Today tab interactive <2.5s on mid-range Android over 4G; drop pre-generated server-side (never computed on open); swap result <1s (candidates precomputed); images lazy + properly sized; Lighthouse mobile ≥85.
8. **Accessibility.** All outfit info available as text; tap targets ≥44px; system font-scaling reflows (never truncates); WCAG AA contrast on all themes; focus states on everything interactive.
9. **Telemetry.** PostHog events snake_case: `drop_opened`, `wore_it_tapped`, `swap_requested`, `swap_kept`, `another_option`, `feedback_negative`, `laundry_marked`, `laundry_cleaned`, `cap_hit_swap`, `cap_hit_option`, `pro_trial_started`, `pro_paid`, `onboarding_step_completed`, `tag_edited`. Every new surface ships with its events.
10. **Quality gates per phase:** `tsc` clean · lint clean · migrations reversible · RLS tests for new tables · empty/loading/error states implemented for every new surface (no exceptions) · CHANGELOG entry.
11. **No scope leak.** Build only the phase's scope. Log ideas in `IDEAS.md` instead of building them.
12. **Design tokens only.** No hex values in components; extend the token file if a value is missing.

---

## 4. Design System Spec (Appearance)

**Base theme: Calm Premium Wardrobe** (Theme 1) with **Festive Overlay** (Theme 3) auto-applied on festival dates. "Simple mode" (Theme 2) is a Later toggle — architect styles so density can drop, don't build the toggle yet.

### 4.1 Color (existing tokens; canonical roles)
- `--bg` warm ivory (#FAF7F2 family) · `--surface` white-warm card · `--ink` charcoal (#2A2724 family) · `--ink-muted` 60% · accents: `--plum` (primary action), `--rose` (positive/favorite), `--sage` (success/available), `--clay` terracotta (festive overlay accent), `--marigold` (festive highlight, overlay only).
- Semantic: available=sage dot · in-wash=slate/blue-grey badge · repeat-safe=sage chip · low-confidence=neutral amber, never red · destructive=muted brick, two-step only.
- Festive overlay recolors: section headers, hero card border glow, drop notification icon — **nothing else**. Accent budget: max 2 festive accents visible at once.

### 4.2 Typography
- Inter: UI, 15px base body, 13px meta, 17px section titles (600).
- Instrument Serif: display only — greeting line, hero occasion title, festive headers, onboarding welcome. Never in buttons/body.
- Numeric stats: Inter tabular-nums.

### 4.3 Layout & components
- Spacing scale 4/8/12/16/24/32; screen padding 16; card radius 20 (hero) / 14 (item) / 10 (chips); shadows: soft ambient only (no hard drops).
- **Fixed screen anatomy (every tab):** context strip (top, 1 line) → answer card (middle) → action row (bottom, thumb zone) → bottom tab bar.
- **Hero outfit card:** flat-lay collage of real item photos on ivory, auto-arranged (top garment upper-left, bottom lower-right, shoes bottom edge, accessory small); occasion chip top-left, weather chip top-right, repeat-safe/gem chips lower edge. Photos never stretched; missing photo → tasteful category illustration in line style.
- **Item card:** photo, single-line name, state dot, wear-count on long-press only (not shouted).
- **Chips:** pill, 32px height, single-select behavior obvious; selected = plum fill/ivory text.
- **Bottom sheets:** grabber, title, ≤1 screen tall, backdrop blur-sm, spring-in 220ms.
- **Buttons:** primary = plum filled, one per screen; secondary = outline ink; tertiary = text. Loading = inline spinner in button, label persists.

### 4.4 Motion
- Standard: 180–240ms ease-out fades/slides. Hero card entrance: 300ms rise+fade once per drop. "Wore It" confirmation: gentle sage sweep + subtle haptic, no confetti storms (a single restrained sparkle is allowed on first-ever wear). Festive overlay: soft shimmer on hero border, festival days only. Respect `prefers-reduced-motion` everywhere.

### 4.5 Iconography & imagery
- Thin-line rounded icons (lucide baseline), 1.75px stroke. Festive overlay may swap ≤3 icons for cultural line motifs (jutti, bangle, diya) in identical stroke weight. No emoji in UI chrome; sparing emoji allowed in notification copy only if user's locale suggests it (default: none). No stock photography, no mannequins, no body imagery.

---

## 5. Phase-by-Phase Execution Plan

Each phase: Goal → Features → Data/Logic → Pages touched → Acceptance Checklist. Full page anatomy lives in §6; full logic rationale in `WearWise-Product-Plan.md` (§§7–12).

### Phase 1 — Recommendation Engine v2 + Schema
**Goal:** replace generic generation with the Filter → Score → Rank & Explain pipeline. This is the moat; take the time to get it right.
**Features:**
- **Hard filter layer (fails closed, ordered):** availability · weather/fabric exclusion · formality window (occasion ±1) · ethnic/cultural pairing legality (rule table) · modesty floor · user absolute exclusions (colors/types/footwear) · outfit structure completeness · piece-count cap by occasion.
- **Scoring layer:** weighted sum — color_harmony, formality_coherence, occasion_fit, comfort, user_style_alignment, novelty — minus repeat_penalty, weather_softpenalty, pattern_risk, accessory_irrelevance. Weights in a config table (not code). Per-recommendation factor contributions persisted for explanations + QA.
- **Structure templates:** top+bottom · one-piece · ethnic set (set integrity = filter) · kurta+bottom(+conditional dupatta) · saree-as-set · western formal · casual · **gym/activewear** (formality bypassed, comfort ×2, no accessories).
- **Guards:** Accessory Relevance (default = no accessory; requires formality-gap/weather/favorite/festive justification) · Dupatta/Layer Guard · Pattern Clash (≤1 bold pattern) · Shoe Compatibility (formality+weather+constraints) · Color rules (≤2 saturated hues, neutrals free).
- **Confidence score** (inventory depth × tag completeness × score margin) with dual-pick honest mode below threshold.
**Data:** extend items schema (migration 0020+): color_family, pattern+boldness, fabric(coarse), sleeve_length, fit, formality 1–5, occasion_tags[], weather flags, cultural_tag, modesty_level, layering_role, accessory_role, footwear fields, set_id + required components, state, in_wash_since, avoid_with[], tag_confidence jsonb, photo_quality_flag. Backfill via auto-tagger with confidence; migration maps existing items safely (unknowns → conservative defaults, never guessed formality above 3).
**Logic tests (required):** golden-set unit tests — belt+kurta blocked; dupatta absent on western outfits; wool blocked ≥30°C; in-wash never surfaces; interview never gets formality<4 top; gym pulls activewear only; one-piece never gets a separate bottom.
**Pages:** none user-facing (admin QA view optional: show factor breakdown per generated outfit).
**Acceptance:** all golden tests green · weights configurable at runtime · factor contributions stored · engine returns hero+2 backups+confidence for a 10-item wardrobe in <800ms server-side · existing validation-in-3-places pattern extended, not bypassed.

### Phase 2 — Laundry / Availability System
**Goal:** the app always knows what's clean. Zero laundry violations, zero nagging.
**Features:** state machine available⇄in_wash (+archived); one-tap toggle on item cards; post-wear bottom sheet ("Where does this go tonight?" — per-item chips, category smart defaults: tees→wash, jeans→wardrobe, dupatta→wardrobe); bulk "laundry done"; soft auto-return prompt as a quiet Wardrobe badge after learned wash-cycle (default 4d, per-category dry-clean 14d) — never a push; "Ask me less" honored after 3 dismissals (feature goes silent); wear-per-wash learning stub (counts only).
**Effects:** hard exclusion already in engine (P1) — wire real state; constrained-inventory honesty line in explanations ("Your top office picks are in the wash — best clean combination today"); >60% category in wash → one inline note per cycle.
**Pages:** Wardrobe laundry section (basket area, thumbnails, "in wash · 3d" badges, count header, positive empty state: "Nothing in the wash. Everything's ready to wear."); item detail sheet state toggle; post-wear sheet.
**Acceptance:** in_wash item can never appear in any recommendation path (test) · post-wear sheet ≤2 taps to complete · all copy passes the flatmate test · state changes emit telemetry.

### Phase 3 — Swap One Item · Another Option · Why This Works
**Goal:** the trust features. The outfit the user liked stays; only what they asked changes; every outfit explains itself.
**Features:**
- **Swap sheet:** tappable item chips (only slots present) + mood chips (More formal/casual/comfortable/modest/Weather-safer) + separated "New mood" (full re-theme). Lock-and-replace per the §5-Plan table (Product Plan §11.2): swapping top locks bottom/shoes/layer/accessory/occasion/formality/color theme. Mood swaps change the minimum items (usually 1, max 2). Layer/accessory swaps may resolve to "none — this outfit is complete" as a first-class result.
- **Result row:** [Keep it] [Try another] [Put back] — instant in-place replacement <1s (precompute top-5 candidates per slot at generation time), one-line reason.
- **No-candidate error:** specific + next step ("No clean top matches this bottom for office. Swap the bottom instead, or loosen to smart-casual?"). Never silently relax a hard filter.
- **Another Option:** full alternative, horizontal-swipe alternates on hero (not a list).
- **Caps (decided):** 3 swaps/day, 2 options/drop free; first 3 sessions cap-exempt; cap message = confidence framing: "These are the strongest matches from your clean wardrobe today. I rank every valid combination — going further means lower-scored pairings, where colors and formality start to drift. If something's off, tap 👎 and tell me why — tomorrow's pick gets sharper. Pro lets you keep exploring anyway." (Pro unlock wiring lands in Phase 8; until then cap message omits the Pro line.)
- **Why This Works:** top-3 positive factor contributions rendered as one plain-language line each (e.g., "Deep green + cream is a low-clash pair · Kurta matches office formality · 33°C — both pieces breathe"). Collapsible chip on all outfit cards.
- **Feedback:** 👎 + one optional reason chip (too formal / not my style / uncomfortable / weather / repeat) — wired to penalty stores.
**Acceptance:** swap never changes unlocked slots (test) · undo always restores pre-swap outfit · swap result <1s p75 · Why This Works strings match stored factors 1:1 · cap events fire.

### Phase 4 — Today Screen v2 + One-Screen Shell + Onboarding v2
**Goal:** the morning surface, perfected. One viewport, one answer, <60s to decision.
**Features:** fixed anatomy shell reused by all tabs (context strip / answer card / thumb-zone action row / tab bar); Today = greeting (Instrument Serif, time-aware) + weather/occasion strip; hero card (~60% viewport) with chips; collapsed chip row (Why This Works · repeat-safe · laundry/gem notes) expanding in place; action row: **Wore it** (primary) · Swap one thing · Show another; backups as horizontal swipe; Save for later + Share in overflow; Wore It → sage sweep confirm → post-wear laundry sheet (P2); weekend occasion shift; drop pre-generation wiring (existing cron) + proven-favorite fallback on engine failure; low-confidence dual-pick honest mode.
**Onboarding v2 (≤6 questions, ≤90s):** dressing category → age band → lifestyle → city (weather permission) → style vibe (3 image chips + "you decide") → comfort/polish chip → drop-time picker with push opt-in. Each step: one screen, why-we-ask microcopy, skip, progress dots. Then camera-first batch upload coach ("10 items ≈ 2 minutes", background auto-tagging, first outfit celebration at item 8).
**Acceptance:** Today default content ≤1 viewport at 380px · first outfit reachable <5 min from signup in test run · every state (empty/loading/error/low-confidence/no-push-permission) implemented · onboarding drop-off telemetry per step.

### Phase 5 — Wardrobe / Closet Board v2 + Insights + Quiet Gems
**Goal:** emotional ownership + honest intelligence.
**Features:** sectioned board — Hanging Rail, Folded Shelf, Occasion & Traditional, Shoe Rack, Accessories Tray, Laundry (P2 section slots in); horizontal shelves, screenshot-beautiful; persistent Add; batch upload flow hardened; tag-check queue ("3 items need a quick check" — only 3 lowest-confidence/highest-impact fields per item: formality, category, cultural_tag); item detail sheet (photo, editable tags, state toggle, wear history, archive); **insight cards (max 3, honest only):** most-worn, quiet gems count, laundry snapshot; **Quiet Gems:** compatibility×low-wear×available surfaced in drop copy + one Wardrobe card; gem skipped 2× → "Not feeling this one? I'll rest it." then long cooldown; "missing basics" only when rule-derivable, links nowhere.
**Acceptance:** board renders 200 items smoothly (virtualized shelves) · tag edit ≤3 taps from board · zero fabricated insights (each card backed by a query) · gem cooldown logic tested.

### Phase 6 — Style Me v2 · Plan · You
**Goal:** occasion answers, light planning, transparent personalization.
**Style Me:** occasion grid (Work · Casual · College · Date · Dinner · Travel · Interview · Gym · Wedding guest · Family function · Festival · Formal event); refine chips (More formal/casual · More modest · More comfortable · Ethnic/Western/Mixed · Weather-safe · Reuse favorites · Avoid repeats); ONE result card + Show another; same action row as Today; honest thin-inventory states ("2 suitable items are in the wash").
**Plan (deliberately minimal):** Tomorrow slot (any outfit → Save for tomorrow) · Saved Looks grid (cap 20 free) · 7-dot week strip · empty state: "Nothing planned. Mornings still covered — your daily pick arrives at 7:00."
**You:** style preferences (all onboarding inputs editable) · "What I've learned about you" (transparent learned prefs, correct/remove each) · drop time + notification prefs + one-tap pause · privacy panel (storage explanation, export, delete-all that deletes) · honest wardrobe stats · feedback history (editable) · account. Premium row hidden until Phase 8 eligibility.
**Acceptance:** all three tabs pass one-screen audit · learned-prefs list is live data with working remove · delete-all verified (rows + storage) · interview/wedding occasions flagged always-free in config.

### Phase 7 — Learning Loop · Notifications · Streaks Conversion · Weekly Recap
**Goal:** visibly smarter every week, without manipulation.
**Learning:** implement signal table (Product Plan §7.6): Wore It (strong, capped per event), swap-out (context penalty), dislike+chip (targeted, 60-day decay), saved (medium), accessory-removed (relevance↓, global only after 3), mood-swap recalibration (2× same occasion), tag-edit (ground truth), favorite-repeat (novelty↓ with gem flow guard), notification-ignored (5× → in-app retime prompt, never auto-increase). Stores: item_preference, pair_affinity, occasion_fit_offset, accessory_relevance, style_alignment, confidence calibration — all human-readable in admin.
**Notifications:** one/day at chosen time, content-forward ("Your Tuesday office look is ready — cotton day, 33°C"); pausable indefinitely; guilt copy banned; festive-day variant.
**Streaks conversion (decided):** existing streaks → weekly "mornings sorted" count; pause-and-repair; historical counts preserved as lifetime total; no fire imagery, no loss framing.
**Weekly Recap (pulled forward from Next — ambition mandate):** Sunday evening in-app card (not push): "5 mornings decided · 2 pieces rediscovered · smartest save: Thursday." Shareable. First Pro mention slot (Phase 8 wires it).
**Acceptance:** each signal has a unit test proving direction+magnitude caps · cohort dashboard: Wore-It rate week-over-week per user · recap numbers query-backed · notification pause honored forever (test).

### Phase 8 — Pro Tier · Caps Wiring · Festive Overlay · Launch Polish
**Goal:** monetize proven value; dress the app for festival season; ship-ready.
**Pro (full guide §7 of this handbook):** ₹199/mo, ₹1,999/yr via existing Razorpay scaffolding (UPI-first); 7-day trial; value gate = 10 Wore Its OR 14 active days before any Pro surface appears; free tier locked per matrix (§7.2); cap messages gain their Pro line; upgrade moments wired (recap, occasion success, cap-hit) — one line, dismissible, 30-day silence per trigger on dismiss.
**Festive overlay:** festival table (Diwali, Holi, Navratri/Durga Puja, Ganesh Chaturthi, Raksha Bandhan, both Eids, Christmas, New Year + regional opt-ins from onboarding city step); on festival dates: overlay accents (§4.1), festive alternate drop alongside (never replacing) the daily pick, festive notification variant.
**Polish:** Lighthouse pass, scroll audit all tabs, reduced-motion QA, copy sweep against §3.4, Sentry noise triage, empty/error state audit, PWA install prompt at value moment (after 3rd Wore It), CHANGELOG + launch checklist (§8).
**Acceptance:** payment E2E in test mode (subscribe, trial convert, cancel, webhook) · gating matrix enforced server-side (not just UI) · overlay auto-applies and reverts by date · zero paywalled corrections (tag edit/feedback/laundry always free) · launch checklist green.

---

## 6. Page-by-Page Master Spec

All pages use the fixed anatomy (§4.3) and the One-Screen Rule (§3.2). Bottom tab bar: Today · Wardrobe · Style Me · Plan · You (icons + labels, active = plum).

### 6.1 Today
| Zone | Content |
|---|---|
| Context strip | "Good morning, Prashant" (serif) · date · weather chip (33° ☀ rain-flag) · occasion chip (Office, tappable to switch) |
| Answer card | Hero outfit collage · occasion+weather chips on card · repeat-safe chip ("Fresh for office — 11 days") · gem note when applicable |
| Chip row (collapsed) | Why This Works ▾ · laundry-aware note when constrained |
| Action row | **Wore it** (primary) · Swap one thing · Show another (swipe hint dots for 2 backups) |
| Overflow | Save for later · Share card · 👎 feedback |
States: empty (<8 items → upload coach w/ progress) · loading (skeleton hero <2s) · error (proven-favorite fallback + honest line) · low-confidence (two picks side-by-side: "Two good options today — your call") · weekend (casual default) · festival (overlay + alternate).

### 6.2 Wardrobe
| Zone | Content |
|---|---|
| Context strip | item count (plain, not gamified) · Add button · tag-check chip when pending |
| Board | Hanging Rail → Folded Shelf → Occasion & Traditional → Shoe Rack → Accessories Tray → Laundry basket (visually distinct) — horizontal virtualized shelves; sections collapsible; order user-fixed |
| Insight cards | ≤3, honest: most-worn · quiet gems ("4 pieces resting 6+ weeks") · laundry snapshot |
Sheets: item detail (photo, tags editable, state toggle, wear history, archive) · batch upload coach · bulk laundry-done.
States: empty (camera-first coach) · section-empty ("Shoe rack's waiting for its first pair") · upload-failure (retry, never lose photos) · tagging-in-progress (shimmer badges).

### 6.3 Style Me
| Zone | Content |
|---|---|
| Context strip | "What's the occasion?" |
| Answer card | 12-occasion grid (2 viewport-fit rows scrollable horizontally, priority order: Work, Casual, Festival, Family function, Wedding guest, Date, College, Travel, Dinner, Interview, Gym, Formal event) → after pick: ONE result card |
| Chip row | refine chips (single row, horizontal scroll): More formal · More casual · More modest · More comfortable · Ethnic/Western/Mixed · Weather-safe · Reuse favorites · Avoid repeats |
| Action row | Wear this · Swap one thing · Show another |
States: thin inventory (honest + closest alternative + wash note) · never-empty occasion (always offer loosen-occasion path).

### 6.4 Plan
| Zone | Content |
|---|---|
| Context strip | week strip (7 dots: planned/worn/empty) |
| Answer card | Tomorrow slot (planned outfit or "Plan tomorrow tonight" prompt) |
| Below | Saved Looks grid (2-col) |
States: all-empty (reassuring, non-mandatory copy) · reserved-item-in-wash warning (Phase 7+).

### 6.5 You
Sections (accordion, one open at a time to hold one-screen feel): Style preferences · What I've learned about you (each learned pref: statement + [That's right] [Remove]) · Daily Drop & notifications (time picker, pause) · Privacy & data (explanation, export, delete-all) · Wardrobe stats · Feedback history · Account · Premium (Phase 8+, eligibility-gated).

### 6.6 Sheets (global)
Swap sheet · Swap result · Post-wear laundry · Item detail · Feedback chips · Refine chips (Style Me) · Paywall sheet (Phase 8: price, what's included, trial CTA, "everything you have stays free" line).

### 6.7 Onboarding (6 screens + upload coach)
Each: serif headline, one input, why-we-ask line, skip, dots. Welcome → dressing category → age band → lifestyle → city → vibe chips → comfort/polish → drop time + push. Upload coach: camera batch, count progress, background tagging note, first-outfit celebration at 8 items.

---

## 7. Pro Version Guide (₹199/month · ₹1,999/year)

### 7.1 Principles
Sell depth, not the core. The free loop must remain genuinely good (WOM base). Pro appears only after the value gate: **10 Wore Its OR 14 active days.** Corrections (tag edits, feedback, laundry) are never paid. Interview + Wedding-guest occasions always free (reputation moments).

### 7.2 Tier matrix
| Capability | Free | Pro |
|---|---|---|
| Wardrobe items | 200 | Unlimited |
| Daily Drop | 1 hero + 2 backups | + regenerate drop, style-mood variants |
| Swap One Item | 3/day (first 3 sessions exempt) | Unlimited |
| Another Option | 2/drop | Unlimited |
| Style Me occasions | All 12 (Interview/Wedding always free) | + unlimited requests/day (free: 3/day) |
| Saved Looks | 20 | Unlimited + collections |
| Tomorrow Prep | Basic slot | Reservations + week planning + laundry forecast |
| Insights | 3 honest cards | Full: combination coverage, occasion readiness, gem map, wear economics |
| Weekly Recap | Summary card | Full recap + share formats |
| Festive | Overlay + alternate drop | Festive season pack: multi-event function planner |
| Priority generation | — | Drops generated first, faster swaps |

### 7.3 Pricing & billing
₹199/month · ₹1,999/year (≈2 months free — always show the math: "₹1,999/yr = ₹167/mo"). 7-day trial, card/UPI mandate via Razorpay; trial reminder on day 5 (in-app, honest: "Trial ends Thursday — here's what you used this week: 9 swaps, 2 planned mornings"). Cancel = 2 taps, no retention dark patterns, immediate confirmation, access till period end. Refund policy surfaced plainly.

### 7.4 Upgrade surfaces (all: one line, dismissible, 30-day silence on dismiss)
1. Cap-hit (swap/option) — the confidence-framed message + "Pro lets you keep exploring anyway."
2. Weekly Recap — "Pro adds the full picture: what worked, what's resting, what's ready."
3. Occasion success (post wedding/function Style Me use) — offer trial *after* the event date, never during panic.
4. Saved-Looks cap · Tomorrow Prep 3rd use · Insights card tap-through.
Banned: paywall before value gate, morning-flow interruptions, countdowns, fake scarcity, guilt.

### 7.5 Server-side enforcement
Entitlements table keyed to subscription state; every gated API validates server-side; UI state is cosmetic. Webhook lifecycle: created → trial → active → past_due (3-day grace, quiet banner) → cancelled. All events → PostHog funnel.

---

## 8. QA + Launch Checklist (Phase 8 exit)
- [ ] Golden engine tests green (incl. all cultural guards) · [ ] laundry violations = 0 across 500 simulated drops
- [ ] Scroll audit: every tab ≤1.3× viewport default · [ ] Lighthouse mobile ≥85 · [ ] reduced-motion pass
- [ ] Copy sweep: no jargon/guilt/shame/scarcity strings (grep the strings file) · [ ] a11y: font-scale reflow, contrast AA, tap targets
- [ ] RLS tests all new tables · [ ] delete-all verified end-to-end · [ ] payments E2E test mode incl. webhooks · [ ] entitlements enforced server-side
- [ ] Telemetry dashboard: activation, wore-it rate, swap-kept, cap-hits, trial funnel · [ ] Sentry clean of new-code errors
- [ ] CHANGELOG per phase · [ ] IDEAS.md triaged with CEO

*Companion documents: `WearWise-Product-Plan.md` (rationale & research) · `WearWise-Opus-Phase-Prompts.md` (paste-ready execution prompts).*

---

## 9. Release Process & Phase 3 Swap Contract (Addendum — 2026-07-10)

*Added after the Phase 3 swap-wiring fix. This addendum supersedes nothing above; it tightens release discipline and pins the corrected action separation. Where this addendum and an earlier section disagree on process, this addendum wins.*

### Local-First Phase Gate
Production is not the testing environment.
Required order:
1. Implement on a dedicated local branch.
2. Run the app on localhost.
3. Complete manual UI acceptance testing.
4. Run unit tests, typecheck, lint, and production build.
5. Fix all defects locally.
6. Commit only after the complete phase acceptance checklist passes.
7. Push and deploy once at phase completion.
8. Run a final production smoke test after deployment.

No phase or hotfix may be pushed merely because automated tests pass. Any user-facing interaction must also be manually verified on localhost.

### Swap One Thing
- Opens a slot picker first.
- Does not request candidates before slot selection.
- Replaces exactly one selected slot.
- Locks every non-selected item.
- Try another remains within the selected slot.
- Put back restores exact pre-swap item IDs.

### Another Option
- Is a separate full-outfit action.
- Uses a separate handler, route, loading state, and cap.
- Never opens the Swap One Thing sheet.
- Never uses the single-item swap route.

### Phase 3 Acceptance (Local-First addition)
- Automated structural wiring tests are necessary but do not replace a real localhost click test.
- Phase 3 cannot close until `npm run build` and the manual mobile-flow checklist pass.
