// =====================================================================
// WearWise — Engine v2 GOLDEN TESTS (Phase 1 + hotfixes)
// Tiny inline harness (no framework). Verifies the non-negotiable rules.
//   Sandbox: `npm run test:engine` (tsc-compiled, esbuild-free)
//   Windows: `npx tsx tests/engine/golden.test.ts`
// =====================================================================
import { recommendOutfits } from "@/lib/engine/recommend";
import { eligiblePool, candidateRejection } from "@/lib/engine/filters";
import { engineRole, isActivewear, formalityOf } from "@/lib/engine/classify";
import { validateOutfitItems } from "@/lib/outfitValidation";
import {
  DEFAULT_CONFIG, DEFAULT_ETHNIC_RULES, EMPTY_PREFERENCES, profileForOccasion,
} from "@/lib/engine/config";
import type { EngineContext, EngineOccasion, WeatherContext } from "@/lib/engine/types";
import type { WardrobeItem } from "@/lib/types";
import { top, bottom, shoes, kurta, dupatta, dress, belt, mk } from "./fixtures";

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
const idsOf = (o: { items: WardrobeItem[] } | null) => (o ? o.items.map((i) => i.id) : []);
const allResultIds = (r: ReturnType<typeof recommendOutfits>) =>
  [r.hero, ...r.backups].flatMap((o) => idsOf(o));

// =====================================================================
// 1. belt + kurta blocked (candidate reject + 3-place validator)
// =====================================================================
{
  const items = [kurta({ id: "k" }), bottom({ id: "b", cultural_tag: "indian_ethnic" }), belt({ id: "belt" })];
  const rej = candidateRejection(items, ctxFor("ethnic"));
  ok("belt+kurta rejected by candidate filter", rej != null, rej ? "" : "not rejected");
  ok("belt+kurta invalid in 3-place validator", validateOutfitItems(items).valid === false);
}

// =====================================================================
// 2. dupatta never on a western top + pants
// =====================================================================
{
  const items = [top({ id: "t" }), bottom({ id: "b" }), dupatta({ id: "d" })];
  ok("dupatta on western rejected by candidate filter", candidateRejection(items, ctxFor("casual")) != null);
  ok("dupatta on western invalid in 3-place validator", validateOutfitItems(items).valid === false);
  const okItems = [kurta({ id: "k" }), bottom({ id: "b2", cultural_tag: "indian_ethnic" }), dupatta({ id: "d2" })];
  ok("dupatta WITH kurta anchor stays valid", validateOutfitItems(okItems).valid === true);
}

// =====================================================================
// 3. wool / velvet blocked at >= 30C, allowed when cool
// =====================================================================
{
  const wool = top({ id: "wool", fabric: "wool", user_facing_name: "Wool sweater" });
  const hotPool = eligiblePool([wool], ctxFor("casual", { tempC: 32, isRaining: false })).pool;
  ok("wool excluded at 32C", hotPool.length === 0);
  const coolPool = eligiblePool([wool], ctxFor("casual", { tempC: 18, isRaining: false })).pool;
  ok("wool allowed at 18C", coolPool.length === 1);
}

// =====================================================================
// 4. in_wash item never surfaces in any recommendation path
// =====================================================================
{
  const items = [
    top({ id: "clean-top" }), top({ id: "washing", availability_status: "in_wash", user_facing_name: "Fav top" }),
    bottom({ id: "b1" }), bottom({ id: "b2" }), shoes({ id: "s1" }),
  ];
  const r = recommendOutfits(items, ctxFor("casual"), 3);
  ok("in_wash item never appears in results", !allResultIds(r).includes("washing"));
  ok("a valid outfit still forms without the washed item", r.hero != null);
}

// =====================================================================
// 5. interview outfits: every item formality >= 4
// =====================================================================
{
  const items = [
    top({ id: "formal-shirt", formality: 5, footwear_formality: null, user_facing_name: "Formal shirt", occasion_tags: [] }),
    bottom({ id: "formal-trouser", formality: 4, user_facing_name: "Tailored trousers" }),
    shoes({ id: "formal-shoes", formality: 4, footwear_formality: 5, user_facing_name: "Oxford shoes" }),
    top({ id: "casual-tee", formality: 1, user_facing_name: "Casual tee" }),
    bottom({ id: "jeans", formality: 2, user_facing_name: "Jeans" }),
  ];
  const r = recommendOutfits(items, ctxFor("interview"), 3);
  ok("interview produced a hero", r.hero != null);
  const belowFour = r.hero != null ? r.hero.items.filter((i) => (formalityOf(i) ?? 0) < 4) : [];
  ok("interview hero: all items formality >= 4", r.hero != null && belowFour.length === 0, belowFour.map((i) => i.id).join(","));
  ok("interview never uses the casual tee or jeans", !allResultIds(r).includes("casual-tee") && !allResultIds(r).includes("jeans"));
}

