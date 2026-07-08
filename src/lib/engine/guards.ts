// =====================================================================
// WearWise — Engine v2 named guards (Phase 1)
// Each guard is a small, independently testable function. Guards used as
// HARD rejections (pattern clash, dupatta/layer, shoe compatibility) return
// a rejection or null. AccessoryRelevanceGuard returns a justification object
// used by BOTH assembly (whether to add) and scoring (penalty if unjustified).
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type { EngineContext, FilterRejection } from "@/lib/engine/types";
import {
  engineRole, isDupatta, isSaree, patternBoldness, formalityOf,
  isBelt, itemText,
} from "@/lib/engine/classify";

const CORE_ROLES = new Set(["upper", "ethnic_upper", "bottom", "one_piece", "saree", "outerwear"]);

/** ≤1 bold pattern (boldness ≥ 2) among core garments. */
export function patternClashGuard(items: WardrobeItem[], ctx: EngineContext): FilterRejection | null {
  const max = ctx.config.thresholds.max_bold_patterns;
  const bold = items.filter((i) => CORE_ROLES.has(engineRole(i)) && patternBoldness(i) >= 2);
  if (bold.length > max) {
    return { filter: "pattern_clash", reason: `More than ${max} bold pattern in one look (${bold.length}).` };
  }
  return null;
}

/** A dupatta/drape may only appear on an ethnic look (kurta set or saree). */
export function dupattaLayerGuard(items: WardrobeItem[]): FilterRejection | null {
  const hasDrape = items.some(isDupatta);
  if (!hasDrape) return null;
  const hasEthnicAnchor = items.some((i) => engineRole(i) === "ethnic_upper" || isSaree(i));
  if (!hasEthnicAnchor) {
    return { filter: "dupatta_layer", reason: "A dupatta needs an ethnic anchor (kurta or saree) — not a western look." };
  }
  return null;
}

/**
 * Footwear formality must sit within a sensible band of the occasion's window
 * (target ±2). Prevents e.g. sport sandals with an interview suit.
 */
export function shoeCompatibilityGuard(items: WardrobeItem[], ctx: EngineContext): FilterRejection | null {
  const shoes = items.filter((i) => engineRole(i) === "footwear");
  if (shoes.length === 0) return null;
  if (ctx.profile.bypassFormality) return null; // gym: comfort rules, not formality
  const lo = ctx.profile.formalityMin - 2;
  const hi = ctx.profile.formalityMax + 1;
  for (const s of shoes) {
    const f = s.footwear_formality ?? formalityOf(s);
    if (f != null && (f < lo || f > hi)) {
      return { filter: "shoe_compatibility", reason: `Footwear formality ${f} is off for this occasion (${lo}-${hi}).` };
    }
  }
  return null;
}

export interface AccessoryJustification {
  justified: boolean;
  reason: string;
}

/**
 * AccessoryRelevanceGuard — default is NO accessory. An accessory earns its
 * place only via one of: formality gap (dressy occasion), festive occasion,
 * a user favorite, or a weather need (e.g. scarf when cold). Returns whether a
 * SPECIFIC accessory is justified for the current context.
 */
export function accessoryRelevanceGuard(
  accessory: WardrobeItem,
  ctx: EngineContext,
): AccessoryJustification {
  // Belts are handled by the ethnic rule table for ethnic looks; here we only
  // reason about general accessory relevance.
  if (ctx.preferences.favoriteItemIds.includes(accessory.id)) {
    return { justified: true, reason: "One of your favourites." };
  }
  if (ctx.profile.accessoryPolicy === "encouraged" || ctx.profile.occasion === "festive") {
    return { justified: true, reason: "Adds polish for a dressed-up occasion." };
  }
  if (ctx.profile.formalityTarget >= 4 && !isBelt(accessory)) {
    return { justified: true, reason: "Lifts the look to the occasion's formality." };
  }
  const t = itemText(accessory);
  if (ctx.weather.tempC != null && ctx.weather.tempC <= 16 && /(scarf|stole|shawl)/.test(t)) {
    return { justified: true, reason: "Warmth for a cool day." };
  }
  return { justified: false, reason: "No clear reason to add an accessory today." };
}
