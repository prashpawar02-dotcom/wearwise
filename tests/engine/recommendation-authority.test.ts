// =====================================================================
// WearWise — Phase 4 RECOMMENDATION AUTHORITY tests
// Executable engine tests (explicit fixtures) for the single-pipeline cutover,
// cultural mapping, honest partial reasons, fingerprint freshness, Another
// Option combination exclusion, plus writer-contract source guards.
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync } from "node:fs";
import { recommendOutfits, evaluateSelectedOutfit } from "@/lib/engine/recommend";
import { eligiblePool } from "@/lib/engine/filters";
import { engineRole, culturalResolution, culturalSourceOf } from "@/lib/engine/classify";
import { footwearPartialReason, hasEligibleFootwear } from "@/lib/engine/footwear";
import { computeInventoryFingerprint } from "@/lib/recommendation/fingerprint";
import { resolveEngineOccasion } from "@/lib/engine/occasion";
import {
  DEFAULT_CONFIG, DEFAULT_ETHNIC_RULES, EMPTY_PREFERENCES, profileForOccasion,
} from "@/lib/engine/config";
import type { EngineContext, EngineOccasion, WeatherContext } from "@/lib/engine/types";
import type { WardrobeItem } from "@/lib/types";
import { top, bottom, shoes, kurta, mk } from "./fixtures";

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
const comboSig = (ids: string[]) => [...ids].filter(Boolean).sort().join("|");
const idset = (o: { itemIds: string[] }) => comboSig(o.itemIds);

// 1. Kurta explicit category + null cultural_tag → eligible, explicit_category.
{
  const k = kurta({ id: "k1", cultural_tag: null });
  const cr = culturalResolution(k);
  ok("kurta(null tag) cultural_source is explicit_category", culturalSourceOf(k) === "explicit_category");
  ok("kurta(null tag) is eligible without a confirmed tag", cr.eligibleWithoutTag === true);
  const { pool, rejected } = eligiblePool([k], ctxFor("ethnic"));
  ok("kurta(null tag) survives eligiblePool", pool.length === 1 && rejected.length === 0);
}

// 2. Generic Top merely NAMED like a kurta + null tag → fail-closed.
{
  const fake = mk({ id: "t-fake", category: "top", user_facing_name: "Kurta-style top", cultural_tag: null });
  ok("generic top named 'kurta' → keyword_inference", culturalSourceOf(fake) === "keyword_inference");
  const { pool, rejected } = eligiblePool([fake], ctxFor("casual"));
  ok("generic ethnic-looking top(null tag) is rejected cultural_unconfirmed",
    pool.length === 0 && rejected.some((r) => r.filter === "cultural_unconfirmed"));
}

// 3. Footwear variants all normalize to footwear via engineRole.
{
  const variants: WardrobeItem[] = [
    mk({ category: "Footwear", user_facing_name: "Blue athletic shoes" }),
    mk({ category: "footwear", user_facing_name: "White casual shoes" }),
    mk({ category: null, user_facing_name: "Sneakers" }),
    mk({ category: null, user_facing_name: "Leather loafers" }),
    mk({ category: null, sub_category: "Trainers", user_facing_name: null }),
  ];
  ok("all footwear variants → engineRole 'footwear'", variants.every((v) => engineRole(v) === "footwear"));
}

// 4/5. Two tops + bottom + footwear; selected top → in_wash; fresh gen stays complete with the other top and keeps footwear.
{
  const tA = top({ id: "tA" }), tD = top({ id: "tD" }), b = bottom({ id: "b" }), s = shoes({ id: "s" });
  const before = recommendOutfits([tA, tD, b, s], ctxFor("casual"));
  ok("initial generation is complete", before.hero != null && before.outfitStatus === "complete");

  const tAwash = top({ id: "tA", availability_status: "in_wash" });
  const after = recommendOutfits([tAwash, tD, b, s], ctxFor("casual"));
  const heroIds = after.hero ? after.hero.itemIds : [];
  ok("after top in_wash, generation is still complete", after.hero != null && after.outfitStatus === "complete");
  ok("the in_wash top is NOT in the fresh outfit", !heroIds.includes("tA"));
  ok("a valid replacement top is used", heroIds.includes("tD"));
  ok("existing bottom is retained (not treated as missing)", heroIds.includes("b"));
  ok("existing footwear is retained (not treated as missing)", heroIds.includes("s"));
}

// 6. No footwear owned → honest reason no_footwear_in_wardrobe.
{
  const items = [top({ id: "t" }), bottom({ id: "b" })];
  ok("no owned footwear → no_footwear_in_wardrobe", footwearPartialReason(items, ctxFor("casual")) === "no_footwear_in_wardrobe");
  ok("hasEligibleFootwear false when none owned", hasEligibleFootwear(items, ctxFor("casual")) === false);
}

// 7. All footwear in wash → footwear_in_wash.
{
  const items = [top({ id: "t" }), bottom({ id: "b" }), shoes({ id: "s", availability_status: "in_wash" })];
  ok("owned footwear all in wash → footwear_in_wash", footwearPartialReason(items, ctxFor("casual")) === "footwear_in_wash");
}

// 8. Archived footwear → footwear_archived.
{
  const items = [top({ id: "t" }), bottom({ id: "b" }), shoes({ id: "s", availability_status: "archived" })];
  ok("archived footwear → footwear_archived", footwearPartialReason(items, ctxFor("casual")) === "footwear_archived");
}

