// =====================================================================
// WearWise — outfit STRUCTURE validation
// Pure, dependency-free enough to import on the server (API routes) AND in
// client components (the admin curation UI).
//
// Purpose: stop the AI (and manual edits) from producing physically
// impossible looks like kurta + kurta or kurta + t-shirt.
//
// LOCKED DECISION 2: this module no longer owns a garment-role classification
// table. Every item role is sourced from the single authoritative classifier
// `engineRole` (engine/classify). This module keeps ONLY the structural outfit
// rules (core slots, one-piece rules, saree/drape requirements, incompatible
// combinations, accessory constraints).
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type { EngineRole } from "@/lib/engine/types";
import { engineRole, isKurta, isSaree, isBelt, isLehenga, itemText } from "@/lib/engine/classify";

export type GarmentRole =
  | "upper"
  | "bottom"
  | "one_piece"
  | "outerwear"
  | "footwear"
  | "accessory"
  | "dupatta"
  | "unknown"
  | "outfit_reference";

/** Minimal shape needed to classify an item. WardrobeItem satisfies this. */
export interface RoleClassifiableItem {
  category?: string | null;
  sub_category?: string | null;
  user_facing_name?: string | null;
  name?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Adapt a minimal RoleClassifiableItem to the WardrobeItem shape the engine
 * classifier reads. `name` is mapped onto `user_facing_name` so legacy callers
 * that only set `name` still classify. All fields the engine reads are optional,
 * so the cast is runtime-safe.
 */
function asItem(i: RoleClassifiableItem): WardrobeItem {
  return {
    ...(i as Record<string, unknown>),
    user_facing_name: i.user_facing_name ?? i.name ?? null,
  } as unknown as WardrobeItem;
}

/** Map the authoritative EngineRole onto the coarse structural GarmentRole. */
function garmentRoleFromEngine(r: EngineRole): GarmentRole {
  switch (r) {
    case "upper":
    case "ethnic_upper":
    case "activewear_top":
      return "upper";
    case "bottom":
    case "activewear_bottom":
      return "bottom";
    case "one_piece":
    case "saree":
      return "one_piece";
    case "outerwear":
      return "outerwear";
    case "drape":
      return "dupatta";
    case "footwear":
      return "footwear";
    case "accessory":
      return "accessory";
    default:
      return "unknown";
  }
}

/** Normalize a wardrobe item to a single structural garment role (via engineRole). */
export function roleForItem(item: RoleClassifiableItem): GarmentRole {
  return garmentRoleFromEngine(engineRole(asItem(item)));
}

/** True if the item is a kurta/kurti specifically (a single ethnic upper). */
export function isKurtaItem(item: RoleClassifiableItem): boolean {
  return isKurta(asItem(item));
}

/** True if the item is a belt specifically (must not sit over ethnic wear). */
export function isBeltItem(item: RoleClassifiableItem): boolean {
  return isBelt(asItem(item));
}

/** True if the item is a saree/sari (a one-piece ethnic anchor). */
export function isSareeItem(item: RoleClassifiableItem): boolean {
  return isSaree(asItem(item));
}

/** True if the look has an ethnic anchor a dupatta can legitimately belong to. */
export function hasEthnicAnchor(items: RoleClassifiableItem[]): boolean {
  return items.some((i) => {
    const it = asItem(i);
    return isKurta(it) || isSaree(it) || isLehenga(it) || /\b(anarkali|choli|sherwani)\b/.test(itemText(it));
  });
}

/**
 * Validate that a set of items forms a realistic outfit.
 * Returns { valid, reason } — reason is a short, admin-friendly explanation.
 */
export function validateOutfitItems(items: RoleClassifiableItem[]): ValidationResult {
  if (!items || items.length === 0) {
    return { valid: false, reason: "This look has no items." };
  }

  const roles = items.map(roleForItem);

  // FAIL CLOSED: any item we can't classify blocks the whole look.
  if (roles.some((r) => r === "unknown")) {
    return {
      valid: false,
      reason: "This look includes an item with a missing or unrecognized type, so it can't be approved.",
    };
  }

  const count = (r: GarmentRole) => roles.filter((x) => x === r).length;

  const upper = count("upper");
  const bottom = count("bottom");
  const onePiece = count("one_piece") + count("outfit_reference");

  const kurtaCount = items.filter(isKurtaItem).length;
  const plainUpperCount = items.filter(
    (it) => roleForItem(it) === "upper" && !isKurtaItem(it)
  ).length;

  // --- cultural pairing legality (extends the fail-closed 3-place gate) ---
  const beltCount = items.filter(isBeltItem).length;
  if (beltCount >= 1 && (kurtaCount >= 1 || items.some(isSareeItem))) {
    return { valid: false, reason: "A belt isn't worn over a kurta or saree." };
  }
  const dupattaCount = roles.filter((r) => r === "dupatta").length;
  if (dupattaCount >= 1 && !hasEthnicAnchor(items)) {
    return { valid: false, reason: "A dupatta needs a kurta or saree — it doesn't pair with a western outfit." };
  }

  // --- one-piece rules ---
  if (onePiece > 1) {
    return { valid: false, reason: "Two full-body garments (e.g. two dresses or sarees) can't be worn together." };
  }
  if (onePiece === 1 && (upper > 0 || bottom > 0)) {
    return { valid: false, reason: "A dress, saree, or jumpsuit can't be paired with a separate top or bottom." };
  }

  // --- upper-layering rules (specific messages first) ---
  if (kurtaCount >= 2) {
    return { valid: false, reason: "Two kurtas can't be worn together." };
  }
  if (kurtaCount >= 1 && plainUpperCount >= 1) {
    return { valid: false, reason: "A kurta can't be combined with another top, shirt, or t-shirt." };
  }
  if (upper > 1) {
    return { valid: false, reason: "Two upper-body garments can't be worn together (a layering piece should be tagged as outerwear)." };
  }

  // A valid one-piece look (extras already restricted to allowed roles above).
  if (onePiece === 1) {
    return { valid: true };
  }

  // --- separates: must be top + bottom ---
  if (upper >= 1 && bottom === 0) {
    return { valid: false, reason: "This look has a top but no bottom (e.g. jeans, trousers, or skirt)." };
  }
  if (bottom > 1) {
    return { valid: false, reason: "Two bottoms can't be worn together." };
  }
  if (bottom >= 1 && upper === 0) {
    return { valid: false, reason: "This look has a bottom but no top." };
  }
  if (upper === 1 && bottom === 1) {
    return { valid: true };
  }

  return { valid: false, reason: "Couldn't confirm a complete outfit — need a top + bottom, or a single one-piece." };
}

/**
 * Resolve item ids against a lookup, then validate. FAILS CLOSED.
 */
export function validateOutfitByIds(
  itemIds: string[],
  itemsById: Map<string, RoleClassifiableItem>
): ValidationResult {
  if (!itemIds || itemIds.length === 0) {
    return { valid: false, reason: "This look has no items." };
  }
  const items: RoleClassifiableItem[] = [];
  for (const id of itemIds) {
    const it = itemsById.get(id);
    if (!it) {
      return {
        valid: false,
        reason: "An item in this look couldn't be found in the wardrobe, so it can't be approved.",
      };
    }
    items.push(it);
  }
  return validateOutfitItems(items);
}
