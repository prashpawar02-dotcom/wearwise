// =====================================================================
// WearWise — Closet Board placement contract TESTS (Phase 5, Module C1)
// Proves deterministic single-placement + the board visibility contract.
//   Sandbox: `npm run test:engine`
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import { zoneForItem, ZONE_ORDER } from "@/lib/wardrobe";
import { partitionBoardItems } from "@/lib/wardrobe/board";

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

function mkItem(over: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return {
    user_id: "u1",
    image_path: `p/${over.id}.jpg`,
    category: "top",
    color: null,
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
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  } as WardrobeItem;
}

// --- zoneForItem: exactly one zone, always ---
{
  const samples = [
    mkItem({ id: "shirt", category: "shirt" }),
    mkItem({ id: "jeans", category: "jeans" }),
    mkItem({ id: "kurta", category: "kurta" }),
    mkItem({ id: "saree", category: "saree" }),
    mkItem({ id: "sneaker", category: "sneakers" }),
    mkItem({ id: "belt", category: "belt" }),
    mkItem({ id: "unknown", category: "gizmo", user_facing_name: null, sub_category: null }),
  ];
  let allOne = true;
  for (const it of samples) {
    const z = zoneForItem(it);
    if (!ZONE_ORDER.includes(z)) allOne = false;
  }
  ok("zoneForItem: every item resolves to a valid zone", allOne);
  ok("zoneForItem: footwear → shoes", zoneForItem(samples[4]) === "shoes");
  ok("zoneForItem: accessory (belt) → accessories", zoneForItem(samples[5]) === "accessories");
  ok("zoneForItem: kurta/saree → occasion (not a generic shelf)", zoneForItem(samples[2]) === "occasion" && zoneForItem(samples[3]) === "occasion");
  ok("zoneForItem: unknown-but-valid → documented fallback (hanging), not dropped", zoneForItem(samples[6]) === "hanging");
}

// --- partitionBoardItems: contract ---
{
  const items = [
    mkItem({ id: "shirtA", category: "shirt" }),
    mkItem({ id: "jeansA", category: "jeans" }),
    mkItem({ id: "kurtaA", category: "kurta" }),
    mkItem({ id: "sneakerA", category: "sneakers" }),
    mkItem({ id: "beltA", category: "belt" }),
    mkItem({ id: "shirtWash", category: "shirt", availability_status: "in_wash", in_wash_since: "2026-07-10T00:00:00Z" }),
    mkItem({ id: "jeansArch", category: "jeans", availability_status: "archived" }),
    mkItem({ id: "shirtUnavail", category: "shirt", availability_status: "unavailable" }),
  ];
  const p = partitionBoardItems(items);

  // Archived omitted entirely.
  ok("board: archived item omitted from boardItems", !p.boardItems.some((i) => i.id === "jeansArch"));
  ok("board: archivedCount counted", p.archivedCount === 1);
  const inAnyZone = (id: string) => ZONE_ORDER.some((z) => p.zones[z].all.some((i) => i.id === id));
  ok("board: archived item in NO zone", !inAnyZone("jeansArch"));

  // Every non-archived item appears exactly once across all zones.
  const placements = ZONE_ORDER.flatMap((z) => p.zones[z].all.map((i) => i.id));
  const uniquePlacements = new Set(placements);
  ok("board: no item appears in two shelves", placements.length === uniquePlacements.size, placements.join(","));
  ok("board: every non-archived item placed exactly once", placements.length === p.boardItems.length && p.boardItems.every((i) => uniquePlacements.has(i.id)));

  // In-wash only in the Laundry surface, never in a zone's available shelf.
  const inAnyAvailable = (id: string) => ZONE_ORDER.some((z) => p.zones[z].available.some((i) => i.id === id));
  ok("board: in-wash item is NOT in any zone's available shelf", !inAnyAvailable("shirtWash"));
  ok("board: in-wash item IS in the Laundry surface", p.laundry.some((i) => i.id === "shirtWash"));
  ok("board: in-wash item still counted in its zone.all (for the header count)", p.zones.hanging.all.some((i) => i.id === "shirtWash"));

  // Footwear + accessories separate.
  ok("board: footwear in shoes, not accessories", p.zones.shoes.available.some((i) => i.id === "sneakerA") && !p.zones.accessories.all.some((i) => i.id === "sneakerA"));
  ok("board: accessory in accessories, not shoes", p.zones.accessories.available.some((i) => i.id === "beltA") && !p.zones.shoes.all.some((i) => i.id === "beltA"));

  // Occasion item not in a generic shelf.
  ok("board: kurta in occasion, not hanging/folded", p.zones.occasion.all.some((i) => i.id === "kurtaA") && !p.zones.hanging.all.some((i) => i.id === "kurtaA") && !p.zones.folded.all.some((i) => i.id === "kurtaA"));

  // Unavailable (non-archived) stays on board, off the available shelf.
  ok("board: unavailable item on board but not in available shelf", p.boardItems.some((i) => i.id === "shirtUnavail") && !inAnyAvailable("shirtUnavail"));
}

// --- 200 seeded items: reachable, no dup, no missing, stable, no throw ---
{
  const cats = ["shirt", "jeans", "kurta", "sneakers", "belt"];
  const many: WardrobeItem[] = Array.from({ length: 200 }, (_, i) =>
    mkItem({ id: `it${i}`, category: cats[i % cats.length], availability_status: i % 17 === 0 ? "in_wash" : i % 23 === 0 ? "archived" : "available" }),
  );
  const p = partitionBoardItems(many);
  const archived = many.filter((i) => i.availability_status === "archived").length;
  const placements = ZONE_ORDER.flatMap((z) => p.zones[z].all.map((i) => i.id));
  ok("200: every non-archived item reachable via a zone", placements.length === 200 - archived);
  ok("200: no duplicate placements", new Set(placements).size === placements.length);
  ok("200: no missing ids (all non-archived present)", many.filter((i) => i.availability_status !== "archived").every((i) => placements.includes(i.id)));

  // Stable ordering across runs.
  const run = () => ZONE_ORDER.flatMap((z) => partitionBoardItems(many).zones[z].all.map((i) => i.id)).join(",");
  ok("200: stable ordering across runs", run() === run());
}

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) {
  console.log("FAILURES:\n - " + fails.join("\n - "));
  process.exit(1);
}
process.exit(0);