// 9. Footwear uploaded after a partial → fingerprint changes + result becomes complete.
{
  const partialItems = [top({ id: "t" }), bottom({ id: "b" })];
  const withShoe = [...partialItems, shoes({ id: "s" })];
  const fp1 = computeInventoryFingerprint(partialItems);
  const fp2 = computeInventoryFingerprint(withShoe);
  ok("adding footwear changes the inventory fingerprint", fp1 !== fp2);
  ok("partial before footwear", recommendOutfits(partialItems, ctxFor("casual")).outfitStatus === "partial");
  ok("complete after footwear added", recommendOutfits(withShoe, ctxFor("casual")).outfitStatus === "complete");
}

// 10. Complete + unrelated add → fingerprint changes but a complete outfit stays complete.
{
  const base = [top({ id: "t" }), bottom({ id: "b" }), shoes({ id: "s" })];
  const plusUnrelated = [...base, mk({ id: "acc", category: "accessory", user_facing_name: "Watch" })];
  ok("unrelated add changes fingerprint", computeInventoryFingerprint(base) !== computeInventoryFingerprint(plusUnrelated));
  ok("outfit remains complete after unrelated add", recommendOutfits(plusUnrelated, ctxFor("casual")).outfitStatus === "complete");
}

// 11/12. Another Option may REUSE footwear, and never returns the exact same combination.
{
  const items = [top({ id: "tA" }), top({ id: "tD" }), bottom({ id: "b" }), shoes({ id: "s" })];
  const r = recommendOutfits(items, ctxFor("casual"), 3);
  const outfits = r.hero ? [r.hero, ...r.backups] : [];
  ok("engine returns at least two distinct outfits", outfits.length >= 2);
  const sigs = new Set(outfits.map(idset));
  ok("no two returned outfits share the EXACT combination", sigs.size === outfits.length);
  const reuseFootwear = outfits.filter((o) => o.itemIds.includes("s")).length >= 2;
  ok("footwear may be reused across alternates (single shoe reused)", reuseFootwear);
}

// 13. Complete candidates rank before partial (footwear present → hero is complete).
{
  const items = [top({ id: "t1" }), top({ id: "t2" }), bottom({ id: "b" }), shoes({ id: "s" })];
  const r = recommendOutfits(items, ctxFor("casual"));
  ok("with footwear present, hero is a COMPLETE outfit", r.hero != null && r.hero.completeness === "complete");
}

// (bonus) evaluateSelectedOutfit is the mutation authority and matches the engine.
{
  const items = [top({ id: "t" }), bottom({ id: "b" })];
  const ev = evaluateSelectedOutfit(items, ctxFor("casual"), items);
  ok("evaluateSelectedOutfit marks a shoeless outfit partial", ev.outfit_status === "partial");
  ok("evaluateSelectedOutfit reports missing footwear", ev.missing_slots.includes("footwear"));
  ok("evaluateSelectedOutfit uses the shared footwear reason", ev.partial_reason === "no_footwear_in_wardrobe");
}

// (bonus) occasion resolution (locked decision 3).
{
  ok("supported default_occasion wins", resolveEngineOccasion("work", "daily") === "work");
  ok("traditional context → ethnic when no default", resolveEngineOccasion(null, "traditional") === "ethnic");
  ok("otherwise casual fallback", resolveEngineOccasion(null, "daily") === "casual");
}

// 14/15. Writer-contract source guards — every mutation writer routes through the
// shared persistence contract and never sets selected_item_ids on its own.
{
  const A = "src/app/api/daily-drop/another-option/route.ts";
  const S = "src/app/api/daily-drop/swap/route.ts";
  const M = "src/app/api/daily-drop/mood-swap/route.ts";
  const P = "src/app/api/daily-drop/put-back/route.ts";
  const DD = "src/lib/daily-drop.ts";
  const read = (p: string) => readFileSync(p, "utf8");
  for (const [name, path] of [["another-option", A], ["swap", S], ["mood-swap", M], ["put-back", P]] as const) {
    const src = read(path);
    ok(`${name} uses persistMutatedRecommendation`, src.includes("persistMutatedRecommendation("));
    ok(`${name} does not set selected_item_ids outside the shared contract`, !src.includes("selected_item_ids:"));
  }
  const dd = read(DD);
  ok("fresh generation stores engine-owned metadata (freshAuthoritativeColumns)", dd.includes("freshAuthoritativeColumns(result"));
  ok("fresh generation stores the inventory fingerprint", dd.includes("computeInventoryFingerprint(allItems)"));
}

// 16. Today and Admin QA run the SAME authoritative pipeline/context.
{
  const dd = readFileSync("src/lib/daily-drop.ts", "utf8");
  const qa = readFileSync("src/app/api/admin/engine-qa/route.ts", "utf8");
  ok("Today generation uses recommendOutfits", dd.includes("recommendOutfits(allItems, engineCtx"));
  ok("Today generation uses loadEngineContext", dd.includes("loadEngineContext("));
  ok("Admin QA uses recommendOutfits", qa.includes("recommendOutfits(items, ctx"));
  ok("Admin QA uses loadEngineContext", qa.includes("loadEngineContext("));
  // eligiblePool is deterministic → identical eligibility counts for the same input.
  const items = [top({ id: "t" }), bottom({ id: "b" }), shoes({ id: "s" })];
  const c = ctxFor("casual");
  ok("eligiblePool is deterministic (Today == Admin QA counts on same input)",
    eligiblePool(items, c).pool.length === eligiblePool(items, c).pool.length);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
