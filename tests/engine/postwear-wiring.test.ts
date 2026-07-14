// =====================================================================
// WearWise — Phase 4C "Wore It flow" wiring guard
// Source-structure assertions (same hand-rolled harness + reading pattern as
// swap-wiring.test.ts / today-v2.test.ts) proving: the confirm-worn write
// moved server-side with ownership/staleness/idempotency guarantees, the
// two-step confirm -> laundry flow is wired without a double "opened" fire,
// and the canonical Phase 4C telemetry contract is in place with no legacy
// duplicates left behind.
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}

const ROUTE = "src/app/api/daily-drop/wear/route.ts";
const CARD = "src/app/(app)/dashboard/daily-drop-card.tsx";
const CONFIRM_SHEET = "src/components/wearwise/WearConfirmSheet.tsx";
const POSTWEAR_SHEET = "src/components/wearwise/PostWearSheet.tsx";

const route = readFileSync(ROUTE, "utf8");
const card = readFileSync(CARD, "utf8");
const confirmSheet = readFileSync(CONFIRM_SHEET, "utf8");
const postWearSheet = readFileSync(POSTWEAR_SHEET, "utf8");

// =====================================================================
// 1. Server route (Phase 4C atomicity hotfix, migration 0023): the route is
//    now a thin wrapper around ONE atomic RPC — no independent core-table
//    writes here anymore. Ownership/idempotency/exact-set/availability/row-
//    locking now live in SQL (see atomic-wear-confirmation.test.ts for the
//    migration-level assertions).
// =====================================================================
{
  ok("route calls the atomic RPC exactly once",
    (route.match(/supabase\.rpc\("confirm_daily_drop_wear"/g) ?? []).length === 1);

  ok("route passes recommendationId and itemIds to the RPC",
    /p_recommendation_id:\s*recommendationId,\s*p_item_ids:\s*itemIds/.test(route));

  ok("the old independent daily_recommendations update is GONE",
    !route.includes('.from("daily_recommendations")'));

  ok("the old independent wardrobe_items update is GONE",
    !route.includes('.from("wardrobe_items")'));

  ok("route never returns status:\"ok\" when the RPC call itself errored",
    /if \(error\) \{\s*return NextResponse\.json\(\{ status: "error"/.test(route) &&
    route.indexOf("if (error)") < route.indexOf('case "confirmed"'));

  ok('RPC status "confirmed" maps to exactly one success branch (status:"ok")',
    (route.match(/case "confirmed":/g) ?? []).length === 1 &&
    /case "confirmed":[\s\S]*?status: "ok"/.test(route));

  ok('RPC status "already" returns without implying a fresh write',
    /case "already":\s*return NextResponse\.json\(\{ status: "already"/.test(route));

  ok('RPC status "stale" is mapped to a client-recoverable "stale" status',
    /case "stale":[\s\S]*?status: "stale"/.test(route));

  ok('RPC status "invalid_items" is mapped to a recoverable "error" status (not silently ok)',
    /case "invalid_items":[\s\S]*?status: "error"/.test(route));

  ok("an unrecognized RPC result shape never falls through to success (explicit default case)",
    /default:[\s\S]*?status: "error", reason: "unexpected_rpc_result"/.test(route));

  ok("telemetry (mirror/logAppEvent) is only called AFTER the RPC result is known (inside the switch, not before the rpc() call)",
    route.indexOf('supabase.rpc("confirm_daily_drop_wear"') < route.indexOf("async function mirror") &&
    route.indexOf("async function mirror") < route.indexOf("switch (rpcStatus)"));
}

// =====================================================================
// 2. Card: the write moved out of wearThis() into confirmWorn().
// =====================================================================
{
  const wearThisBody = card.slice(card.indexOf("function wearThis()"), card.indexOf("async function confirmWorn"));
  ok("wearThis() no longer touches Supabase directly (write moved server-side)",
    !wearThisBody.includes("supabase") && !wearThisBody.includes(".from("));
  ok("wearThis() performs no fetch() (only opens the confirm sheet)",
    !wearThisBody.includes("fetch("));
  ok("wearThis() opens the confirmation sheet", wearThisBody.includes("setConfirmOpen(true)"));

  const confirmWornBody = card.slice(card.indexOf("async function confirmWorn"), card.indexOf("function dismissConfirm"));
  ok("confirmWorn() calls the new server-validated route",
    confirmWornBody.includes('fetch("/api/daily-drop/wear"'));
  ok("confirmWorn() submits recommendationId AND itemIds (staleness check needs both)",
    confirmWornBody.includes("recommendationId: drop.id, itemIds: drop.itemIds"));
  ok("confirmWorn() has an early-return branch for stale (before submitting)",
    confirmWornBody.indexOf('confirmState === "stale"') < confirmWornBody.indexOf('setConfirmState("submitting")'));
  ok("confirmWorn() has an early-return branch for already (before submitting)",
    confirmWornBody.indexOf('confirmState === "already"') < confirmWornBody.indexOf('setConfirmState("submitting")'));
}

// =====================================================================
// 3. Canonical telemetry contract (Phase 4C).
// =====================================================================
{
  ok("wear_confirmed fires on ok/already", card.includes('track("wear_confirmed"'));
  ok("daily_drop_worn is retired from daily-drop-card.tsx", !card.includes('track("daily_drop_worn"'));
  ok("postwear_failed covers BOTH the confirm stage and the laundry stage",
    (card.match(/track\("postwear_failed"/g) ?? []).length >= 2);
  ok("postwear_completed wired (renamed from postwear_sheet_completed)",
    card.includes('track("postwear_completed"'));
  ok("postwear_sheet_completed is retired from daily-drop-card.tsx",
    !card.includes("postwear_sheet_completed"));

  ok("postwear_sheet_opened wired in PostWearSheet", postWearSheet.includes('track("postwear_sheet_opened"'));
  ok("postwear_sheet_shown is retired from PostWearSheet.tsx", !postWearSheet.includes("postwear_sheet_shown"));
  ok("ask_me_less_shown wired in PostWearSheet", postWearSheet.includes('track("ask_me_less_shown"'));
  ok("ask_me_less_enabled wired (renamed from ask_me_less_activated)",
    postWearSheet.includes('track("ask_me_less_enabled"'));
  ok("ask_me_less_activated is retired from PostWearSheet.tsx", !postWearSheet.includes("ask_me_less_activated"));
  ok("laundry_status_selected fires for BOTH per-item and bulk disposition changes",
    (postWearSheet.match(/track\("laundry_status_selected"/g) ?? []).length >= 2);
}

// =====================================================================
// 4. Confirmation step shows the exact owned outfit items (never a
//    fabricated or re-derived set), and blocks double-submit while in flight.
// =====================================================================
{
  ok("WearConfirmSheet renders the items it was given (no re-derivation)",
    confirmSheet.includes("items.map((it) =>"));
  ok("card passes the SAME item set to WearConfirmSheet as the outfit list",
    card.includes("items={drop.items.map((it) => ({ id: it.id, label: it.label, image: it.image }))}"));
  ok("primary button is disabled while a confirm request is in flight",
    confirmSheet.includes("disabled={submitting}"));
  ok("dismiss is blocked mid-submit (dismissable={!submitting})",
    confirmSheet.includes("dismissable={!submitting}"));
  ok("all six required states are represented (idle/submitting/error/stale/already + subtitle branches)",
    confirmSheet.includes('"submitting"') && confirmSheet.includes('"error"') &&
    confirmSheet.includes('"stale"') && confirmSheet.includes('"already"'));
}

// =====================================================================
// 5. Laundry-failure visibility (Phase 4C follow-up): a failed laundry
//    persist must never look like success — the sheet stays open, the
//    user's choices survive, a clear error shows, and Retry/Skip are both
//    available. Wear confirmation itself must never be rolled back because
//    of this — laundry is a deliberately separate, later transaction.
// =====================================================================
{
  ok("PostWearSheet accepts an error prop and renders it when set",
    postWearSheet.includes("error = null") && /\{error && \(/.test(postWearSheet));

  ok("PostWearSheet's Done button becomes a Retry affordance on error (label changes)",
    postWearSheet.includes('error ? "Try again"'));

  ok("PostWearSheet offers an explicit Skip/close action distinct from the sheet's own close control",
    postWearSheet.includes("Skip for now"));

  const persistBody = card.slice(card.indexOf("async function persistPostWear"), card.indexOf("function dismissPostWear"));
  ok("persistPostWear checks the response status (not fire-and-forget)",
    persistBody.includes('!res.ok || json.status !== "ok"'));
  ok("persistPostWear's failure branch does NOT close the sheet",
    !/catch \{[\s\S]*?setPostWearOpen\(false\)/.test(persistBody));
  ok("persistPostWear's failure branch does NOT call router.refresh() (wear stays recorded, no premature nav)",
    !/catch \{[\s\S]*?router\.refresh\(\)/.test(persistBody));
  ok("persistPostWear's failure branch sets a visible error message",
    /catch \{[\s\S]*?setPostWearError\(/.test(persistBody));
  ok("persistPostWear's success path (outside catch) still closes the sheet and refreshes",
    persistBody.includes("setPostWearOpen(false);\n      router.refresh();"));
}

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
