// =====================================================================
// WearWise — Wardrobe Insights & Quiet Gems GOLDEN TESTS (Phase 5, Module A)
// Tiny inline harness (no framework); prints PASS/FAIL and exits non-zero.
//   Sandbox: `npm run test:engine`
//   Windows: `npx tsx tests/engine/wardrobe-insights.test.ts`
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import {
  wearCountsFromHistory,
  isGemEligible,
  selectQuietGems,
  buildInsightCards,
  GEM_RESTING_DAYS,
  GEM_MIN_OWNED_DAYS,
} from "@/lib/wardrobe/insights";

// ---- harness ----
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

// Minimal item builder — sensible defaults, override what a test cares about.
function mkItem(over: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return {
    user_id: "u1",
    image_path: `p/${over.id}.jpg`,
    category: "top",
    color: "green",
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
    color_family: null,
    pattern_boldness: null,
    fabric: null,
    sleeve_length: null,
    fit: null,
    formality: null,
    warmth: null,
    min_temp_c: null,
    max_temp_c: null,
    weather_tags: null,
    cultural_tag: null,
    modesty_level: null,
    layering_role: null,
    accessory_role: null,
    footwear_formality: null,
    footwear_weather: null,
    set_id: null,
    set_required_components: null,
    avoid_with: null,
    tag_confidence: null,
    photo_quality_flag: false,
    created_at: daysAgo(365), // owned a long time by default
    ...over,
  } as WardrobeItem;
}

// ---- wearCountsFromHistory ----
{
  const counts = wearCountsFromHistory([
    { item_ids: ["a", "b"] },
    { item_ids: ["a"] },
    { item_ids: null },
    { item_ids: ["b", "c", "a"] },
  ]);
  ok("wearCounts: a counted across rows", counts["a"] === 3, JSON.stringify(counts));
  ok("wearCounts: b counted", counts["b"] === 2);
  ok("wearCounts: c counted", counts["c"] === 1);
  ok("wearCounts: null row tolerated", !("undefined" in counts));

  // Duplicate item id WITHIN one row = one worn occasion, counted once.
  const dup = wearCountsFromHistory([{ item_ids: ["x", "x", "x"] }, { item_ids: ["x"] }]);
  ok("wearCounts: intra-row duplicates count once per row", dup["x"] === 2, JSON.stringify(dup));

  // Malformed rows (null entries / non-array) fail safe.
  const malformed = wearCountsFromHistory([
    undefined,
    null,
    { item_ids: null },
    { item_ids: ["", "y"] },
  ] as unknown as { item_ids: string[] | null }[]);
  ok("wearCounts: malformed rows ignored, blank ids dropped", malformed["y"] === 1 && !("" in malformed));
}

// ---- isGemEligible ----
{
  const restedWorn = mkItem({ id: "rested", last_worn_at: daysAgo(GEM_RESTING_DAYS + 5) });
  ok("gem: worn long ago + available = eligible", isGemEligible(restedWorn, { now: NOW }));

  const wornRecently = mkItem({ id: "recent", last_worn_at: daysAgo(GEM_RESTING_DAYS - 5) });
  ok("gem: worn recently = NOT eligible", !isGemEligible(wornRecently, { now: NOW }));

  const inWash = mkItem({ id: "wash", last_worn_at: daysAgo(100), availability_status: "in_wash" });
  ok("gem: in_wash never eligible", !isGemEligible(inWash, { now: NOW }));

  const archived = mkItem({ id: "arch", last_worn_at: daysAgo(100), availability_status: "archived" });
  ok("gem: archived never eligible", !isGemEligible(archived, { now: NOW }));

  const unavailable = mkItem({ id: "un", last_worn_at: daysAgo(100), availability_status: "unavailable" });
  ok("gem: unavailable never eligible", !isGemEligible(unavailable, { now: NOW }));

  const needsReview = mkItem({ id: "nr", last_worn_at: daysAgo(100), ai_tag_status: "needs_review" });
  ok("gem: needs_review (low tag confidence) excluded", !isGemEligible(needsReview, { now: NOW }));

  const neverWornNew = mkItem({ id: "new", last_worn_at: null, created_at: daysAgo(GEM_MIN_OWNED_DAYS - 5) });
  ok("gem: never-worn but newly-owned = NOT eligible", !isGemEligible(neverWornNew, { now: NOW }));

  const neverWornOld = mkItem({ id: "old", last_worn_at: null, created_at: daysAgo(GEM_MIN_OWNED_DAYS + 30) });
  ok("gem: never-worn but owned long = eligible", isGemEligible(neverWornOld, { now: NOW }));

  const cooling = mkItem({ id: "cool", last_worn_at: daysAgo(100) });
  ok("gem: active cooldown excludes", !isGemEligible(cooling, { now: NOW, cooldownUntil: { cool: daysAgo(-10) } }));
  ok("gem: expired cooldown does not exclude", isGemEligible(cooling, { now: NOW, cooldownUntil: { cool: daysAgo(10) } }));

  // Engine-participation gate (recommendableIds): non-member excluded even if rested.
  ok(
    "gem: not in recommendableIds excluded",
    !isGemEligible(restedWorn, { now: NOW, recommendableIds: new Set<string>(["someone-else"]) }),
  );
  ok(
    "gem: in recommendableIds included",
    isGemEligible(restedWorn, { now: NOW, recommendableIds: new Set<string>(["rested"]) }),
  );

  const blank = mkItem({ id: "blank", category: null, user_facing_name: null, sub_category: null, last_worn_at: daysAgo(100) });
  ok("gem: unidentifiable item excluded", !isGemEligible(blank, { now: NOW }));
}

