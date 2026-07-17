// =====================================================================
// WearWise — Engine v2 item classification (Phase 1)
// Pure helpers that read the new structured columns FIRST and fall back to
// free-text keyword detection. This is the single vocabulary every stage
// (filters / scoring / guards / templates) shares, so behaviour is
// consistent and testable.
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type { EngineRole } from "@/lib/engine/types";

export function itemText(i: WardrobeItem): string {
  return [i.user_facing_name, i.sub_category, i.category, i.style, i.notes, i.fabric]
    .filter(Boolean).join(" ").toLowerCase();
}

// ---- keyword predicates -------------------------------------------------
const RE = {
  kurta: /\b(kurta|kurti)\b/,
  choli: /\b(choli|blouse)\b/,
  saree: /\b(saree|sari)\b/,
  lehenga: /\b(lehenga|ghagra|chaniya)\b/,
  dupatta: /\b(dupatta|odhani|chunni|stole)\b/,
  dress: /\b(dress|gown|jumpsuit|anarkali|frock|maxi|midi|bodycon|shift|romper)\b/,
  jeans: /\b(jean|jeans|denim)\b/,
  belt: /\bbelt\b/,
  bottom: /\b(jean|jeans|denim|trouser|chino|pant|pants|legging|palazzo|skirt|jogger|short|shorts|dhoti|culotte|capri|salwar|churidar|patiala|sharara|garara|track ?pant|leggings)\b/,
  upper: /\b(shirt|tee|t-?shirt|top|blouse|polo|henley|camisole|cami|crop|tank|tunic)\b/,
  outerwear: /\b(jacket|blazer|coat|overshirt|cardigan|shrug|waistcoat|nehru|sherwani)\b/,
  footwear: /\b(shoe|sneaker|trainer|loafer|boot|sandal|heel|jutti|juti|mojari|flat|footwear|kolhapuri|pump)s?\b/,
  accessory: /\b(belt|watch|bag|clutch|purse|jewel|jewellery|jewelry|necklace|earring|earrings|bangle|bracelet|tie|brooch|scarf|hat|cap|sunglass)\b/,
  activewear: /\b(gym|sport|active|athletic|track ?pant|joggers|tracksuit|yoga|running|workout|dri-?fit|sweatpant|leggings)\b/,
};

export function isKurta(i: WardrobeItem): boolean {
  return (i.category ?? "").toLowerCase() === "kurta" || RE.kurta.test(itemText(i));
}
export function isSaree(i: WardrobeItem): boolean {
  return (i.category ?? "").toLowerCase() === "saree" || RE.saree.test(itemText(i));
}
export function isDupatta(i: WardrobeItem): boolean {
  return (i.category ?? "").toLowerCase() === "dupatta" || RE.dupatta.test(itemText(i));
}
export function isDressLike(i: WardrobeItem): boolean {
  return (i.category ?? "").toLowerCase() === "dress" || RE.dress.test(itemText(i));
}
export function isLehenga(i: WardrobeItem): boolean { return RE.lehenga.test(itemText(i)); }
export function isBelt(i: WardrobeItem): boolean { return RE.belt.test(itemText(i)); }
export function isJeans(i: WardrobeItem): boolean { return RE.jeans.test(itemText(i)); }

/** Activewear: explicit fabric/tags or gym keywords. */
export function isActivewear(i: WardrobeItem): boolean {
  const tags = (i.weather_tags ?? []).join(" ").toLowerCase();
  return RE.activewear.test(itemText(i)) || /active|sport|athletic/.test(tags) ||
    (i.occasion_tags ?? []).some((o) => String(o) === "gym");
}

/** Normalized garment role. Structured category wins; keyword fallback next. */
export function engineRole(i: WardrobeItem): EngineRole {
  const cat = (i.category ?? "").trim().toLowerCase();
  const active = isActivewear(i);

  // category-first
  switch (cat) {
    case "kurta": return "ethnic_upper";
    case "saree": return "saree";
    case "dupatta": return "drape";
    case "dress": return "one_piece";
    case "outerwear": return "outerwear";
    case "footwear": return "footwear";
    case "accessory": return "accessory";
    case "top":
      return active ? "activewear_top" : "upper";
    case "bottom":
      return active ? "activewear_bottom" : "bottom";
  }

  // keyword fallback (specific first)
  const t = itemText(i);
  if (RE.outerwear.test(t)) return "outerwear";
  if (isSaree(i)) return "saree";
  if (isDupatta(i)) return "drape";
  if (isDressLike(i)) return "one_piece";
  if (RE.footwear.test(t)) return "footwear";
  if (RE.accessory.test(t)) return "accessory";
  if (isKurta(i)) return "ethnic_upper";
  if (RE.bottom.test(t)) return active ? "activewear_bottom" : "bottom";
  if (RE.upper.test(t)) return active ? "activewear_top" : "upper";
  return "unknown";
}

/** Coarse fabric label (column first, then text). */
export function fabricOf(i: WardrobeItem): string | null {
  if (i.fabric) return i.fabric.toLowerCase();
  const t = itemText(i);
  const m = t.match(/\b(cotton|linen|denim|wool|woolen|woollen|silk|velvet|leather|polyester|nylon|synthetic|georgette|chiffon|satin|rayon|khadi|jute|corduroy|fleece)\b/);
  return m ? m[1] : null;
}

