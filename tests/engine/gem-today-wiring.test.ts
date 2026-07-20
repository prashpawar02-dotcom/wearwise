// =====================================================================
// WearWise — Today gem + swap/wear integration WIRING test (Phase 5, Module F).
// Source-string assertions (repo wiring-test style) that the real routes,
// loader, card and swap sheet are wired per contract. Behavioral logic is
// covered by today-gem.test.ts / gem-cooldown.test.ts / the local RPC script.
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

const swap = read("src/app/api/daily-drop/swap/route.ts");
const wear = read("src/app/api/daily-drop/wear/route.ts");
const loader = read("src/app/(app)/dashboard/page.tsx");
const card = read("src/app/(app)/dashboard/daily-drop-card.tsx");
const sheet = read("src/components/wearwise/SwapSheet.tsx");

// ---- Swap route ----
ok("swap: only records removal when the replaced item IS the shown gem", swap.includes("isGemRemoval = !!preSwapGem && preSwapGem.id === replaceItemId"));
ok("swap: passes operationId + expected post-swap ids to the RPC", swap.includes("p_operation_id: operationId") && swap.includes("p_expected_post_swap_ids: newIds"));
ok("swap: response-loss recovery branch exists (no re-persist)", swap.includes("Response-loss recovery") && swap.includes('recovered: true'));
ok("swap: recovery is gem-gated (preGem.id === replaceItemId)", /preGem && preGem\.id === replaceItemId/.test(swap));
ok("swap: RPC failure does not reverse the persisted swap", swap.includes('gem_removal_failed') && swap.includes('record_failed'));

// ---- Wear route: RPC-only, atomic contract intact ----
ok("wear: no direct daily_recommendations/wardrobe_items access", !wear.includes('.from("daily_recommendations")') && !wear.includes('.from("wardrobe_items")'));
ok("wear: gem determination + reset via reset_gem_skip_after_wear RPC", wear.includes('reset_gem_skip_after_wear'));
ok("wear: gemWorn returned only in the confirmed branch", /case "confirmed":[\s\S]*?gemWorn/.test(wear));
ok("wear: reset failure logged, never fails the confirmed wear", wear.includes("gem_skip_reset_failed"));

// ---- Today loader ----
ok("loader: gem computed AFTER final validation via qualifyingTodayGem", loader.includes("qualifyingTodayGem(") && loader.indexOf("validateOutfitCurrent(supabase, userId, ids)") < loader.indexOf("qualifyingTodayGem("));
ok("loader: gem only on complete outfit with no missing slots", /rec\.outfit_status === "complete" && missingSlots\.length === 0/.test(loader));
ok("loader: passes gem { itemId, note, renderKey } into the view", loader.includes("itemId: todayGem.id") && loader.includes("note: todayGemNote(") && loader.includes("renderKey: gemShownKey("));

// ---- Card: note secondary + gem_shown dedup + gem_worn gated ----
ok("card: renders the gem note (secondary, from drop.gem.note)", card.includes("{drop.gem.note}") && card.includes("never replaces Why This Works"));
ok("card: gem_shown fires once per renderKey (ref-guarded)", card.includes('track("gem_shown"') && card.includes("gemShownRef.current !== key"));
ok("card: gem_worn gated by shouldEmitGemWorn on the confirmed response", card.includes('shouldEmitGemWorn(data.status ?? ""') && card.includes('track("gem_worn"'));
ok("card: passes gemItemId to the wear request", card.includes("gemItemId: drop.gem?.itemId"));

// ---- Swap sheet: operation_id semantics ----
ok("sheet: operation_id generated at applySwap (accept), not on open/render", sheet.includes("op?.candidateId === candidateId ? op.id : crypto.randomUUID()"));
ok("sheet: reused on retry of same candidate, cleared on success", sheet.includes("setOp(null)") && sheet.includes("keep `op` so a retry of THIS candidate reuses the id"));
ok("sheet: double-submit guard", sheet.includes("if (!selected || busy) return;"));
ok("sheet: rest message shown from the persisted transition result", sheet.includes("data.gemRemoval?.showRestMessage") && sheet.includes("rest it for a while"));
ok("sheet: operation state reset when the sheet re-opens", /setOp\(null\); setRestMessage\(null\);/.test(sheet));

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
process.exit(0);
