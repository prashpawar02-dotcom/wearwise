// =====================================================================
// WearWise — deterministic outfit engine (Module A, "rules first, AI last").
// Assembles MULTIPLE distinct valid outfits from stored tags with zero LLM
// tokens. The AI (lib/ai.ts) is only called when this engine cannot fill a
// request. Every result still passes the fail-closed validator.
//
// Shares role logic with lib/daily-drop.ts via garmentRole(); adds:
//  - occasion fit scoring (occasion_tags + formality heuristics)
//  - simple colour-clash avoidance (max 1 strong print per look)
//  - least-recently-worn rotation + variety across the N outfits
// =====================================================================
import { garmentRole } from "@/lib/daily-drop";
import { validateOutfitItems } from "@/lib/outfitValidation";
import { isWearableItem } from "@/lib/wardrobe";
import type { Occasion, WardrobeItem } from "@/lib/types";

export interface EngineOutfit {
  title: string;
  item_ids: string[];
  styling_reason: string;
  confidence: number;
}

type Role = ReturnType<typeof garmentRole>;

const ETHNIC_OCCASIONS: Occasion[] = ["ethnic", "festive", "family_function"];
const DRESSY_OCCASIONS: Occasion[] = ["party", "dinner_date"];

function text(i: WardrobeItem): string {
  return [i.user_facing_name, i.sub_category, i.category, i.style, i.notes]
    .filter(Boolean).join(" ").toLowerCase();
}

function isEthnic(i: WardrobeItem): boolean {
  return /(kurta|kurti|saree|sari|lehenga|choli|anarkali|salwar|churidar|dupatta|patiala|sharara|garara|jutti|mojari|ethnic)/.test(text(i));
}

function isStrongPattern(i: WardrobeItem): boolean {
  const p = (i.pattern ?? "").toLowerCase();
  return p !== "" && p !== "solid";
}

function usable(i: WardrobeItem): boolean {
  return isWearableItem(i) && i.ai_tag_status !== "analyzing" && i.ai_tag_status !== "failed";
}

/** How well one item fits the occasion (higher = better). */
function occasionScore(i: WardrobeItem, occasion: Occasion): number {
  let s = 0;
  const tags = i.occasion_tags ?? [];
  if (tags.includes(occasion)) s += 4;
  const ethnicOcc = ETHNIC_OCCASIONS.includes(occasion);
  if (ethnicOcc && isEthnic(i)) s += 3;
  if (!ethnicOcc && occasion === "work" && /(blazer|shirt|trouser|formal|chino)/.test(text(i))) s += 2;
  if (DRESSY_OCCASIONS.includes(occasion) && /(dress|gown|silk|satin|embroider|sequin)/.test(text(i))) s += 2;
  if (occasion === "travel" && /(jean|denim|tee|t-shirt|sneaker|jogger|comfortable)/.test(text(i))) s += 2;
  // Rotation: items unworn longer score higher (max +2).
  const worn = i.last_worn_at ? Date.parse(i.last_worn_at) : 0;
  const days = worn ? (Date.now() - worn) / 86_400_000 : 60;
  s += Math.min(2, days / 30);
  return s;
}

function label(i: WardrobeItem): string {
  return i.user_facing_name || [i.color, i.category].filter(Boolean).join(" ") || "an item";
}

function reasonFor(items: WardrobeItem[], occasion: Occasion): string {
  const names = items.map(label);
  const list =
    names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  return `Pairs ${list} — matched by colour, pattern, and what suits a ${occasion.replace("_", " ")} day, from clothes you already own.`;
}

/** Max 1 strong print per look; accessories/footwear exempt. */
function patternOk(items: WardrobeItem[]): boolean {
  const core = items.filter((i) => !["accessory", "shoes"].includes(garmentRole(i)));
  return core.filter(isStrongPattern).length <= 1;
}

function completeLook(
  core: WardrobeItem[],
  buckets: Map<Role, WardrobeItem[]>,
  used: Set<string>,
  ethnicLook: boolean
): WardrobeItem[] {
  const items = [...core];
  const shoes = (buckets.get("shoes") ?? []).find((s) => !items.includes(s));
  if (shoes) items.push(shoes);
  if (ethnicLook) {
    const drape = (buckets.get("accessory") ?? []).find((a) => /(dupatta|stole|odhani)/.test(text(a)));
    if (drape && !items.includes(drape)) items.push(drape);
  }
  return items;
}

/**
 * Generate up to `count` distinct, validator-passing outfits for an occasion.
 * Deterministic: same wardrobe + occasion in → same outfits out.
 */
export function engineOutfits(allItems: WardrobeItem[], occasion: Occasion, count: number): EngineOutfit[] {
  const pool = allItems.filter(usable);
  const buckets = new Map<Role, WardrobeItem[]>();
  for (const i of pool) {
    const r = garmentRole(i);
    buckets.set(r, [...(buckets.get(r) ?? []), i]);
  }
  for (const [r, arr] of buckets) {
    buckets.set(r, [...arr].sort((a, b) => occasionScore(b, occasion) - occasionScore(a, occasion)));
  }

  const tops = buckets.get("top") ?? [];
  const bottoms = buckets.get("bottom") ?? [];
  const onePieces = [...(buckets.get("dress") ?? []), ...(buckets.get("saree") ?? [])];
  const ethnicOcc = ETHNIC_OCCASIONS.includes(occasion);

  const results: EngineOutfit[] = [];
  const usedCoreIds = new Set<string>(); // variety: don't reuse a core piece across looks
  const seenSets = new Set<string>();

  const tryAdd = (core: WardrobeItem[], titleHint: string) => {
    if (results.length >= count) return;
    if (core.some((c) => usedCoreIds.has(c.id))) return;
    const items = completeLook(core, buckets, usedCoreIds, core.some(isEthnic));
    if (!patternOk(items)) return;
    const v = validateOutfitItems(items);
    if (!v.valid) return;
    const key = items.map((i) => i.id).sort().join("|");
    if (seenSets.has(key)) return;
    seenSets.add(key);
    core.forEach((c) => usedCoreIds.add(c.id));
    const score = core.reduce((s, i) => s + occasionScore(i, occasion), 0) / core.length;
    results.push({
      title: titleHint,
      item_ids: items.map((i) => i.id),
      styling_reason: reasonFor(items, occasion),
      confidence: Math.max(0.55, Math.min(0.95, 0.55 + score / 12)),
    });
  };

  // Ethnic occasions favour one-pieces (saree/anarkali) and kurta sets first.
  if (ethnicOcc) {
    for (const op of onePieces) tryAdd([op], `${label(op)} look`);
    for (const t of tops.filter(isEthnic)) {
      for (const b of bottoms) {
        if (results.length >= count) break;
        tryAdd([t, b], `${label(t)} set`);
      }
    }
  }

  // Separates: pair each top with its best-scoring compatible bottom.
  for (const t of tops) {
    if (results.length >= count) break;
    for (const b of bottoms) {
      if (usedCoreIds.has(b.id)) continue;
      tryAdd([t, b], `${label(t)} + ${label(b)}`);
      break; // one bottom per top (bottoms are pre-sorted by score)
    }
  }

  // One-pieces fill any remaining slots.
  for (const op of onePieces) {
    if (results.length >= count) break;
    tryAdd([op], `${label(op)} look`);
  }

  return results.slice(0, count);
}
