// =====================================================================
// WearWise — Engine v2 HARD FILTER layer (Phase 1)
// Ordered and FAIL-CLOSED: anything we cannot positively confirm as safe is
// excluded. Two entry points:
//   eligiblePool()      — per-item filters that shrink the candidate pool
//   candidateRejection() — per-outfit filters that reject an assembled look
// Order (handbook §5 P1): availability · weather/fabric · formality window ·
// cultural pairing legality · modesty floor · user exclusions · structure
// completeness · piece-count cap.
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type { EngineContext, FilterRejection } from "@/lib/engine/types";
import { validateOutfitItems } from "@/lib/outfitValidation";
import {
  engineRole, fabricMaxTempC, formalityOf, colorFamilyOf, looksEthnic,
  culturalTagOf, modestyOf, isActivewear, matchesRuleKey, itemText,
} from "@/lib/engine/classify";
import { patternClashGuard, dupattaLayerGuard, shoeCompatibilityGuard } from "@/lib/engine/guards";

export interface PoolRejection { item: WardrobeItem; filter: string; reason: string; }
export interface PoolResult { pool: WardrobeItem[]; rejected: PoolRejection[]; }

/** Is an item usable at all (tags resolved, has a real role)? */
function isTagUsable(i: WardrobeItem): boolean {
  return i.ai_tag_status !== "analyzing" && i.ai_tag_status !== "failed";
}

/** availability filter — never surface in_wash / unavailable / archived items. */
function isAvailable(i: WardrobeItem): boolean {
  return (i.availability_status ?? "available") === "available";
}

/** formality window: item formality within the occasion window (fail closed). */
function passesFormalityWindow(i: WardrobeItem, ctx: EngineContext): boolean {
  if (ctx.profile.bypassFormality) return true; // gym: comfort, not formality
  const f = formalityOf(i);
  if (f == null) {
    // Unknown formality may only enter low-stakes occasions (floor ≤ 2). This
    // guarantees formal occasions (interview: floor 4) never get an unknown.
    return ctx.profile.formalityMin <= 2;
  }
  return f >= ctx.profile.formalityMin && f <= ctx.profile.formalityMax;
}

/** weather/fabric exclusion — too-warm fabric on a hot day is excluded. */
function passesWeather(i: WardrobeItem, ctx: EngineContext): boolean {
  const t = ctx.weather.tempC;
  if (t == null) return true;
  const ceiling = fabricMaxTempC(i);
  if (ceiling != null && t >= ceiling) return false; // e.g. wool (24) at 30°C
  return true;
}

/** user absolute exclusions — colors / categories / footwear the user vetoes. */
function passesUserExclusions(i: WardrobeItem, ctx: EngineContext): boolean {
  const p = ctx.preferences;
  const color = colorFamilyOf(i);
  if (p.excludedColors.map((c) => c.toLowerCase()).includes(color)) return false;
  const cat = (i.category ?? "").toLowerCase();
  if (p.excludedCategories.map((c) => c.toLowerCase()).includes(cat)) return false;
  if (engineRole(i) === "footwear") {
    const t = itemText(i);
    if (p.excludedFootwear.some((k) => t.includes(k.toLowerCase()))) return false;
  }
  return true;
}

/**
 * Ordered per-item filtering. Returns the eligible pool + rejection reasons.
 * FAIL CLOSED throughout.
 */