// ---- selectQuietGems ordering (deterministic) ----
{
  const items = [
    mkItem({ id: "q60", last_worn_at: daysAgo(60) }),
    mkItem({ id: "q200", last_worn_at: daysAgo(200) }),
    mkItem({ id: "q100", last_worn_at: daysAgo(100) }),
    mkItem({ id: "recent", last_worn_at: daysAgo(3) }),
  ];
  const gems = selectQuietGems(items, { now: NOW });
  ok("gems: recent excluded from selection", !gems.some((g) => g.id === "recent"));
  ok("gems: quietest first", gems.map((g) => g.id).join(",") === "q200,q100,q60", gems.map((g) => g.id).join(","));

  // Deterministic tiebreak by id when restedness is equal.
  const tied = [
    mkItem({ id: "bbb", last_worn_at: daysAgo(90) }),
    mkItem({ id: "aaa", last_worn_at: daysAgo(90) }),
  ];
  ok("gems: equal restedness → id-ascending tiebreak", selectQuietGems(tied, { now: NOW }).map((g) => g.id).join(",") === "aaa,bbb");
}

// ---- buildInsightCards ----
{
  const items = [
    mkItem({ id: "worn", last_worn_at: daysAgo(2) }),
    mkItem({ id: "gem1", last_worn_at: daysAgo(90) }),
    mkItem({ id: "gem2", last_worn_at: daysAgo(120) }),
    mkItem({ id: "wash", availability_status: "in_wash", last_worn_at: daysAgo(1) }),
  ];
  // "worn" listed twice in one row = one occasion; +1 in the next row = 2 total.
  const counts = wearCountsFromHistory([{ item_ids: ["worn", "worn", "gem1"] }, { item_ids: ["worn"] }]);
  const cards = buildInsightCards(items, counts, { now: NOW });

  ok("insights: at most 3 cards", cards.length <= 3, `got ${cards.length}`);

  const most = cards.find((c) => c.kind === "most_worn");
  ok("insights: most_worn points at real top item (deduped count=2)", most?.kind === "most_worn" && most.itemId === "worn" && most.count === 2, JSON.stringify(most));

  const gemsCard = cards.find((c) => c.kind === "quiet_gems");
  ok("insights: quiet_gems count is query-backed", gemsCard?.kind === "quiet_gems" && gemsCard.count === 2);

  const laundry = cards.find((c) => c.kind === "laundry");
  ok(
    "insights: laundry snapshot counts honest",
    laundry?.kind === "laundry" && laundry.inWash === 1 && laundry.available === 3,
    JSON.stringify(laundry),
  );
}

// ---- no fabrication ----
{
  // Nothing worn → no most_worn card.
  const items = [mkItem({ id: "a", last_worn_at: daysAgo(2) })];
  ok("insights: no most_worn card when nothing worn", !buildInsightCards(items, {}, { now: NOW }).some((c) => c.kind === "most_worn"));

  // Tied top → most_worn omitted (no arbitrary winner).
  const tiedItems = [mkItem({ id: "p" }), mkItem({ id: "q" })];
  const tiedCounts = wearCountsFromHistory([{ item_ids: ["p"] }, { item_ids: ["q"] }]);
  ok("insights: most_worn omitted when top is tied", !buildInsightCards(tiedItems, tiedCounts, { now: NOW }).some((c) => c.kind === "most_worn"));
}

// ---- summary ----
console.log(`\n${passed} passed / ${failed} failed`);
if (failed) {
  console.log("FAILURES:\n - " + fails.join("\n - "));
  process.exit(1);
}
process.exit(0);
