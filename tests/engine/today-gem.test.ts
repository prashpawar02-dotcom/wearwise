// =====================================================================
// WearWise — Today Quiet-Gem qualification TESTS (Phase 5, Module F, F2/F3)
//   Sandbox: `npm run test:engine`
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import { qualifyingTodayGem, todayGemNote, gemShownKey, shouldEmitGemWorn } from "@/lib/wardrobe/today-gem";

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
    user_id: "u1", image_path: `p/${over.id}.jpg`, category: "shirt", color: null, pattern: null,
    occasion_tags: null, notes: null, last_worn_at: null, ai_tag_status: "tagged", ai_confidence: null,
    user_facing_name: null, sub_category: null, style: null, secondary_colors: null, ethnic_western_fusion: null,
    auto_tagged_at: null, user_corrected_tags: false, availability_status: "available", in_wash_since: null,
    color_family: null, pattern_boldness: null, fabric: null, sleeve_length: null, fit: null, formality: null,
    warmth: null, min_temp_c: null, max_temp_c: null, weather_tags: null, cultural_tag: null, modesty_level: null,
    layering_role: null, accessory_role: null, footwear_formality: null, footwear_weather: null, set_id: null,
    set_required_components: null, avoid_with: null, tag_confidence: null, photo_quality_flag: false,
    created_at: daysAgo(365), ...over,
  } as WardrobeItem;
}

const top = mkItem({ id: "top", category: "shirt", last_worn_at: daysAgo(2) });
const bottom = mkItem({ id: "bottom", category: "jeans", last_worn_at: daysAgo(2) });
const shoes = mkItem({ id: "shoes", category: "sneakers", last_worn_at: daysAgo(2) });
const gem = mkItem({ id: "gem", category: "kurta", user_facing_name: "green kurta", last_worn_at: daysAgo(49) }); // 7 weeks

const items = [top, bottom, shoes, gem];

// Complete valid recommendation containing a gem → note renders
ok("render: complete outfit containing a gem → gem returned", qualifyingTodayGem({ outfitItemIds: ["gem", "bottom", "shoes"], outfitComplete: true, items, now: NOW })?.id === "gem");

// Partial/constrained → no note
ok("render: incomplete (partial) recommendation → no note", qualifyingTodayGem({ outfitItemIds: ["gem", "bottom", "shoes"], outfitComplete: false, items, now: NOW }) === null);

// Rested gem no longer available → no note
{
  const washedGem = { ...gem, availability_status: "in_wash" as WardrobeItem["availability_status"], in_wash_since: daysAgo(1) };
  ok("render: gem no longer available → no note", qualifyingTodayGem({ outfitItemIds: ["gem", "bottom", "shoes"], outfitComplete: true, items: [top, bottom, shoes, washedGem], now: NOW }) === null);
}

// A different rendered item unavailable → no note (final availability fails)
{
  const washedShoes = { ...shoes, availability_status: "in_wash" as WardrobeItem["availability_status"] };
  ok("render: any rendered item unavailable → no note", qualifyingTodayGem({ outfitItemIds: ["gem", "bottom", "shoes"], outfitComplete: true, items: [top, bottom, washedShoes, gem], now: NOW }) === null);
}

// Stale recommendation (missing/deleted item id) → no note
ok("render: stale recommendation (missing item) → no note", qualifyingTodayGem({ outfitItemIds: ["gem", "ghost", "shoes"], outfitComplete: true, items, now: NOW }) === null);

// No gem in outfit → no note
ok("render: outfit with no qualifying gem → no note", qualifyingTodayGem({ outfitItemIds: ["top", "bottom", "shoes"], outfitComplete: true, items, now: NOW }) === null);

// Cooling gem excluded
ok("render: cooling gem → no note", qualifyingTodayGem({ outfitItemIds: ["gem", "bottom", "shoes"], outfitComplete: true, items, now: NOW, cooldownUntil: { gem: inDays(30) } }) === null);

// Deterministic choice with two gems (quietest first, then id)
{
  const gem2 = mkItem({ id: "gemA", category: "shirt", last_worn_at: daysAgo(120) }); // quieter
  const gem1 = mkItem({ id: "gemB", category: "shirt", last_worn_at: daysAgo(60) });
  const chosen = qualifyingTodayGem({ outfitItemIds: ["gemB", "gemA", "shoes"], outfitComplete: true, items: [gem1, gem2, shoes], now: NOW });
  ok("render: deterministic pick = quietest gem", chosen?.id === "gemA", chosen?.id);
}

// Note copy — weeks only when supported
ok("note: worn gem uses real week count", todayGemNote(gem, NOW) === "That green kurta had been resting for 7 weeks. Welcome back.", todayGemNote(gem, NOW));
{
  const neverWorn = mkItem({ id: "nw", user_facing_name: "silk saree", last_worn_at: null, created_at: daysAgo(200) });
  ok("note: never-worn gem is 'waiting', not 'forgotten'/weeks", todayGemNote(neverWorn, NOW) === "This piece has been waiting in your wardrobe. A good day to bring it out.");
}

// gem_shown render identity (F4)
{
  const a = gemShownKey("rec1", ["b", "a", "shoes"], "a");
  const same = gemShownKey("rec1", ["shoes", "a", "b"], "a"); // order-independent
  const changed = gemShownKey("rec1", ["a", "x", "shoes"], "a"); // swapped item → distinct render
  ok("gem_shown: key stable across rerender/order (dedup)", a === same);
  ok("gem_shown: changed selected-item fingerprint → distinct key", a !== changed);
  ok("gem_shown: different gem → distinct key", gemShownKey("rec1", ["a", "b"], "a") !== gemShownKey("rec1", ["a", "b"], "b"));
}

// gem_worn gating (F9)
ok("gem_worn: confirmed (ok) + gem → emit", shouldEmitGemWorn("ok", true));
ok("gem_worn: already (idempotent duplicate) → no emit", !shouldEmitGemWorn("already", true));
ok("gem_worn: failure → no emit", !shouldEmitGemWorn("error", true) && !shouldEmitGemWorn("stale", true));
ok("gem_worn: confirmed but no gem → no emit", !shouldEmitGemWorn("ok", false));

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) {
  console.log("FAILURES:\n - " + fails.join("\n - "));
  process.exit(1);
}
process.exit(0);
