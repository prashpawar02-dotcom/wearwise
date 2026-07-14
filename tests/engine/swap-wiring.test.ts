// =====================================================================
// WearWise — Swap wiring guard (Phase 3 blocker regression test)
// Source-structure assertions that lock in the fix: "Swap one thing" and
// "Another option" are SEPARATE buttons + handlers; the swap sheet is
// slot-first, single-item only, and never triggers the full-outfit route.
// Runs from the workspace root (the test runner's cwd), reading the real files.
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}

const sheet = readFileSync("src/components/wearwise/SwapSheet.tsx", "utf8");
const card = readFileSync("src/app/(app)/dashboard/daily-drop-card.tsx", "utf8");

// ---- SwapSheet is slot-first, single-item only ----
ok("sheet first view is the slot picker", sheet.includes('"What do you want to swap?"'));
ok("sheet subtitle promises the rest stays the same", sheet.includes("The rest of your outfit will stay the same."));
ok("sheet fetches slot candidates", sheet.includes("/api/daily-drop/swap-candidates"));
ok("sheet applies a single-item swap", sheet.includes('"/api/daily-drop/swap"'));
ok("sheet NEVER calls the full-outfit route", !sheet.includes("/api/daily-drop/another-option"));
ok("sheet has NO mood route", !sheet.includes("mood-swap"));
ok("sheet has NO auto-run initialAction", !sheet.includes("initialAction"));
ok("sheet only fetches candidates from loadCandidates (not on open)",
  // Anchor on the slot-picker reset (setView("slots")) rather than a
  // telemetry call — the mount effect intentionally emits NO event at all
  // as of the Phase 4B telemetry-dedup fix (swap_sheet_opened retired; the
  // canonical swap_opened event fires once, at intent time, from
  // DailyDropCard's openSwap(), before this sheet even mounts).
  /useEffect\([\s\S]*?setView\("slots"\)/.test(sheet) &&
  !/useEffect\([\s\S]*?fetch\(/.test(sheet.slice(sheet.indexOf("useEffect"), sheet.indexOf("if (!open) return null"))));
ok("sheet mount effect fires no telemetry (swap_sheet_opened retired)",
  !/useEffect\([\s\S]*?track\(/.test(sheet.slice(sheet.indexOf("useEffect"), sheet.indexOf("if (!open) return null"))));
ok("sheet result row has Keep it / Try another / Put back",
  sheet.includes(">Keep it<") && sheet.includes(">Try another<") && sheet.includes(">Put back<"));

// ---- Card: two separate buttons + two separate handlers ----
ok("card has openSwap handler", /function openSwap\(\)/.test(card));
ok("card has a SEPARATE anotherOption handler", /async function anotherOption\(\)/.test(card));
const openSwapBody = card.slice(card.indexOf("function openSwap()"), card.indexOf("async function anotherOption"));
ok("openSwap only opens the sheet (no fetch / route call)",
  openSwapBody.includes("setSwapOpen(true)") && !openSwapBody.includes("fetch(") && !openSwapBody.includes("/api/"));
ok("anotherOption calls ONLY the full-alternative route",
  /async function anotherOption\(\)[\s\S]*?\/api\/daily-drop\/another-option/.test(card));
ok("anotherOption does NOT open the swap sheet",
  !/async function anotherOption\(\)[\s\S]*?setSwapOpen\(true\)[\s\S]*?\n  \}/.test(card));
ok("Swap and Another Option are wired to DIFFERENT handlers",
  card.includes("onClick={openSwap}") && card.includes("onClick={anotherOption}"));
ok("the two buttons do not share one handler",
  !card.includes("onClick={openAnother}"));
ok("triggers are type=button", (card.match(/type="button"/g) ?? []).length >= 2);
ok("Another option has its own loading state (optionBusy)", card.includes("optionBusy"));
ok('button label is "Another option" (never "Swap one thing")',
  card.includes('"Another option"') && card.includes("Swap one thing"));

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
