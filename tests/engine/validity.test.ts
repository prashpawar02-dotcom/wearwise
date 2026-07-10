// =====================================================================
// WearWise — Phase 3 HOTFIX TESTS (runtime outfit validity + slot labels)
// Tiny inline harness (no framework), same style as golden.test.ts.
// Proves: no in-wash / unavailable / archived / missing item is ever returned
// as wearable, availability restores let an item re-enter, hard-filter failures
// are caught, and swap slots are the canonical Top/Bottom/Shoes/Layer/Accessory.
//   Sandbox: `npm run test:engine`
// =====================================================================
import { validateOutfitCurrent } from "@/lib/outfit-validity";
import { swapSlot, slotLabel } from "@/lib/engine/swap";
import {
  DEFAULT_CONFIG, DEFAULT_ETHNIC_RULES, EMPTY_PREFERENCES, profileForOccasion,
} from "@/lib/engine/config";
import type { EngineContext, EngineOccasion, WeatherContext } from "@/lib/engine/types";
import type { WardrobeItem } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { top, bottom, shoes, kurta, belt, mk } from "./fixtures";

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

// Minimal Supabase stand-in: from().select().eq().eq().in() -> { data: rows }.
// The validator classifies against the returned rows; omit a row to simulate a
// missing / other-user (RLS-hidden) / deleted item.
function mockSupabase(rows: WardrobeItem[]): SupabaseClient {
  const result = Promise.resolve({ data: rows });
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    in: () => result,
  };
  return chain as unknown as SupabaseClient;
}

const USER = "user-1";

async function main() {
// =====================================================================
// 1. In-wash item is never wearable (the production blocker)
// =====================================================================
await (async () => {
  const t = top({ id: "t" });
  const b = bottom({ id: "b" });
  const s = shoes({ id: "s", availability_status: "in_wash" });
  const db = mockSupabase([t, b, s]);
  const r = await validateOutfitCurrent(db, USER, ["t", "b", "s"]);
  ok("outfit with in_wash item is INVALID", r.valid === false);
  ok("in_wash reason reported", r.invalid.some((x) => x.itemId === "s" && x.reason === "in_wash"));
  ok("in_wash item excluded from validItemIds", !r.validItemIds.includes("s"));
  ok("available items still surfaced", r.validItemIds.includes("t") && r.validItemIds.includes("b"));
})();

// =====================================================================
// 2. archived + unavailable + missing all fail closed with structured reasons
// =====================================================================
await (async () => {
  const a = top({ id: "a", availability_status: "archived" });
  const u = bottom({ id: "u", availability_status: "unavailable" });
  const db = mockSupabase([a, u]); // "gone" id is not returned -> missing
  const r = await validateOutfitCurrent(db, USER, ["a", "u", "gone"]);
  ok("archived reason", r.invalid.some((x) => x.itemId === "a" && x.reason === "archived"));
  ok("unavailable reason", r.invalid.some((x) => x.itemId === "u" && x.reason === "unavailable"));
  ok("missing/other-user reason (row not returned)", r.invalid.some((x) => x.itemId === "gone" && x.reason === "missing"));
  ok("nothing wearable here", r.validItemIds.length === 0 && r.valid === false);
})();

// =====================================================================
// 3. Fully-available outfit is valid; items preserve input order
// =====================================================================
await (async () => {
  const t = top({ id: "t" });
  const b = bottom({ id: "b" });
  const s = shoes({ id: "s" });
  const db = mockSupabase([s, t, b]); // returned out of order
  const r = await validateOutfitCurrent(db, USER, ["t", "b", "s"]);
  ok("all-available outfit is valid", r.valid === true);
  ok("validItemIds follow input order", JSON.stringify(r.validItemIds) === JSON.stringify(["t", "b", "s"]));
})();

// =====================================================================
// 4. Item made available again re-enters as valid
// =====================================================================
await (async () => {
  const s1 = shoes({ id: "s", availability_status: "in_wash" });
  const before = await validateOutfitCurrent(mockSupabase([top({ id: "t" }), bottom({ id: "b" }), s1]), USER, ["t", "b", "s"]);
  const s2 = shoes({ id: "s", availability_status: "available" });
  const after = await validateOutfitCurrent(mockSupabase([top({ id: "t" }), bottom({ id: "b" }), s2]), USER, ["t", "b", "s"]);
  ok("was invalid while in wash", before.valid === false);
  ok("valid again once available", after.valid === true && after.validItemIds.includes("s"));
})();

// =====================================================================
// 5. All available BUT the combination fails a hard filter -> hard_filter_failed
// =====================================================================
await (async () => {
  const k = kurta({ id: "k" });
  const b = bottom({ id: "b", cultural_tag: "indian_ethnic" });
  const belt1 = belt({ id: "belt" }); // belt + kurta is illegal
  const db = mockSupabase([k, b, belt1]);
  const r = await validateOutfitCurrent(db, USER, ["k", "b", "belt"], { ctx: ctxFor("ethnic") });
  ok("belt+kurta (all available) fails hard filter", r.valid === false);
  ok("hard_filter_failed reason reported", r.invalid.some((x) => x.reason === "hard_filter_failed"));
})();

// =====================================================================
// 6. Empty input is not valid (nothing to wear)
// =====================================================================
await (async () => {
  const r = await validateOutfitCurrent(mockSupabase([]), USER, []);
  ok("empty outfit is not valid", r.valid === false && r.validItemIds.length === 0);
})();

// =====================================================================
// 7. Slot-first swap: canonical slot labels for the picker
// =====================================================================
{
  const t = top({ id: "t" });
  const b = bottom({ id: "b" });
  const s = shoes({ id: "s" });
  const layer = mk({ id: "L", category: "outerwear" });
  const acc = mk({ id: "A", category: "accessory", user_facing_name: "Watch" });
  const label = (i: WardrobeItem) => { const sl = swapSlot(i); return sl ? slotLabel(sl) : null; };
  ok("Top slot label", label(t) === "Top");
  ok("Bottom slot label", label(b) === "Bottom");
  ok("Shoes slot label", label(s) === "Shoes");
  ok("Layer slot label", label(layer) === "Layer");
  ok("Accessory slot label", label(acc) === "Accessory");
}

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
}

void main();