/**
 * Warmest ambient temperature (°C) at which a fabric is still comfortable.
 * Heavy/insulating fabrics get a low ceiling → excluded on hot days.
 * Returns null when there is no fabric-based ceiling.
 */
export function fabricMaxTempC(i: WardrobeItem): number | null {
  if (typeof i.max_temp_c === "number") return i.max_temp_c;
  const f = fabricOf(i);
  if (!f) return null;
  if (/(wool|woolen|woollen|velvet|fleece|corduroy|leather)/.test(f)) return 24;
  if (/(silk|satin)/.test(f)) return 34;
  return null; // breathable / unknown → no ceiling
}

/** Coldest temperature (°C) a light fabric is comfortable at (soft signal). */
export function fabricMinTempC(i: WardrobeItem): number | null {
  if (typeof i.min_temp_c === "number") return i.min_temp_c;
  return null;
}

/** Item formality (column first). NULL = unknown. */
export function formalityOf(i: WardrobeItem): number | null {
  return typeof i.formality === "number" ? i.formality : null;
}

/** Pattern boldness 0..3 (column first, then pattern text). */
export function patternBoldness(i: WardrobeItem): number {
  if (typeof i.pattern_boldness === "number") return i.pattern_boldness;
  const p = (i.pattern ?? "").toLowerCase();
  if (!p || p === "solid" || p === "plain") return 0;
  if (/(embroider|floral|sequin)/.test(p)) return 3;
  if (/(strip|check|print)/.test(p)) return 2;
  return 1;
}

/** Color family (column first, then color text mapping). */
export function colorFamilyOf(i: WardrobeItem): string {
  if (i.color_family) return i.color_family.toLowerCase();
  return (i.color ?? "").trim().toLowerCase() || "unknown";
}

export function isNeutralColor(color: string, neutrals: string[]): boolean {
  return neutrals.includes(color);
}

export function culturalTagOf(i: WardrobeItem): string | null {
  return i.cultural_tag ? i.cultural_tag.toLowerCase() : null;
}

/** True if the item LOOKS ethnic (used to enforce cultural_tag confirmation). */
export function looksEthnic(i: WardrobeItem): boolean {
  return isKurta(i) || isSaree(i) || isDupatta(i) || isLehenga(i) ||
    /\b(anarkali|sherwani|choli|salwar|churidar|ethnic|traditional)\b/.test(itemText(i));
}

export function modestyOf(i: WardrobeItem): number | null {
  return typeof i.modesty_level === "number" ? i.modesty_level : null;
}

/**
 * Does an item match a pairing-rule key such as 'kurta','belt','dupatta',
 * 'western_top','jeans','dress','lehenga','choli','saree'?
 */
export function matchesRuleKey(i: WardrobeItem, key: string): boolean {
  switch (key) {
    case "kurta": return isKurta(i);
    case "saree": return isSaree(i);
    case "dupatta": return isDupatta(i);
    case "belt": return isBelt(i);
    case "jeans": return isJeans(i);
    case "dress": return isDressLike(i);
    case "lehenga": return isLehenga(i);
    case "choli": return RE.choli.test(itemText(i));
    case "western_top":
      // a plain western upper (not a kurta), typically worn with pants/jeans
      return engineRole(i) === "upper" && !isKurta(i);
    default:
      return itemText(i).includes(key);
  }
}

// =====================================================================
// Cultural role resolution (Phase 4 hotfix — locked decision 1)
// Trust ONLY structured ethnic categories to derive an effective cultural
// role when cultural_tag is null. Generic Top/Bottom/Dress whose free text
// merely looks ethnic stay fail-closed. We NEVER write/backfill cultural_tag.
// =====================================================================
export type CulturalSource = "explicit_category" | "keyword_inference" | "none";

/** Structured ethnic categories the schema supports today (locked to these). */
export const EXPLICIT_ETHNIC_CATEGORIES: ReadonlySet<string> = new Set([
  "kurta", "saree", "dupatta",
]);

export interface CulturalResolution {
  /** The item carries an ethnic role for pairing/eligibility. */
  effectiveEthnic: boolean;
  /** Provenance of that decision (recorded in diagnostics, never persisted to the row). */
  source: CulturalSource;
  /** True when the item may be auto-recommended without a confirmed cultural_tag. */
  eligibleWithoutTag: boolean;
}

/**
 * Resolve an item's cultural standing WITHOUT mutating it.
 *  - explicit structured ethnic category (Kurta/Saree/Dupatta) → trusted,
 *    eligible even when cultural_tag is null (source = "explicit_category").
 *  - generic category but ethnic-looking free text → keyword_inference; only
 *    eligible once cultural_tag is confirmed (fail closed).
 *  - otherwise not ethnic.
 */
export function culturalResolution(i: WardrobeItem): CulturalResolution {
  const cat = (i.category ?? "").trim().toLowerCase();
  if (EXPLICIT_ETHNIC_CATEGORIES.has(cat)) {
    return { effectiveEthnic: true, source: "explicit_category", eligibleWithoutTag: true };
  }
  if (looksEthnic(i)) {
    const confirmed = culturalTagOf(i) != null;
    return { effectiveEthnic: true, source: "keyword_inference", eligibleWithoutTag: confirmed };
  }
  return { effectiveEthnic: false, source: "none", eligibleWithoutTag: true };
}

/** Diagnostics-only provenance label for an item's cultural role. */
export function culturalSourceOf(i: WardrobeItem): CulturalSource {
  return culturalResolution(i).source;
}