export function eligiblePool(items: WardrobeItem[], ctx: EngineContext): PoolResult {
  const pool: WardrobeItem[] = [];
  const rejected: PoolRejection[] = [];
  const push = (item: WardrobeItem, filter: string, reason: string) => rejected.push({ item, filter, reason });

  for (const i of items) {
    const role = engineRole(i);
    if (role === "unknown" || !isTagUsable(i)) { push(i, "structure", "Unclassifiable or still tagging."); continue; }
    if (!isAvailable(i)) { push(i, "availability", "In the wash or unavailable."); continue; }
    // cultural confirmation: ethnic-looking items with an unconfirmed cultural_tag
    // are held back from auto-recommendation until the user confirms.
    if (looksEthnic(i) && culturalTagOf(i) == null) { push(i, "cultural_unconfirmed", "Ethnic item with unconfirmed cultural tag."); continue; }
    if (!passesWeather(i, ctx)) { push(i, "weather", "Fabric too warm for today."); continue; }
    if (!passesFormalityWindow(i, ctx)) { push(i, "formality_window", "Outside the occasion's formality window."); continue; }
    if (!passesUserExclusions(i, ctx)) { push(i, "user_exclusion", "Matches a user absolute exclusion."); continue; }

    // Gym / activewear-only occasions: keep only activewear apparel + footwear;
    // drop accessories entirely.
    if (ctx.profile.activewearOnly) {
      if (role === "accessory") { push(i, "gym_no_accessory", "No accessories for the gym."); continue; }
      const activeRole = role === "activewear_top" || role === "activewear_bottom";
      const footwearOk = role === "footwear"; // trainers/sports shoes are fine
      if (!activeRole && !footwearOk && !isActivewear(i)) { push(i, "activewear_only", "Not activewear."); continue; }
    }

    pool.push(i);
  }
  return { pool, rejected };
}

/** cultural pairing legality via the seeded ethnic rule table (data rows). */
function culturalRejection(items: WardrobeItem[], ctx: EngineContext): FilterRejection | null {
  for (const rule of ctx.ethnicRules) {
    const hasSubject = items.some((i) => matchesRuleKey(i, rule.subjectKey));
    if (!hasSubject) continue;
    const hasObject = items.some((i) => matchesRuleKey(i, rule.objectKey));
    if (rule.kind === "forbid" && hasObject) {
      return { filter: "cultural_pairing", reason: rule.message };
    }
    if (rule.kind === "require" && !hasObject) {
      return { filter: "cultural_pairing", reason: rule.message };
    }
  }
  return null;
}

/** modesty floor — every core garment must meet the user's minimum. */
function modestyRejection(items: WardrobeItem[], ctx: EngineContext): FilterRejection | null {
  const floor = ctx.preferences.modestyFloor;
  if (floor <= 1) return null;
  for (const i of items) {
    const m = modestyOf(i);
    if (m != null && m < floor) {
      return { filter: "modesty_floor", reason: `An item is below your modesty preference (${m} < ${floor}).` };
    }
  }
  return null;
}

/** user avoid_with — item-level "never pair me with X" (id or keyword). */
function avoidWithRejection(items: WardrobeItem[]): FilterRejection | null {
  const ids = new Set(items.map((i) => i.id));
  for (const i of items) {
    for (const key of i.avoid_with ?? []) {
      if (ids.has(key)) return { filter: "avoid_with", reason: "Two items the user marked as never-together." };
      const hit = items.some((o) => o.id !== i.id && itemText(o).includes(key.toLowerCase()));
      if (hit) return { filter: "avoid_with", reason: `Paired with an avoided type ("${key}").` };
    }
  }
  return null;
}

/**
 * Ordered per-candidate rejection. Returns the FIRST failing filter, or null
 * if the outfit passes every hard rule. FAIL CLOSED.
 */
export function candidateRejection(items: WardrobeItem[], ctx: EngineContext): FilterRejection | null {
  // cultural pairing legality (belt+kurta, dupatta+western, lehenga requires choli…)
  const cultural = culturalRejection(items, ctx);
  if (cultural) return cultural;

  // dupatta/layer + pattern-clash + shoe-compatibility guards (hard)
  const dup = dupattaLayerGuard(items);
  if (dup) return dup;
  const pat = patternClashGuard(items, ctx);
  if (pat) return pat;
  const shoe = shoeCompatibilityGuard(items, ctx);
  if (shoe) return shoe;

  // modesty floor
  const modesty = modestyRejection(items, ctx);
  if (modesty) return modesty;

  // user avoid_with
  const avoid = avoidWithRejection(items);
  if (avoid) return avoid;

  // structure completeness — reuse the shared 3-place validator (extended).
  const structure = validateOutfitItems(items);
  if (!structure.valid) return { filter: "structure", reason: structure.reason ?? "Incomplete outfit." };

  // piece-count cap by occasion
  if (items.length > ctx.profile.maxPieces) {
    return { filter: "piece_count", reason: `Too many pieces (${items.length} > ${ctx.profile.maxPieces}).` };
  }
  return null;
}