// =====================================================================
// 6. gym returns activewear only (+ trainers), no accessories
// =====================================================================
{
  const items = [
    mk({ id: "gym-tee", category: "top", user_facing_name: "Active running tee", fabric: "dri-fit", formality: 1 }),
    mk({ id: "joggers", category: "bottom", user_facing_name: "Athletic joggers", formality: 1 }),
    mk({ id: "trainers", category: "footwear", user_facing_name: "Trainers", footwear_formality: 1 }),
    top({ id: "office-shirt", formality: 4, user_facing_name: "Office shirt" }),
    belt({ id: "belt" }),
  ];
  const r = recommendOutfits(items, ctxFor("gym"), 3);
  ok("gym produced a hero", r.hero != null);
  const heroItems = r.hero ? r.hero.items : [];
  const nonActiveApparel = heroItems.filter((i) => engineRole(i) !== "footwear" && !isActivewear(i));
  ok("gym hero contains activewear + footwear only", r.hero != null && nonActiveApparel.length === 0, nonActiveApparel.map((i) => i.id).join(","));
  ok("gym never includes an accessory/belt", !allResultIds(r).includes("belt"));
  ok("gym excludes the office shirt", !allResultIds(r).includes("office-shirt"));
}

// =====================================================================
// 7. one-piece never paired with a separate bottom
// =====================================================================
{
  ok("dress + bottom invalid in validator", validateOutfitItems([dress({ id: "dr" }), bottom({ id: "b" })]).valid === false);
  const items = [dress({ id: "dr", formality: 4, occasion_tags: [] }), bottom({ id: "b" }), shoes({ id: "s" })];
  const r = recommendOutfits(items, ctxFor("party"), 3);
  const heroHasDressAndBottom = r.hero
    ? r.hero.items.some((i) => engineRole(i) === "one_piece") && r.hero.items.some((i) => engineRole(i) === "bottom")
    : false;
  ok("recommendation never emits dress + separate bottom", !heroHasDressAndBottom);
}

// =====================================================================
// 8. 10-item wardrobe still yields hero + 2 backups
// =====================================================================
{
  const items = [
    top({ id: "t1", color_family: "white" }), top({ id: "t2", color_family: "blue" }), top({ id: "t3", color_family: "black" }),
    bottom({ id: "b1", color_family: "navy" }), bottom({ id: "b2", color_family: "beige" }), bottom({ id: "b3", color_family: "black" }),
    shoes({ id: "s1" }), shoes({ id: "s2" }),
    top({ id: "t4", color_family: "green" }), bottom({ id: "b4", color_family: "grey" }),
  ];
  const r = recommendOutfits(items, ctxFor("casual"), 3);
  ok("10-item wardrobe yields a hero", r.hero != null);
  ok("10-item wardrobe yields >= 2 backups", r.backups.length >= 2, `got ${r.backups.length}`);
  ok("hero exposes a confidence in (0,1]", r.hero != null && r.hero.confidence > 0 && r.hero.confidence <= 1);
  ok("hero has >=1 Why-This-Works line from real factors", r.hero != null && r.hero.whyThisWorks.length >= 1);
}

// =====================================================================
// 9. performance budget: 60-item wardrobe scores well under 800ms
// =====================================================================
{
  const many: WardrobeItem[] = [];
  for (let i = 0; i < 20; i++) many.push(top({ id: `pt${i}`, color_family: ["white", "blue", "black", "grey"][i % 4] }));
  for (let i = 0; i < 20; i++) many.push(bottom({ id: `pb${i}`, color_family: ["navy", "beige", "black", "grey"][i % 4] }));
  for (let i = 0; i < 12; i++) many.push(shoes({ id: `ps${i}` }));
  for (let i = 0; i < 8; i++) many.push(top({ id: `px${i}`, color_family: "green" }));
  const r = recommendOutfits(many, ctxFor("work"), 3);
  ok("60-item wardrobe returns a hero", r.hero != null);
  console.log(`      ↳ 60-item pipeline: ${r.diagnostics.candidatesBuilt} candidates built, ${r.diagnostics.candidatesValid} valid, ${r.diagnostics.elapsedMs}ms`);
  ok("60-item engine elapsed < 800ms", r.diagnostics.elapsedMs < 800, `${r.diagnostics.elapsedMs}ms`);
}

