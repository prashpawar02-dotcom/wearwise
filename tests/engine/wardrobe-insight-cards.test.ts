// =====================================================================
// WearWise — Wardrobe insight-card computation TESTS (Phase 5, Module E)
// Exercises computeWardrobeInsights through the REAL engine gem validation.
//   Sandbox: `npm run test:engine`
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import { computeWardrobeInsights, validatedGemIds } from "@/lib/wardrobe/insight-data";
import type { EngineContext, EngineOccasion, WeatherContext } from "@/lib/engine/types";
import { DEFAULT_CONFIG, DEFAULT_ETHNIC_RULES, EMPTY_PREFERENCES, profileForOccasion } from "@/lib/engine/config";

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
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function mkItem(over: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return {
    user_id: "u1", image_path: `p/${over.id}.jpg`, category: "shirt", color: "blue", pattern: null,
    occasion_tags: null, notes: null, last_worn_at: null, ai_tag_status: "tagged", ai_confidence: null,
    user_facing_name: null, sub_category: null, style: null, secondary_colors: null, ethnic_western_fusion: null,
    auto_tagged_at: null, user_corrected_tags: false, availability_status: "available", in_wash_since: null,
    color_family: "blue", pattern_boldness: 0, fabric: "cotton", sleeve_length: "short", fit: "regular",
    formality: 2, warmth: 2, min_temp_c: 10, max_temp_c: 40, weather_tags: null, cultural_tag: "western",
    modesty_level: 3, layering_role: "standalone", accessory_role: null, footwear_formality: null,
    footwear_weather: null, set_id: null, set_required_components: null, avoid_with: null, tag_confidence: null,
    photo_quality_flag: false, created_at: daysAgo(365), ...over,
  } as WardrobeItem;
}

// A wardrobe that yields all three cards.
const wardrobe: WardrobeItem[] = [
  mkItem({ id: "worn1", category: "shirt", last_worn_at: daysAgo(2) }),
  mkItem({ id: "bottom", category: "jeans", last_worn_at: daysAgo(2) }),
  mkItem({ id: "shoes", category: "sneakers", footwear_formality: 2, last_worn_at: daysAgo(2) }),
  mkItem({ id: "gemTop", category: "shirt", last_worn_at: daysAgo(90) }),
  mkItem({ id: "coolingGem", category: "shirt", last_worn_at: daysAgo(120), gem_cooldown_until: inDays(30) }),
  mkItem({ id: "washItem", category: "shirt", availability_status: "in_wash", in_wash_since: daysAgo(1), last_worn_at: daysAgo(1) }),
  mkItem({ id: "archivedHot", category: "jeans", availability_status: "archived", last_worn_at: daysAgo(1) }),
];
// archivedHot has the HIGHEST wear count but must be excluded (archived).
const wornRows = [
  { item_ids: ["worn1", "worn1"] },
  { item_ids: ["worn1"] },
  ...Array.from({ length: 5 }, () => ({ item_ids: ["archivedHot"] })),
];

const { cards, gemItemIds } = computeWardrobeInsights({ items: wardrobe, wornRows, now: NOW });

// Order + count
ok("cards: at most 3", cards.length <= 3, `${cards.length}`);
ok("cards: stable order most_worn → quiet_gems → laundry", cards.map((c) => c.kind).join(",") === "most_worn,quiet_gems,laundry", cards.map((c) => c.kind).join(","));

// Most-worn excludes archived winner
const most = cards.find((c) => c.kind === "most_worn");
ok("most_worn: archived high-wear item excluded; owned worn1 shown", most?.kind === "most_worn" && most.itemId === "worn1" && most.count === 2, JSON.stringify(most));

// Gems: only engine-validated, available, rested, not cooling
const gems = cards.find((c) => c.kind === "quiet_gems");
ok("gems: gemTop is engine-validated and counted", gemItemIds.includes("gemTop"));
ok("gems: cooling gem excluded", !gemItemIds.includes("coolingGem"));
ok("gems: recent/core items not counted as gems", !gemItemIds.includes("bottom") && !gemItemIds.includes("shoes") && !gemItemIds.includes("worn1"));
ok("gems: card count matches validated gem list", gems?.kind === "quiet_gems" && gems.count === gemItemIds.length && gems.count === 1, JSON.stringify(gems));

// Laundry snapshot from actual state
const laundry = cards.find((c) => c.kind === "laundry");
ok("laundry: counts the in-wash item", laundry?.kind === "laundry" && laundry.inWash === 1);

// Laundry omitted when nothing is in wash
{
  const noWash = wardrobe.filter((i) => i.id !== "washItem");
  const r = computeWardrobeInsights({ items: noWash, wornRows, now: NOW });
  ok("laundry: omitted when nothing in wash", !r.cards.some((c) => c.kind === "laundry"));
}

// Zero history → no most-worn
{
  const r = computeWardrobeInsights({ items: wardrobe, wornRows: [], now: NOW });
  ok("most_worn: omitted with zero history", !r.cards.some((c) => c.kind === "most_worn"));
}

