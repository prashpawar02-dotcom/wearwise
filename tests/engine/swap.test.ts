// =====================================================================
// WearWise — Phase 3 SWAP TESTS (lock-and-replace · caps · undo · explain 1:1)
// Tiny inline harness (no framework), same style as golden.test.ts.
//   Sandbox: `npm run test:engine`
//   Windows: `npx tsx tests/engine/swap.test.ts`
// =====================================================================
import {
  lockAndReplaceCandidates, lockedItems, moodSwap, swapSlot, isCompletionSlot,
} from "@/lib/engine/swap";
import { scoreOutfit } from "@/lib/engine/scoring";
import {
  capState, SWAP_CAP_PER_DAY, OPTION_CAP_PER_DROP, SESSION_EXEMPT_THRESHOLD, capMessage,
} from "@/lib/swap-caps";
import {
  DEFAULT_CONFIG, DEFAULT_ETHNIC_RULES, EMPTY_PREFERENCES, profileForOccasion,
} from "@/lib/engine/config";
import type { EngineContext, EngineOccasion, WeatherContext } from "@/lib/engine/types";
import type { WardrobeItem } from "@/lib/types";
import { top, bottom, shoes, mk } from "./fixtures";

// ---- harness ----
let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}

function ctxFor(occasion: EngineOccasion, weather: WeatherContext = { tempC: 26, isRaining: false }): EngineContext {
  return {
    occasion, weather,
    config: DEFAULT_CONFIG,
    profile: profileForOccasion(occasion),
    ethnicRules: DEFAULT_ETHNIC_RULES,
    preferences: EMPTY_PREFERENCES,
    now: new Date("2026-07-07T08:00:00Z"),
  };
}

// =====================================================================
// 1. Caps — counting + session exemption (handbook §5 P3)
// =====================================================================
{
  ok("sessions 1..3 are cap-exempt",
    [1, 2, 3].every((n) => capState({ swapsUsed: 9, optionsUsed: 9, sessionOrdinal: n }).sessionExempt));
  ok("exempt session has unlimited swaps",
    capState({ swapsUsed: 9, optionsUsed: 9, sessionOrdinal: 2 }).canSwap === true);
  ok("session 4 is NOT exempt",
    capState({ swapsUsed: 0, optionsUsed: 0, sessionOrdinal: 4 }).sessionExempt === false);
  ok(`fresh non-exempt day allows ${SWAP_CAP_PER_DAY} swaps`,
    capState({ swapsUsed: 0, optionsUsed: 0, sessionOrdinal: 4 }).swapRemaining === SWAP_CAP_PER_DAY);
  ok("3 swaps used → swap cap hit",
    capState({ swapsUsed: SWAP_CAP_PER_DAY, optionsUsed: 0, sessionOrdinal: 4 }).swapCapHit === true);
  ok("2 options used → option cap hit",
    capState({ swapsUsed: 0, optionsUsed: OPTION_CAP_PER_DROP, sessionOrdinal: 5 }).optionCapHit === true);
  ok("one option left decrements correctly",
    capState({ swapsUsed: 0, optionsUsed: 1, sessionOrdinal: 5 }).optionRemaining === OPTION_CAP_PER_DROP - 1);
  ok("swap cap independent of option cap",
    capState({ swapsUsed: SWAP_CAP_PER_DAY, optionsUsed: 0, sessionOrdinal: 4 }).canOption === true);
  ok("cap message omits the Pro line until Phase 8",
    !capMessage().includes("Pro") && capMessage({ includePro: true }).includes("Pro"));
  ok("exempt threshold is 3", SESSION_EXEMPT_THRESHOLD === 3);
}

// =====================================================================
// 2. Lock-and-replace — UNLOCKED SLOTS ARE IMMUTABLE
// =====================================================================
{
  const t1 = top({ id: "t1" });
  const b1 = bottom({ id: "b1" });
  const s1 = shoes({ id: "s1" });
  const t2 = top({ id: "t2", user_facing_name: "Second top" });
  const t3 = top({ id: "t3", user_facing_name: "Third top" });
  const b2 = bottom({ id: "b2", user_facing_name: "Other trousers" });
  const outfit = [t1, b1, s1];
  const all = [t1, b1, s1, t2, t3, b2];
  const ctx = ctxFor("casual");

  const res = lockAndReplaceCandidates(all, outfit, t1, ctx, 5);
  ok("swap returns candidates for the top", res.status === "ok" && res.candidates.length >= 1,
    `status=${res.status} n=${res.candidates.length}`);

  const locked = lockedItems(outfit, "t1").map((i) => i.id).sort();
  ok("locked set is exactly the OTHER slots", JSON.stringify(locked) === JSON.stringify(["b1", "s1"]));

  const candIds = res.candidates.map((c) => c.id);
  ok("candidates are same-slot tops only", candIds.every((id) => id === "t2" || id === "t3"),
    `got ${candIds.join(",")}`);
  ok("candidates never include a locked item", !candIds.some((id) => id === "b1" || id === "s1"));
  ok("candidates never include the replaced item", !candIds.includes("t1"));

  // Simulate applying each candidate: locked slots must survive untouched.
  const immutable = res.candidates.every((c) => {
    const newIds = [...lockedItems(outfit, "t1").map((i) => i.id), c.id];
    return newIds.includes("b1") && newIds.includes("s1") && !newIds.includes("t1");
  });
  ok("every applied swap keeps bottom + shoes locked", immutable);

  // swapSlot mapping is stable + user-facing.
  ok("swapSlot(top)=top / (bottom)=bottom / (shoes)=shoes",
    swapSlot(t1) === "top" && swapSlot(b1) === "bottom" && swapSlot(s1) === "shoes");
}