// =====================================================================
// 10. PARTIAL OUTFIT FALLBACK — missing footwear (Phase 1 hotfix)
// =====================================================================
{
  const items = [
    top({ id: "wt1", formality: 4, user_facing_name: "Work shirt" }),
    top({ id: "wt2", formality: 4, user_facing_name: "Work blouse" }),
    bottom({ id: "wb1", formality: 4, user_facing_name: "Trousers" }),
    bottom({ id: "wb2", formality: 4, user_facing_name: "Formal skirt" }),
  ];
  const r = recommendOutfits(items, ctxFor("work"), 3);
  ok("partial: no-footwear work wardrobe returns a hero (not null)", r.hero != null);
  ok("partial: outfitStatus === 'partial'", r.outfitStatus === "partial");
  ok("partial: hero.completeness === 'partial'", r.hero != null && r.hero.completeness === "partial");
  ok("partial: missing_slots === ['footwear']", JSON.stringify(r.missingSlots) === JSON.stringify(["footwear"]));
  ok("partial: hero.missingSlots === ['footwear']", r.hero != null && JSON.stringify(r.hero.missingSlots) === JSON.stringify(["footwear"]));
  ok("partial: partialReason === 'no_footwear_in_wardrobe'", r.partialReason === "no_footwear_in_wardrobe");
  ok("partial: fail_reason is 'partial_missing_footwear' (not 'no_valid_outfit')", r.failReason === "partial_missing_footwear");
  ok("partial: NO footwear item fabricated in hero", r.hero != null && r.hero.items.every((i) => engineRole(i) !== "footwear"));
  ok("partial: confidence capped <= 0.45", r.hero != null && r.hero.confidence <= 0.45);
  ok("partial: honest footwear note present", r.hero != null && r.hero.whyThisWorks[0].includes("choose your own footwear"));
  ok("partial: diagnostics expose partial counts", r.diagnostics.partialCandidatesValid > 0 && r.diagnostics.candidatesValid === 0);
  ok("partial: backups are also partial", r.backups.every((b) => b.completeness === "partial"));
}
{
  const items = [
    top({ id: "clean-shirt", formality: 4 }),
    top({ id: "washing-shirt", formality: 4, availability_status: "in_wash", user_facing_name: "Fav shirt" }),
    bottom({ id: "trs", formality: 4 }),
  ];
  const r = recommendOutfits(items, ctxFor("work"), 3);
  ok("partial still excludes in_wash items", r.hero != null && !allResultIds(r).includes("washing-shirt"));
  ok("partial hero still forms from clean items", r.hero != null && r.outfitStatus === "partial");
}
{
  const items = [
    top({ id: "wool-top", formality: 4, fabric: "wool", user_facing_name: "Wool blazer top" }),
    top({ id: "cotton-top", formality: 4, fabric: "cotton" }),
    bottom({ id: "b", formality: 4 }),
  ];
  const r = recommendOutfits(items, ctxFor("work", { tempC: 32, isRaining: false }), 3);
  ok("partial still excludes weather-blocked wool at 32C", r.hero != null && !allResultIds(r).includes("wool-top"));
}
{
  const western = [top({ id: "wtop", formality: 4 }), bottom({ id: "wbot", formality: 4 }), dupatta({ id: "dwest" })];
  const rw = recommendOutfits(western, ctxFor("work"), 3);
  ok("partial never puts a dupatta on a western look", rw.hero != null && rw.hero.items.every((i) => engineRole(i) !== "drape"));
  const ethnic = [kurta({ id: "ek" }), bottom({ id: "eb", cultural_tag: "indian_ethnic", formality: 4 }), belt({ id: "ebelt" })];
  const re = recommendOutfits(ethnic, ctxFor("ethnic"), 3);
  ok("partial never surfaces belt-over-kurta", !allResultIds(re).includes("ebelt"));
}
{
  const items = [top({ id: "only1", formality: 4 }), top({ id: "only2", formality: 4 })];
  const r = recommendOutfits(items, ctxFor("work"), 3);
  ok("no valid pairing → hero is null", r.hero === null);
  ok("no valid pairing → helpful fail_reason (not partial)", r.failReason === "no_valid_outfit");
  ok("no valid pairing → outfitStatus 'complete' (n/a), missing_slots []", r.outfitStatus === "complete" && r.missingSlots.length === 0);
}
{
  const items = [top({ id: "ct", formality: 4 }), bottom({ id: "cb", formality: 4 }), shoes({ id: "cs", formality: 4 })];
  const r = recommendOutfits(items, ctxFor("work"), 3);
  ok("footwear present → outfitStatus 'complete'", r.outfitStatus === "complete");
  ok("footwear present → hero includes footwear", r.hero != null && r.hero.items.some((i) => engineRole(i) === "footwear"));
  ok("footwear present → missing_slots empty", r.missingSlots.length === 0 && r.failReason == null);
}

