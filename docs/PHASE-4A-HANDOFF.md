# WearWise — Phase 4A Continuation Brief

**Purpose:** Hand off Phase 4A (shared shell foundation + nav relabel) to a fresh
model session with zero re-investigation. Paste the master preamble +
`WearWise-Execution-Handbook.md` + this file to continue.

**Status at handoff:** Investigation complete. **No files created/edited. Nothing
committed.** Ready to build 4A.

---

## 0. Contract (do not violate)

- Source of truth: `WearWise-Execution-Handbook.md` §2 (Ground Truth), §3 (Global
  Build Rules), §5 Phase 4, §6.1, §6.7, §9 (addendum). Where repo disagrees with
  §2, repo wins — but flag it.
- **Scope this session = Phase 4A ONLY.** Build the shared One-Screen shell
  foundation + relabel the bottom nav. **Do NOT** start Today v2, Wore It, or
  Onboarding. **Do NOT** commit, push, deploy, or run migrations.
- Stop after 4A for manual localhost verification before 4B.
- Token-only styling (no raw hex in components). Every new surface eventually
  ships empty/loading/error states + PostHog events — but 4A is library + nav,
  so telemetry lands with the tabs in 4B.

## 1. Two decisions already locked (by CEO Prashant)

**Scope:** Foundation first. Phase 4A only. Do not begin 4B until the shell is
manually verified on localhost.

**IA:** Relabel tabs, keep routes. New bottom-nav labels map onto CURRENT stable
routes. Change ONLY labels, icons, active-tab logic, shell presentation. No route
renames, no folder moves, no redirects, no URL migration. Preserve deep links,
auth redirects, browser history, analytics events, tests, bookmarks.

Tab → route mapping:

| Label | Route (unchanged) | Notes |
|---|---|---|
| Today | `/dashboard` | Home icon |
| Wardrobe | `/wardrobe` | was "Closet" (Shirt icon) |
| Style Me | `/occasion/new` | was "Occasions" (Sparkles icon) |
| Plan | `/plan` | NEW tab slot; route already exists |
| You | `/profile` | was "Profile" (User icon) |

`/lookbook` leaves the tab bar (Saved Looks live inside Plan per §6.4) but the
route STAYS reachable (deep links preserved). Do not delete it.

## 2. Repo ground truth (verified against handbook)

- Stack matches §2: Next.js App Router + TS + Tailwind + shadcn/ui + Supabase +
  Vercel + Razorpay + PostHog + Sentry. Node v22, `node_modules` present.
- Migrations exist through **0022** (handbook §2 says "ends at 0019" — repo wins;
  Phases 1–3 already shipped 0020–0022). Phase 4A adds NO migrations.
- **No shared shell exists yet.** Each page renders its own `<main>` + a fixed
  `<BottomNav/>` at the end. Phase 4 introduces the reusable shell.
- Current `src/components/nav/bottom-nav.tsx` tabs: Today `/dashboard` · Closet
  `/wardrobe` · Occasions `/occasion/new` · Lookbook `/lookbook` · Profile
  `/profile`. Active logic: `pathname === href || pathname.startsWith(href + "/")`.
- `BottomNav` is imported in **7 pages**: dashboard, lookbook, outfits/[requestId],
  plan, profile, upgrade, wardrobe. **Editing `bottom-nav.tsx` in place propagates
  everywhere with zero page churn** — this is the intended approach for the relabel.

### Design tokens (`tailwind.config.ts`) — use these, no hex
- Surfaces: `ivory #F5F1EA`, `stone #EAE3D7`, `bone #FBF8F3`, `paper #FFFEFB`;
  semantic `background`/`card`/`border` via HSL vars.
- Text: `charcoal #1C1A17`, `graphite #6B655C`, `mist #A39E94`.
- Accents: `plum` (DEFAULT `#4A2C3D`, `.soft #6E4B5E`) = primary action;
  `champagne #B8915A`; `sage #8AA17C` = success/available; `cobalt`, `terracotta`,
  `lavender`.
