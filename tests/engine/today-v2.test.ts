// =====================================================================
// WearWise — Phase 4B "Today v2" wiring guard
// Source-structure assertions (same hand-rolled harness + reading pattern as
// dashboard-wiring.test.ts / swap-wiring.test.ts) proving the Today screen
// rebuild honors its contract: single hero, no legacy Best Pick, actions
// appear once, swap/another-option stay separate, all six required states
// (A-F) are represented, missing slots are stated honestly (never
// fabricated), no unavailable item can render, retry exists for every
// recoverable failure, bottom nav stays present via the shared shell, and
// the required telemetry events are wired without duplicate-fire risk.
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}

const PAGE = "src/app/(app)/dashboard/page.tsx";
const CARD = "src/app/(app)/dashboard/daily-drop-card.tsx";
const LOADING = "src/app/(app)/dashboard/loading.tsx";
const ERROR = "src/app/(app)/dashboard/error.tsx";
const PREPARE_BTN = "src/app/(app)/dashboard/prepare-drop-button.tsx";
const SAVE_BTN = "src/components/wearwise/SaveLookButton.tsx";
const WHY = "src/components/wearwise/WhyThisWorks.tsx";
const BEACON = "src/components/wearwise/ViewBeacon.tsx";
const SCREEN = "src/components/shell/Screen.tsx";
const SWAP_SHEET = "src/components/wearwise/SwapSheet.tsx";

const page = readFileSync(PAGE, "utf8");
const card = readFileSync(CARD, "utf8");
const loading = readFileSync(LOADING, "utf8");
const errorBoundary = readFileSync(ERROR, "utf8");
const prepareBtn = readFileSync(PREPARE_BTN, "utf8");
const saveBtn = readFileSync(SAVE_BTN, "utf8");
const why = readFileSync(WHY, "utf8");
const beacon = readFileSync(BEACON, "utf8");
const screen = readFileSync(SCREEN, "utf8");
const swapSheet = readFileSync(SWAP_SHEET, "utf8");

// =====================================================================
// 1. Today renders exactly one hero.
// =====================================================================
{
  const dropCards = (page.match(/<DailyDropCard/g) ?? []).length;
  ok("Today renders exactly one <DailyDropCard>", dropCards === 1, `count=${dropCards}`);
}

// =====================================================================
// 2. Legacy Best Pick strings remain absent.
// =====================================================================
{
  const legacyStrings = ["Best Pick Today", "RealBestPick", "SampleBestPick", "buildBestPick", "Look 1", "Look 2", "Look 3"];
  for (const s of legacyStrings) {
    ok(`page.tsx does not contain legacy string "${s}"`, !page.includes(s));
    ok(`daily-drop-card.tsx does not contain legacy string "${s}"`, !card.includes(s));
  }
  ok("no page-level wardrobe analytics grid (quick stats) on Today", !page.includes("items in wardrobe"));
  ok("no recent-requests list on Today", !page.includes("Recent requests"));
  ok("no new Pro/pricing prompt introduced on Today", !page.includes("/upgrade") && !card.includes("Pro unlock"));
}

// =====================================================================
// 3. Primary and secondary actions appear once.
// =====================================================================
{
  // Counting rendered interactive elements (onClick handlers / component
  // usages) rather than raw text, since the source legitimately mentions
  // these phrases again in doc comments above each handler.
  ok("exactly one primary action (onClick={wearThis})", (card.match(/onClick=\{wearThis\}/g) ?? []).length === 1);
  ok("exactly one Swap trigger (onClick={openSwap})", (card.match(/onClick=\{openSwap\}/g) ?? []).length === 1);
  ok("exactly one Another-option trigger (onClick={anotherOption})", (card.match(/onClick=\{anotherOption\}/g) ?? []).length === 1);
  ok("exactly one <SaveLookButton usage", (card.match(/<SaveLookButton/g) ?? []).length === 1);
}

