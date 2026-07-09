// =====================================================================
// WearWise — Laundry / Availability GOLDEN TESTS (Phase 2)
// Tiny inline harness (no framework). Verifies the non-negotiable rules:
//   • in_wash items never surface through any recommendation path
//   • state transitions keep in_wash_since honest
//   • soft auto-return timing (default 4d, dry-clean 14d)
//   • post-wear smart defaults
//   • constrained-inventory honesty note
//   Sandbox: `npm run test:engine` (tsc-compiled, esbuild-free)
//   Windows: `npx tsx tests/engine/laundry.test.ts`
// =====================================================================
import { recommendOutfits } from "@/lib/engine/recommend";
import { eligiblePool } from "@/lib/engine/filters";
import {
  DEFAULT_CONFIG, DEFAULT_ETHNIC_RULES, EMPTY_PREFERENCES, profileForOccasion,
} from "@/lib/engine/config";
import type { EngineContext, EngineOccasion, WeatherContext } from "@/lib/engine/types";
import type { WardrobeItem } from "@/lib/types";
import {
  toInWash, toAvailable, toArchived, toggleWashTransition,
  washDisposition, washCycleDaysFor, readyToReturn, countReadyToReturn,
  constrainedInventoryNote, isWearable, DEFAULT_WASH_CYCLE_DAYS, DRY_CLEAN_CYCLE_DAYS,
} from "@/lib/laundry";
import { top, bottom, shoes, kurta } from "./fixtures";

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
    now: new Date("2026-07-09T08:00:00Z"),
  };
}
const allResultIds = (r: ReturnType<typeof recommendOutfits>) =>
  [r.hero, ...r.backups].flatMap((o) => (o ? o.items.map((i) => i.id) : []));