- Radius: `rounded-ww-xs/sm/md/lg/xl` (6/10/16/22/28). Hero card = `ww-lg`(22),
  item = 14≈`ww-md`, chips = 10≈`ww-sm`.
- Shadow: `shadow-ww-xs/sm/md/lg/stack` (soft ambient only).
- Fonts: `font-sans` (Inter, UI), `font-serif` (Instrument Serif, display only).
- Utility classes seen in code: `ww-eyebrow` (letter-spaced label),
  `ww-display` (serif display). `animate-fade-in` (0.35s), `animate-sheet-in`
  (0.22s spring) exist. `letterSpacing.eyebrow = 0.16em`.
- App wrapper: `src/app/(app)/layout.tsx` = `mx-auto min-h-dvh w-full
  max-w-[440px] bg-background`. Keep. Screen shell lives inside this width.
- Screen padding 16 (`px-4`/`px-6` both used; dashboard uses `px-6`). 380px is the
  design baseline — everything must fit/behave at 380px wide.

### Test harness (important constraint)
- Runner: `scripts/run-engine-tests.mjs` (`npm run test:engine`). It compiles a
  **pure TS subset** via `tsconfig.test.json` with `tsc` (no React/JSX/DOM), then
  runs compiled suites. **It only scans `tests/engine/*.test.js`.**
- Therefore shell tests MUST be pure logic (no React import). Put testable logic
  in plain modules and test those. Place the test at `tests/engine/shell.test.ts`
  (runner only looks in `tests/engine`) OR generalize the runner to scan all
  `tests/**`. Simplest: `tests/engine/shell.test.ts`.
- Any new pure module + the new test file must be ADDED to the `include` array in
  `tsconfig.test.json`. (Note: the `include` list currently ends mid-token in a
  raw dump — read the real file; it lists engine libs + tests/engine suites.)
- Existing test suites to keep green: golden, laundry, swap, validity,
  dashboard-wiring, swap-wiring.
- Full `tsc --noEmit` typecheck: `npm run typecheck`. Lint: `npm run lint`.

### Environment quirks (from memory, still true)
- **Mount sync quirk (RECURRED Jul 10):** Edit/Write to EXISTING files truncate
  on the mount; a large Write (~470 lines) truncated at ~448 even on Windows. For
  existing or large files use bash heredoc: `cat > "path" <<'EOF' ... EOF`. New
  SMALL files via Write are fine. bash CANNOT `rm` on the mount.
- **Sandbox npm blocked:** can't install packages. Deps are vendored in
  `node_modules`, so `tsc`/`test:engine` DO run. `next dev`/build won't run in the
  sandbox — production build + manual localhost testing are the USER's steps (§9
  Local-First gate). Prefer ZERO new dependencies (lucide-react already present).
- Bash path prefix for the workspace:
  `/sessions/<id>/mnt/WearWise Product + Build/`. Read/Write tools use the Windows
  path `G:\projects\WearWise\WearWise Product + Build\...`.

## 3. Phase 4A deliverables (build these, in order)

Everything below is NEW library code + one in-place nav edit. Do not wire the
shell into any tab's page yet (that's 4B).

1. **`src/lib/shell/tabs.ts`** (pure, no React) — exports:
   - `APP_TABS`: ordered array `{ key, label, href, icon }` where `icon` is a
     STRING key (e.g. `"today" | "wardrobe" | "styleme" | "plan" | "you"`), not a
     component (keeps module pure for the test compile). Labels/hrefs per §1 table.
   - `isTabActive(pathname, tab)`: pure fn. Preserve current behavior
     (`pathname === href || pathname.startsWith(href + "/")`). Ensure Style Me is
     active on `/occasion/...`, Plan on `/plan`, You on `/profile`, etc.