// Tie → no most-worn
{
  const tied = [mkItem({ id: "p", category: "shirt" }), mkItem({ id: "q", category: "shirt" })];
  const r = computeWardrobeInsights({ items: tied, wornRows: [{ item_ids: ["p"] }, { item_ids: ["q"] }], now: NOW });
  ok("most_worn: omitted on a real tie (no id/alpha tiebreak)", !r.cards.some((c) => c.kind === "most_worn"));
}

// No gem when no complete outfit can be formed (validation yields nothing → omit)
{
  const noShoes = [mkItem({ id: "g", category: "shirt", last_worn_at: daysAgo(90) }), mkItem({ id: "b", category: "jeans", last_worn_at: daysAgo(2) })];
  const r = computeWardrobeInsights({ items: noShoes, wornRows: [], now: NOW });
  ok("gems: omitted when no complete outfit is possible", !r.cards.some((c) => c.kind === "quiet_gems") && r.gemItemIds.length === 0);
}

// ---- Module E correction: multi-context gem validation (not casual-only) ----
function ctxFor(occasion: EngineOccasion, weather: WeatherContext = { tempC: 26, isRaining: false }): EngineContext {
  return { occasion, weather, config: DEFAULT_CONFIG, profile: profileForOccasion(occasion), ethnicRules: DEFAULT_ETHNIC_RULES, preferences: EMPTY_PREFERENCES, now: NOW };
}

// Formal item invalid in casual (formality window) but valid in work.
{
  const formal = [
    mkItem({ id: "formalTop", category: "shirt", formality: 5, last_worn_at: daysAgo(90) }),
    mkItem({ id: "formalBottom", category: "jeans", formality: 5, last_worn_at: daysAgo(2) }),
    mkItem({ id: "formalShoes", category: "loafers", footwear_formality: 5, formality: 5, last_worn_at: daysAgo(2) }),
  ];
  const casualOnly = validatedGemIds(formal, [ctxFor("casual")]);
  const workOnly = validatedGemIds(formal, [ctxFor("work")]);
  ok("multi-ctx: formal gem NOT valid in casual-only", !casualOnly.has("formalTop"));
  ok("multi-ctx: formal gem IS valid in a work context", workOnly.has("formalTop"), `work=${[...workOnly].join(",")}`);
  const r = computeWardrobeInsights({ items: formal, wornRows: [], now: NOW });
  ok("multi-ctx: formal gem qualifies via the bounded context set", r.gemItemIds.includes("formalTop"), r.gemItemIds.join(","));
}

// Ethnic/traditional item qualifies through a supported cultural context.
{
  const ethnic = [
    mkItem({ id: "kurta", category: "kurta", cultural_tag: "indian_ethnic", formality: 3, last_worn_at: daysAgo(90) }),
    mkItem({ id: "churidar", category: "churidar", cultural_tag: "indian_ethnic", formality: 3, last_worn_at: daysAgo(2) }),
    mkItem({ id: "jutti", category: "jutti", footwear_formality: 3, formality: 3, cultural_tag: "indian_ethnic", last_worn_at: daysAgo(2) }),
  ];
  const cultural = validatedGemIds(ethnic, [ctxFor("festive"), ctxFor("ethnic")]);
  ok("multi-ctx: ethnic gem qualifies via a cultural context", cultural.has("kurta"), `set=${[...cultural].join(",")}`);
}

// Item invalid in EVERY tested context stays excluded.
{
  const lonely = [mkItem({ id: "lonelyTop", category: "shirt", last_worn_at: daysAgo(90) })]; // no bottom, no footwear
  const r = computeWardrobeInsights({ items: lonely, wornRows: [], now: NOW });
  ok("multi-ctx: item invalid in all contexts excluded", !r.gemItemIds.includes("lonelyTop") && r.gemItemIds.length === 0);
}

// One context failure must not fabricate a qualification (per-context isolation).
{
  const items = [mkItem({ id: "good", category: "shirt", last_worn_at: daysAgo(90) })];
  const ctxs = [ctxFor("casual"), ctxFor("work")];
  let calls = 0;
  const flaky = () => { calls += 1; if (calls === 1) throw new Error("ctx boom"); return new Set<string>(["good"]); };
  const ids = validatedGemIds(items, ctxs, flaky);
  ok("multi-ctx: a throwing context is skipped, others still counted", ids.has("good"));
  ok("multi-ctx: throwing context fabricates nothing", ids.size === 1);
  // All contexts throw → empty (fail closed).
  const allFail = validatedGemIds(items, ctxs, () => { throw new Error("boom"); });
  ok("multi-ctx: all contexts failing → empty set (fail closed)", allFail.size === 0);
}

// Deterministic across runs.
{
  const a = computeWardrobeInsights({ items: wardrobe, wornRows, now: NOW }).gemItemIds.join(",");
  const b = computeWardrobeInsights({ items: wardrobe, wornRows, now: NOW }).gemItemIds.join(",");
  ok("multi-ctx: gem list deterministic across runs", a === b);
}

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) {
  console.log("FAILURES:\n - " + fails.join("\n - "));
  process.exit(1);
}
process.exit(0);