const NOW = new Date("2026-07-09T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

// =====================================================================
// 1. in_wash never surfaces through the engine (drop / backups / Style Me)
// =====================================================================
{
  const items: WardrobeItem[] = [
    top({ id: "top_clean" }),
    top({ id: "top_dirty", availability_status: "in_wash", in_wash_since: daysAgo(1) }),
    bottom({ id: "bot" }),
    shoes({ id: "sho" }),
  ];
  // Per-item filter drops it.
  const { pool } = eligiblePool(items, ctxFor("casual"));
  ok("eligiblePool excludes in_wash item", !pool.some((i) => i.id === "top_dirty"));

  // Full pipeline (same path used by drop, backups, Style Me) never returns it.
  const res = recommendOutfits(items, ctxFor("casual"), 3);
  ok("recommendOutfits never surfaces in_wash item", !allResultIds(res).includes("top_dirty"),
    allResultIds(res).join(","));

  // archived + legacy unavailable are excluded too.
  const items2: WardrobeItem[] = [
    top({ id: "t_arch", availability_status: "archived" }),
    top({ id: "t_unav", availability_status: "unavailable" }),
    top({ id: "t_ok" }), bottom({ id: "b_ok" }), shoes({ id: "s_ok" }),
  ];
  const res2 = recommendOutfits(items2, ctxFor("casual"), 3);
  const ids2 = allResultIds(res2);
  ok("archived + unavailable never surface", !ids2.includes("t_arch") && !ids2.includes("t_unav"), ids2.join(","));
}

// =====================================================================
// 2. isWearable predicate (shared by swap candidates + Style Me + drop)
// =====================================================================
{
  ok("isWearable: available is wearable", isWearable(top({ id: "a" })));
  ok("isWearable: in_wash is not", !isWearable(top({ id: "b", availability_status: "in_wash" })));
  ok("isWearable: archived is not", !isWearable(top({ id: "c", availability_status: "archived" })));
}

// =====================================================================
// 3. State transitions keep in_wash_since honest
// =====================================================================
{
  const inWash = toInWash(NOW);
  ok("toInWash sets status + stamp", inWash.availability_status === "in_wash" && inWash.in_wash_since === NOW.toISOString());
  const avail = toAvailable();
  ok("toAvailable clears stamp", avail.availability_status === "available" && avail.in_wash_since === null);
  const arch = toArchived();
  ok("toArchived clears stamp", arch.availability_status === "archived" && arch.in_wash_since === null);

  const t1 = toggleWashTransition("available", NOW);
  ok("toggle available → in_wash (stamped)", t1.availability_status === "in_wash" && t1.in_wash_since === NOW.toISOString());
  const t2 = toggleWashTransition("in_wash", NOW);
  ok("toggle in_wash → available (cleared)", t2.availability_status === "available" && t2.in_wash_since === null);
}

// =====================================================================
// 4. Soft auto-return timing — default 4d, dry-clean 14d
// =====================================================================
{
  const tee3 = top({ id: "tee3", availability_status: "in_wash", in_wash_since: daysAgo(3) });
  const tee4 = top({ id: "tee4", availability_status: "in_wash", in_wash_since: daysAgo(4) });
  ok("tee at 3d not ready to return", !readyToReturn(tee3, DEFAULT_WASH_CYCLE_DAYS, NOW));
  ok("tee at 4d ready to return", readyToReturn(tee4, DEFAULT_WASH_CYCLE_DAYS, NOW));

  const saree13 = kurta({ id: "s13", category: "saree", availability_status: "in_wash", in_wash_since: daysAgo(13) });
  const saree14 = kurta({ id: "s14", category: "saree", availability_status: "in_wash", in_wash_since: daysAgo(14) });
  ok("dry-clean cycle is 14d", washCycleDaysFor({ category: "saree", sub_category: null, user_facing_name: "Silk saree", fabric: "silk" }) === DRY_CLEAN_CYCLE_DAYS);
  ok("saree at 13d not ready", !readyToReturn(saree13, DEFAULT_WASH_CYCLE_DAYS, NOW));
  ok("saree at 14d ready", readyToReturn(saree14, DEFAULT_WASH_CYCLE_DAYS, NOW));

  const wardrobe = [tee3, tee4, saree13, saree14, top({ id: "clean" })];
  ok("countReadyToReturn counts only matured items", countReadyToReturn(wardrobe, DEFAULT_WASH_CYCLE_DAYS, NOW) === 2);

  // An available item is never "ready to return".
  ok("available item never ready", !readyToReturn(top({ id: "av" }), DEFAULT_WASH_CYCLE_DAYS, NOW));
}

// =====================================================================
// 5. Post-wear smart defaults (tees/kurtas → wash; jeans/dupatta/layers → wardrobe)
// =====================================================================
{
  ok("tee → wash", washDisposition({ category: "top", sub_category: "t-shirt", user_facing_name: "Cotton tee" }) === "wash");
  ok("kurta → wash", washDisposition({ category: "kurta", sub_category: null, user_facing_name: "Cotton kurta" }) === "wash");
  ok("jeans → wardrobe", washDisposition({ category: "bottom", sub_category: "jeans", user_facing_name: "Blue jeans" }) === "wardrobe");
  ok("dupatta → wardrobe", washDisposition({ category: "dupatta", sub_category: null, user_facing_name: "Silk dupatta" }) === "wardrobe");
  ok("blazer (layer) → wardrobe", washDisposition({ category: "outerwear", sub_category: "blazer", user_facing_name: "Navy blazer" }) === "wardrobe");
  ok("shoes → wardrobe", washDisposition({ category: "footwear", sub_category: null, user_facing_name: "Loafers" }) === "wardrobe");
}

// =====================================================================
// 6. Constrained-inventory honesty note (>60% of a core category in wash)
// =====================================================================
{
  // 3 of 4 tops in the wash → constrained.
  const items: WardrobeItem[] = [
    top({ id: "t1", availability_status: "in_wash", in_wash_since: daysAgo(1) }),
    top({ id: "t2", availability_status: "in_wash", in_wash_since: daysAgo(1) }),
    top({ id: "t3", availability_status: "in_wash", in_wash_since: daysAgo(1) }),
    top({ id: "t4" }),
    bottom({ id: "b1" }), bottom({ id: "b2" }),
  ];
  ok("constrainedNote present when >60% tops in wash", constrainedInventoryNote(items, "office") != null);

  // Nothing in wash → no note.
  const clean: WardrobeItem[] = [top({ id: "a" }), top({ id: "b" }), bottom({ id: "c" })];
  ok("constrainedNote absent when wardrobe is clean", constrainedInventoryNote(clean) == null);

  // All tops in wash (0 clean) → not surfaced (nothing to build with in that category).
  const allDirty: WardrobeItem[] = [
    top({ id: "x", availability_status: "in_wash", in_wash_since: daysAgo(1) }),
    top({ id: "y", availability_status: "in_wash", in_wash_since: daysAgo(1) }),
    bottom({ id: "z" }),
  ];
  ok("constrainedNote absent when category fully depleted", constrainedInventoryNote(allDirty) == null);

  // The engine surfaces the note on its result payload.
  const res = recommendOutfits([...items, shoes({ id: "sho" })], ctxFor("work"), 3);
  ok("engine result carries constrainedNote", typeof res.constrainedNote === "string" && res.constrainedNote.length > 0,
    String(res.constrainedNote));
}

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("Failing:", fails.join(" | ")); process.exit(1); }