2. **`src/lib/shell/scroll-audit.ts`** (pure) — exports:
   - `SCROLL_BUDGET_FACTOR = 1.3`
   - `exceedsViewport(contentHeight, viewportHeight, factor = 1.3): boolean`
     (`contentHeight > viewportHeight * factor`). Testable threshold.

3. **`src/components/shell/TabBar.tsx`** (client) — renders `APP_TABS` using
   `isTabActive` + a lucide icon map (`today→Home`, `wardrobe→Shirt`,
   `styleme→Sparkles`, `plan→CalendarDays`, `you→User`). Active = `text-plum`,
   stroke 2.4; inactive `text-muted-foreground`, stroke 1.8. Fixed bottom, tap
   targets ≥44px (§3.8). This is the presentation the nav becomes.

4. **Rewrite `src/components/nav/bottom-nav.tsx` internals** to use
   `APP_TABS`/`isTabActive` and the new labels/icons — but KEEP the exported name
   `BottomNav` and its import path so all 7 pages keep working untouched. (Either
   re-export `TabBar` as `BottomNav`, or update this file directly. Do not change
   its public API.)

5. **`src/components/shell/Screen.tsx`** + presentational subcomponents
   (`ContextStrip.tsx`, `AnswerCard.tsx`, `ActionRow.tsx`) implementing the fixed
   anatomy (§4.3): context strip (sticky top, 1 line) → scrollable answer region
   (flex-1) → action row (sticky, thumb zone, bottom ~40%) → `<BottomNav/>`.
   Slot-based API, e.g. `<Screen contextStrip={..} actionRow={..}>{children}</Screen>`.
   380px baseline, `max-w` matching app layout, `px-4`, token-only. No hooks in
   Screen except mounting `<ScrollAudit/>`.

6. **`src/components/shell/ScrollAudit.tsx`** (client, DEV-ONLY) — measures content
   vs viewport height (useEffect + ResizeObserver), `console.warn`s via
   `exceedsViewport` when a tab exceeds 1.3× viewport. Hard no-op when
   `process.env.NODE_ENV === "production"`. Respect `prefers-reduced-motion` is
   n/a here (no animation).

7. **`tests/engine/shell.test.ts`** (pure) — assert: exactly 5 tabs in order with
   correct labels+hrefs; `isTabActive` true/false cases incl. Style Me on
   `/occasion/new/xyz`, Plan on `/plan`, no cross-activation (Today not active on
   `/wardrobe`); `exceedsViewport` boundary cases (`==1.3×` false, `>1.3×` true).
   Follow the existing hand-rolled assert style in `tests/engine/*.test.ts` (no
   test framework — they self-run and `process.exit(1)` on failure).

8. **Update `tsconfig.test.json`** `include`: add `src/lib/shell/tabs.ts`,
   `src/lib/shell/scroll-audit.ts`, `tests/engine/shell.test.ts`.

## 4. Verification before stopping

- `npm run test:engine` — all suites green incl. new `shell.test.ts`.
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- Do NOT build/commit. Tell CEO the manual localhost check for 4A:
  open each of the 5 tabs, confirm labels `Today · Wardrobe · Style Me · Plan ·
  You`, correct active highlight per route, `/lookbook` still reachable directly,
  no broken deep links. Then 4B (Today v2) can begin.

## 5. Explicitly OUT of 4A (log to IDEAS.md only if discovered, don't build)
Today v2 hero collage, expand-in-place chip row, swipe backups + dots, overflow
menu, Wore It sage-sweep + post-wear sheet + 8s undo toast, low-confidence
dual-pick, proven-favorite error fallback, weekend/no-push states, Onboarding v2
(7 screens) + upload coach, new telemetry events, wiring Screen into real pages.

## 6. Acceptance output format (end of 4A)
Print the §5 Phase 4 checklist items RELEVANT to 4A with pass/fail (shell renders
5 tabs; 380px baseline; scroll-audit dev warning; tests green; tsc/lint clean;
routes/deep-links preserved), and list anything incomplete honestly.
