// =====================================================================
// WearWise — Engine v2 GOLDEN TESTS (Phase 1)
// Runs with a tiny inline harness (no test framework needed). Verifies the
// non-negotiable rules from the handbook §5 Phase 1 + acceptance bar.
//   Sandbox: `node scripts/run-engine-tests.mjs` (tsc-compiled, esbuild-free)
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
  // sanity: dupatta WITH a kurta anchor is allowed
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
  const belowFour = idsOf(r.hero).length
    ? r.hero!.items.filter((i) => (formalityOf(i) ?? 0) < 4)
    : [];
  ok("interview hero: all items formality >= 4", r.hero != null && belowFour.length === 0,
    belowFour.map((i) => i.id).join(","));
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
  ok("gym hero contains activewear + footwear only", r.hero != null && nonActiveApparel.length === 0,
    nonActiveApparel.map((i) => i.id).join(","));
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

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("Failures: " + fails.join("; ")); }
declare const process: { exit(code: number): never };
process.exit(failed > 0 ? 1 : 0);
