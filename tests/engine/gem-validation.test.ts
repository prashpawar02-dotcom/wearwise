// =====================================================================
// WearWise — Quiet-Gem participation GOLDEN TESTS (Phase 5, Module A)
// Proves a Quiet Gem must PARTICIPATE in at least one COMPLETE, fully
// validated outfit under the REAL engine (eligiblePool → buildCandidates →
// hasFootwear completeness → candidateRejection — the same gate recommend.ts
// uses before display). Not merely: survives the pool / appears in a candidate.
//   Sandbox: `npm run test:engine`
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type { EngineContext, EngineOccasion, WeatherContext } from "@/lib/engine/types";
import { DEFAULT_CONFIG, DEFAULT_ETHNIC_RULES, EMPTY_PREFERENCES, profileForOccasion } from "@/lib/engine/config";
import { recommendableItemIds } from "@/lib/wardrobe/gem-validation";
import { selectQuietGems } from "@/lib/wardrobe/insights";

let passed = 0,
  failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed++;
    console.log(`PASS | ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

const NOW = new Date("2026-07-17T08:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function ctxFor(occasion: EngineOccasion, weather: WeatherContext = { tempC: 26, isRaining: false }): EngineContext {
  return {
    occasion,
    weather,
    config: DEFAULT_CONFIG,
    profile: profileForOccasion(occasion),
    ethnicRules: DEFAULT_ETHNIC_RULES,
    preferences: EMPTY_PREFERENCES,
    now: NOW,
  };
}

function mkItem(over: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return {
    user_id: "u1",
    image_path: `p/${over.id}.jpg`,
    category: "top",
    color: "blue",
    pattern: null,
    occasion_tags: null,
    notes: null,
    last_worn_at: null,
    ai_tag_status: "tagged",
    ai_confidence: null,
    user_facing_name: null,
    sub_category: null,
    style: null,
    secondary_colors: null,
    ethnic_western_fusion: null,
    auto_tagged_at: null,
    user_corrected_tags: false,
    availability_status: "available",
    in_wash_since: null,
    color_family: "blue",
    pattern_boldness: 0,
    fabric: "cotton",
    sleeve_length: "short",
    fit: "regular",
    formality: 2,
    warmth: 2,
    min_temp_c: 10,
    max_temp_c: 40,
    weather_tags: null,
    cultural_tag: "western",
    modesty_level: 3,
    layering_role: "standalone",
    accessory_role: null,
    footwear_formality: null,
    footwear_weather: null,
    set_id: null,
    set_required_components: null,
    avoid_with: null,
    tag_confidence: null,
    photo_quality_flag: false,
    created_at: daysAgo(365),
    ...over,
  } as WardrobeItem;
}

const ctx = ctxFor("casual");
const shoes = (over: Partial<WardrobeItem> & { id: string }) =>
  mkItem({ category: "sneakers", footwear_formality: 2, layering_role: "standalone", ...over });

// --- B) participates in a complete validated outfit → qualifies ---
{
  const wardrobe = [
    mkItem({ id: "top", category: "shirt", last_worn_at: daysAgo(2) }),
    mkItem({ id: "bottom", category: "jeans", last_worn_at: daysAgo(2) }),
    shoes({ id: "shoes", last_worn_at: daysAgo(2) }),
    mkItem({ id: "gemPairable", category: "shirt", last_worn_at: daysAgo(90) }),
  ];
  const ids = recommendableItemIds(wardrobe, [ctx]);
  ok("B: engine yields a non-empty recommendable set", ids.size > 0, `size=${ids.size}`);
  ok("B: pairable rested gem participates in a complete outfit → recommendable", ids.has("gemPairable"));
  const validated = selectQuietGems(wardrobe, { now: NOW, recommendableIds: ids }).map((g) => g.id);
  ok("B: validated gems include the pairable gem", validated.includes("gemPairable"));
}

// --- A) individually eligible item, NO complete outfit (no footwear anywhere) → excluded ---
{
  const wardrobe = [
    mkItem({ id: "gemTop", category: "shirt", last_worn_at: daysAgo(90) }),
    mkItem({ id: "bottom", category: "jeans", last_worn_at: daysAgo(2) }),
    // no footwear in the wardrobe at all
  ];
  const ids = recommendableItemIds(wardrobe, [ctx]);
  ok("A: no complete outfit (no footwear) → recommendable set empty", ids.size === 0, `size=${ids.size}`);
  ok("A: individually-eligible gem with no complete outfit is EXCLUDED", !ids.has("gemTop"));
  const validated = selectQuietGems(wardrobe, { now: NOW, recommendableIds: ids }).map((g) => g.id);
  ok("A: selector omits the gem (fails closed, not recency-only)", !validated.includes("gemTop"));
}

// --- C/D) in-wash companion invalidates the ONLY outfit; restoring it re-qualifies ---
{
  const base = (shoeStatus: WardrobeItem["availability_status"]) => [
    mkItem({ id: "gemTop", category: "shirt", last_worn_at: daysAgo(90) }),
    mkItem({ id: "bottom", category: "jeans", last_worn_at: daysAgo(2) }),
    shoes({ id: "shoes", last_worn_at: daysAgo(2), availability_status: shoeStatus, in_wash_since: shoeStatus === "in_wash" ? daysAgo(1) : null }),
  ];
  const washedIds = recommendableItemIds(base("in_wash"), [ctx]);
  ok("C: only shoes in wash → no complete outfit → gem excluded", !washedIds.has("gemTop") && washedIds.size === 0);

  const restoredIds = recommendableItemIds(base("available"), [ctx]);
  ok("D: restoring the shoes re-enables a complete outfit → gem recommendable", restoredIds.has("gemTop"));
}

// --- E) one-piece structure completes WITHOUT a separate bottom ---
{
  const wardrobe = [
    mkItem({ id: "dress", category: "dress", layering_role: "standalone", last_worn_at: daysAgo(90) }),
    shoes({ id: "shoes", last_worn_at: daysAgo(2) }),
  ];
  const ids = recommendableItemIds(wardrobe, [ctx]);
  ok("E: rested one-piece + shoes → complete → dress recommendable", ids.has("dress"), `set=${[...ids].join(",")}`);
}

// --- F) candidateRejection is enforced: an item whose only complete outfit clashes is excluded ---
{
  // gemBold's only possible complete outfit pairs two bold patterns → patternClashGuard rejects.
  const clashing = [
    mkItem({ id: "gemBold", category: "shirt", pattern_boldness: 3, last_worn_at: daysAgo(90) }),
    mkItem({ id: "boldBottom", category: "jeans", pattern_boldness: 3, last_worn_at: daysAgo(2) }),
    shoes({ id: "shoes", last_worn_at: daysAgo(2) }),
  ];
  const clashIds = recommendableItemIds(clashing, [ctx]);
  ok("F: only-complete-outfit fails a hard guard (pattern clash) → gem excluded", !clashIds.has("gemBold"), `set=${[...clashIds].join(",")}`);

  // Add a plain bottom → a non-clashing complete outfit now exists → gem qualifies.
  const fixed = [...clashing, mkItem({ id: "plainBottom", category: "jeans", pattern_boldness: 0, last_worn_at: daysAgo(2) })];
  const fixedIds = recommendableItemIds(fixed, [ctx]);
  ok("F: adding a non-clashing bottom lets the gem participate → recommendable", fixedIds.has("gemBold"), `set=${[...fixedIds].join(",")}`);
}

// --- G) deterministic ---
{
  const wardrobe = [
    mkItem({ id: "top", category: "shirt", last_worn_at: daysAgo(2) }),
    mkItem({ id: "bottom", category: "jeans", last_worn_at: daysAgo(2) }),
    shoes({ id: "shoes", last_worn_at: daysAgo(2) }),
    mkItem({ id: "gemPairable", category: "shirt", last_worn_at: daysAgo(90) }),
  ];
  const a = [...recommendableItemIds(wardrobe, [ctx])].sort().join(",");
  const b = [...recommendableItemIds(wardrobe, [ctx])].sort().join(",");
  ok("G: recommendableItemIds is deterministic across runs", a === b, `${a} !== ${b}`);
}

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) {
  console.log("FAILURES:\n - " + fails.join("\n - "));
  process.exit(1);
}
process.exit(0);