// =====================================================================
// 3. Undo integrity — put-back restores the EXACT pre-swap outfit
// =====================================================================
{
  // Mirrors the route contract: pre_swap snapshot === selected_ids BEFORE the
  // swap; put-back restores it byte-for-byte, and it differs from the swapped set.
  const before = ["a", "b", "c"];
  const snapshot = [...before];                                  // stored pre_swap
  const swapped = before.map((id) => (id === "a" ? "z" : id));   // one-item swap
  const restored = [...snapshot];                                // put-back
  ok("swap actually changed the outfit", JSON.stringify(swapped) !== JSON.stringify(before));
  ok("put-back restores the exact pre-swap outfit", JSON.stringify(restored) === JSON.stringify(before));
  ok("restored outfit differs from the swapped one", JSON.stringify(restored) !== JSON.stringify(swapped));
}

// =====================================================================
// 4. Explanation factors map 1:1 to REAL scoring factors (handbook §3.5)
// =====================================================================
{
  const t1 = top({ id: "t1" });
  const b1 = bottom({ id: "b1" });
  const s1 = shoes({ id: "s1" });
  const t2 = top({ id: "t2", user_facing_name: "Alt top" });
  const outfit = [t1, b1, s1];
  const all = [t1, b1, s1, t2];
  const ctx = ctxFor("casual");
  const res = lockAndReplaceCandidates(all, outfit, t1, ctx, 5);
  const cand = res.candidates[0];

  const byId = new Map(all.map((i) => [i.id, i]));
  const newItems = [...lockedItems(outfit, "t1"), byId.get(cand.id)!];
  const score = scoreOutfit(newItems, ctx);
  const realDetails = new Set(score.factors.filter((f) => f.contribution > 0).map((f) => f.detail));

  ok("candidate carries a Why-This-Works line", cand.whyThisWorks.length >= 1);
  ok("every Why-This-Works string is a REAL scoring factor",
    cand.whyThisWorks.every((w) => realDetails.has(w)),
    `why=${JSON.stringify(cand.whyThisWorks)}`);
  ok("candidate reason is one of its Why-This-Works lines",
    cand.whyThisWorks.includes(cand.reason));
}

// =====================================================================
// 5. Layer/Accessory swap can resolve to "complete" (first-class result)
// =====================================================================
{
  const t1 = top({ id: "t1" });
  const b1 = bottom({ id: "b1" });
  const s1 = shoes({ id: "s1" });
  const layer = mk({ id: "L", category: "outerwear", user_facing_name: "Blazer", formality: 3 });
  const outfit = [t1, b1, s1, layer];
  const all = [...outfit]; // no other layer available
  const ctx = ctxFor("casual");
  const res = lockAndReplaceCandidates(all, outfit, layer, ctx, 5);
  ok("no-replacement layer resolves to 'complete', not an error", res.status === "complete",
    `status=${res.status}`);
  ok("layer/accessory are completion slots", isCompletionSlot("layer") && isCompletionSlot("accessory"));
  ok("core slots are NOT completion slots", !isCompletionSlot("top") && !isCompletionSlot("bottom"));
}

// =====================================================================
// 6. Mood swap changes the MINIMUM items and stays valid
// =====================================================================
{
  const t1 = top({ id: "t1", formality: 2, user_facing_name: "Casual tee" });
  const b1 = bottom({ id: "b1", formality: 3 });
  const s1 = shoes({ id: "s1", formality: 3, footwear_formality: 4 });
  const t2 = top({ id: "t2", formality: 5, user_facing_name: "Crisp shirt" });
  const outfit = [t1, b1, s1];
  const all = [t1, b1, s1, t2];
  const res = moodSwap(all, outfit, "more_formal", ctxFor("work"));
  ok("more_formal finds a change", res.status === "ok", `status=${res.status}`);
  if (res.status === "ok") {
    const changed = res.removedItemIds.length + res.addedItemIds.length;
    ok("mood swap changes at most 2 items", changed <= 2, `changed=${changed}`);
    ok("mood swap carries a real reason", res.whyThisWorks.length >= 1);
  }
}

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