// =====================================================================
// 11. DB-SHAPED NORMALIZATION — real wardrobe (Top/Bottom/Kurta, no shoes)
//     Reproduces the "afterAvailability: 3 / hero: null" production bug.
//     Columns exactly as migration 0020 backfill produces them.
// =====================================================================
{
  const dbRows: WardrobeItem[] = [
    ...[1, 2, 3, 4].map((n) => mk({ id: `Top-${n}`, category: "Top", user_facing_name: `Top ${n}`, sub_category: "shirt", formality: 2, cultural_tag: null, color_family: null, fabric: null })),
    ...[1, 2, 3].map((n) => mk({ id: `Bottom-${n}`, category: "Bottom", user_facing_name: `Bottom ${n}`, sub_category: "trouser", formality: 2, cultural_tag: null, color_family: null, fabric: null })),
    ...[1, 2, 3].map((n) => mk({ id: `Kurta-${n}`, category: "Kurta", user_facing_name: `Kurta ${n}`, sub_category: "kurti", formality: 3, cultural_tag: "indian_ethnic", color_family: null, fabric: null })),
  ];
  // 11.2 category values "Top"/"Bottom"/"Kurta" recognized (case-insensitive).
  ok("category 'Top' → upper role", engineRole(dbRows[0]) === "upper");
  ok("category 'Bottom' → bottom role", engineRole(dbRows[4]) === "bottom");
  ok("category 'Kurta' → ethnic_upper role", engineRole(dbRows[7]) === "ethnic_upper");

  // 11.1 availability_status='available' rows all normalize to the eligible pool.
  const pool = eligiblePool(dbRows, ctxFor("work", { tempC: 30, isRaining: false })).pool;
  ok("all 10 available rows survive the pool (afterAvailability === 10)", pool.length === 10, `got ${pool.length}`);

  // 11.3 tops/kurtas + bottoms + no footwear → PARTIAL outfit (the bug fix).
  const r = recommendOutfits(dbRows, ctxFor("work", { tempC: 30, isRaining: false }), 3);
  console.log("      ↳ DB wardrobe diagnostics:", JSON.stringify(r.diagnostics));
  ok("DB wardrobe: hero != null", r.hero != null);
  ok("DB wardrobe: outfitStatus 'partial'", r.outfitStatus === "partial");
  ok("DB wardrobe: missing_slots ['footwear']", JSON.stringify(r.missingSlots) === JSON.stringify(["footwear"]));
  ok("DB wardrobe: partial_reason 'no_footwear_in_wardrobe'", r.partialReason === "no_footwear_in_wardrobe");
  ok("DB wardrobe: fail_reason 'partial_missing_footwear'", r.failReason === "partial_missing_footwear");
  ok("DB wardrobe: partialCandidatesBuilt > 0", r.diagnostics.partialCandidatesBuilt > 0);
  ok("DB wardrobe: partialCandidatesValid > 0", r.diagnostics.partialCandidatesValid > 0);
  ok("DB wardrobe: complete candidatesBuilt === 0", r.diagnostics.candidatesBuilt === 0);
  ok("DB wardrobe: no footwear fabricated", r.hero != null && r.hero.items.every((i) => engineRole(i) !== "footwear"));

  // 11.4 null color_family/fabric must NOT block the partial fallback.
  ok("null color_family/fabric did not prevent a hero", r.hero != null && r.hero.items.length >= 2);

  // availability normalization: an in_wash row is still excluded here.
  const withWash = [...dbRows, mk({ id: "Bottom-wash", category: "Bottom", availability_status: "in_wash", formality: 2 })];
  const r2 = recommendOutfits(withWash, ctxFor("work", { tempC: 30, isRaining: false }), 3);
  ok("DB wardrobe: in_wash row still excluded", !allResultIds(r2).includes("Bottom-wash"));
}

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("Failures: " + fails.join("; ")); }
declare const process: { exit(code: number): never };
process.exit(failed > 0 ? 1 : 0);