// =====================================================================
// 4. Swap and Another option retain separate handlers.
// =====================================================================
{
  ok("openSwap handler defined", /function openSwap\(\)/.test(card));
  ok("anotherOption handler defined separately", /async function anotherOption\(\)/.test(card));
  const openSwapBody = card.slice(card.indexOf("function openSwap()"), card.indexOf("async function anotherOption"));
  ok("openSwap only opens the sheet (no fetch/api call)",
    openSwapBody.includes("setSwapOpen(true)") && !openSwapBody.includes("fetch(") && !openSwapBody.includes("/api/"));
  ok("anotherOption calls only the full-alternative route",
    /async function anotherOption\(\)[\s\S]*?\/api\/daily-drop\/another-option/.test(card));
  ok("Swap and Another Option wired to different onClick handlers",
    card.includes("onClick={openSwap}") && card.includes("onClick={anotherOption}"));
}

// =====================================================================
// 5. Complete, partial, constrained, stale, loading, and error states
//    are represented.
// =====================================================================
{
  // B/C — complete vs partial, distinguished honestly by missingSlots.
  ok("view carries missingSlots (drives complete vs partial)", card.includes("missingSlots: string[]"));
  ok("card computes isPartial from missingSlots (no fabrication)", card.includes("const isPartial = missingSlots.length > 0"));
  ok("partial badge is conditionally rendered only when isPartial", /\{isPartial && \(/.test(card));

  // D — constrained wardrobe (two flavors: needs-wardrobe onboarding, generic failed).
  ok("needs-wardrobe onboarding state present", page.includes("Build your wardrobe first"));
  ok("generic constrained state present with retry", page.includes("We couldn&apos;t prepare today&apos;s outfit") && page.includes("<PrepareDropButton compact />"));

  // E — stale outfit: regenerate-once contract still wired (Phase 3 hotfix 4, untouched).
  ok("stale outfit still triggers a bounded regenerate", page.includes("stale_outfit_blocked") && page.includes("stale_outfit_regenerated"));

  // A — loading skeleton exists and fakes nothing.
  ok("loading.tsx exists", existsSync(LOADING));
  ok("loading skeleton is aria-busy", loading.includes('aria-busy="true"'));
  ok("loading skeleton renders no real outfit copy", !loading.includes("Wear this") && !loading.includes("Today's outfit is ready"));

  // F — error boundary exists with a retry, no raw exception shown.
  ok("dashboard/error.tsx exists", existsSync(ERROR));
  ok("error boundary offers a retry", errorBoundary.includes("onClick={retry}") || errorBoundary.includes("onClick={reset}"));
  ok("error boundary never interpolates the raw error into user copy",
    !/\{error(\.message)?\}/.test(errorBoundary.replace(/console\.error\(error\)/, "")));
}

// =====================================================================
// 6. Missing slots are stated honestly.
// =====================================================================
{
  ok("missing-slot copy names the slot from real data (missingSlots.join)", card.includes("missingSlots.join"));
  ok("missing-slot copy tells the user to choose their own (never fabricates one)",
    card.includes("pick your own to finish this look"));
  ok("missingSlots is derived server-side from actual present slots, not hardcoded",
    page.includes('presentSlots.has("Shoes") ? [] : ["Shoes"]'));
}

// =====================================================================
// 7. No unavailable item can render.
// =====================================================================
{
  ok("dashboard still gates on validateOutfitCurrent before rendering", page.includes("await validateOutfitCurrent(supabase, userId, ids)"));
  ok("final render still built from validated members only", page.includes("const members: WardrobeItem[] = validity.items;"));
}

// =====================================================================
// 8. Retry is present for recoverable failure.
// =====================================================================
{
  ok("constrained-state retry (PrepareDropButton) present", page.includes("<PrepareDropButton compact />"));
  ok("PrepareDropButton fires today_retry_tapped", prepareBtn.includes('track("today_retry_tapped"'));
  ok("error-boundary retry fires today_retry_tapped", errorBoundary.includes('track("today_retry_tapped"'));
}

// =====================================================================
// 9. Bottom navigation remains present.
// =====================================================================
{
  ok("Today is wrapped in the shared Screen shell", page.includes("<Screen"));
  ok("Screen renders the shared TabBar (bottom nav)", screen.includes("<TabBar"));
}

// =====================================================================
// Canonical telemetry contract (Phase 4B telemetry-dedup fix).
// One event per user gesture. Each "required test" below corresponds 1:1
// to an item in the audit's fix instructions.
// =====================================================================

// ---- 1. openSwap contains exactly one canonical event: swap_opened. ----
{
  const openSwapBody = card.slice(card.indexOf("function openSwap()"), card.indexOf("async function anotherOption"));
  const trackCalls = openSwapBody.match(/track\(/g) ?? [];
  ok("openSwap fires exactly one track() call", trackCalls.length === 1, `count=${trackCalls.length}`);
  ok("openSwap's only event is swap_opened", openSwapBody.includes('track("swap_opened"'));
  ok("openSwap no longer fires daily_drop_swap_started (retired)", !openSwapBody.includes("daily_drop_swap_started"));
}

// ---- 2. SwapSheet does not emit an open event from mount/useEffect. ----
{
  const mountEffect = swapSheet.slice(swapSheet.indexOf("useEffect"), swapSheet.indexOf("if (!open) return null"));
  ok("SwapSheet's [open] mount effect fires NO track() call at all", !mountEffect.includes("track("));
  ok("swap_sheet_opened is retired from SwapSheet.tsx", !swapSheet.includes("swap_sheet_opened"));
}

// ---- 3. Another Option emits only another_option_tapped at intent time. ----
{
  const anotherOptionBody = card.slice(card.indexOf("async function anotherOption"), card.indexOf("const thumbs ="));
  ok("anotherOption fires another_option_tapped", anotherOptionBody.includes('track("another_option_tapped"'));
  ok("anotherOption no longer fires daily_drop_another_option_clicked (retired)",
    !anotherOptionBody.includes("daily_drop_another_option_clicked"));
  // Exactly one track() call before the fetch() — the intent event only;
  // no outcome-tracking calls were added inside this handler.
  const beforeFetch = anotherOptionBody.slice(0, anotherOptionBody.indexOf("fetch("));
  ok("exactly one track() call before the fetch in anotherOption", (beforeFetch.match(/track\(/g) ?? []).length === 1);
}

// ---- 4. Why This Works emits only why_this_works_opened on expansion. ----
{
  ok("why_this_works_opened wired", why.includes('track("why_this_works_opened"'));
  ok("why_expanded is retired from WhyThisWorks.tsx", !why.includes("why_expanded"));
  // Fired only inside the `if (next)` (collapsed -> expanded) branch.
  ok("why_this_works_opened fires only on expand (inside if (next))",
    /if \(next\) \{\s*track\("why_this_works_opened"/.test(why));
}

// ---- 5 & 7. Constrained Retry emits today_retry_tapped once; ----
//             daily_drop_prepare_result remains as the distinct outcome event.
{
  ok('"today_retry_tapped" wired with source: constrained',
    prepareBtn.includes('track("today_retry_tapped", { source: "constrained" })'));
  ok("exactly one today_retry_tapped call in prepare-drop-button.tsx",
    (prepareBtn.match(/track\("today_retry_tapped"/g) ?? []).length === 1);
  ok("daily_drop_prepare_clicked is retired from prepare-drop-button.tsx",
    !prepareBtn.includes("daily_drop_prepare_clicked"));
  ok("daily_drop_prepare_result remains (distinct outcome event, not retired)",
    prepareBtn.includes('track("daily_drop_prepare_result"'));
}

// ---- 6. Error-boundary Retry emits today_retry_tapped once. ----
{
  ok('"today_retry_tapped" wired with source: error_boundary',
    errorBoundary.includes('track("today_retry_tapped", { source: "error_boundary" })'));
  ok("exactly one today_retry_tapped call in dashboard/error.tsx",
    (errorBoundary.match(/track\("today_retry_tapped"/g) ?? []).length === 1);
}

// ---- 8. Slot selection emits swap_requested with slot, not swap_slot_selected. ----
{
  const loadCandidatesBody = swapSheet.slice(swapSheet.indexOf("async function loadCandidates"), swapSheet.indexOf("async function applySwap"));
  ok("loadCandidates fires swap_requested carrying the slot", /track\("swap_requested",\s*\{\s*slot:/.test(loadCandidatesBody));
  ok("exactly one track() call in loadCandidates (no duplicate open/select event)",
    (loadCandidatesBody.match(/track\(/g) ?? []).length === 1);
  ok("swap_slot_selected is retired from SwapSheet.tsx", !swapSheet.includes("swap_slot_selected"));
}

// ---- 9. Wear and Save intent/outcome events remain intact (not duplicates).
//        Phase 4C consolidation: daily_drop_worn used to fire at the exact
//        moment the (old, unguarded) client write succeeded. That moment is
//        now the server-validated /api/daily-drop/wear response, and
//        wear_confirmed fires there instead — same stage, one canonical
//        name. daily_drop_worn is retired (proven absent below). ----
{
  ok("wear_this_tapped (intent) still wired", card.includes('track("wear_this_tapped"'));
  ok("wear_confirmed (outcome) wired — consolidated from daily_drop_worn", card.includes('track("wear_confirmed"'));
  ok("daily_drop_worn is retired from daily-drop-card.tsx", !card.includes('track("daily_drop_worn"'));
  ok("save_look_tapped (intent) still wired", saveBtn.includes('track("save_look_tapped"'));
  ok("look_saved (outcome) still wired", saveBtn.includes('track("look_saved"'));
  ok("paywall_hit (outcome fork) still wired", saveBtn.includes('track("paywall_hit"'));
}

// ---- 10. today_viewed remains once-per-route-mount. ----
{
  ok('"today_viewed" wired unconditionally on Today', page.includes('event="today_viewed"'));
  ok("exactly one today_viewed call site (unconditional, not per-branch)",
    (page.match(/event="today_viewed"/g) ?? []).length === 1);
  ok('"today_constrained_viewed" still wired on both constrained branches',
    (page.match(/event="today_constrained_viewed"/g) ?? []).length === 2);
  ok("ViewBeacon effect depends only on `event` (no re-fire on rerender/refresh)",
    /useEffect\(\(\) => \{[\s\S]*?\}, \[event\]\)/.test(beacon));
  ok("ViewBeacon documents today_viewed's initial-state-only semantics",
    beacon.includes("describe the INITIAL rendered state for that route visit"));
  ok("ViewBeacon does not use sessionStorage/localStorage for dedup",
    // Check for actual API usage (a call/reference like `sessionStorage.`),
    // not just the word — the doc comment above legitimately explains that
    // these are NOT used, which would otherwise trip a bare substring check.
    !/\bsessionStorage\./.test(beacon) && !/\blocalStorage\./.test(beacon));
}

// =====================================================================
// Repo-wide proof: the six retired event strings do not exist ANYWHERE
// under src/ (not just in the files this fix touched). Recursive scan.
// =====================================================================
{
  const RETIRED = [
    "daily_drop_swap_started",
    "swap_sheet_opened",
    "daily_drop_another_option_clicked",
    "why_expanded",
    "daily_drop_prepare_clicked",
    "swap_slot_selected",
    // Phase 4C Wore It flow consolidation:
    "daily_drop_worn",
    "postwear_sheet_shown",
    "ask_me_less_activated",
  ];

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) out.push(...walk(full));
      else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  const files = walk("src");
  const hits: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const term of RETIRED) {
      if (text.includes(term)) hits.push(`${term} found in ${file}`);
    }
  }
  ok(`no retired event string appears anywhere under src/ (scanned ${files.length} files)`,
    hits.length === 0, hits.join("; "));
}

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
