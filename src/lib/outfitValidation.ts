// =====================================================================
// WearWise — outfit structure validation
// Pure, dependency-free TypeScript so it is safe to import on the server
// (API routes) AND in client components (the admin curation UI).
//
// Purpose: stop the AI (and manual edits) from producing physically
// impossible looks like kurta + kurta or kurta + t-shirt. We map each
// wardrobe item to a normalized garment ROLE and check the combination.
// =====================================================================

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

// Exact category -> role (categories are a fixed, known set in this app).
const CATEGORY_ROLE: Record<string, GarmentRole> = {
  top: "upper",
  kurta: "upper", // ethnic upper; pairs with a bottom (+ optional dupatta)
  bottom: "bottom",
  dress: "one_piece",
  saree: "one_piece",
  dupatta: "dupatta",
  footwear: "footwear",
  outerwear: "outerwear",
  accessory: "accessory",
};

// Keyword fallback when category is missing/unknown. Ordered: more specific
// roles first so generic words like "top" don't shadow real matches.
const KEYWORD_ROLE: ReadonlyArray<readonly [GarmentRole, readonly string[]]> = [
  ["outerwear", ["jacket", "blazer", "cardigan", "coat"]],
  ["one_piece", ["dress", "anarkali", "gown", "saree", "jumpsuit"]],
  ["dupatta", ["dupatta", "stole", "scarf"]],
  ["footwear", ["shoes", "sandal", "heel", "sneaker", "jutti", "juttis", "mojari", "flats"]],
  ["accessory", ["necklace", "earring", "earrings", "bracelet", "bag", "belt", "clutch"]],
  ["bottom", ["jeans", "trouser", "pant", "palazzo", "salwar", "churidar", "legging", "skirt", "lehenga"]],
  ["upper", ["kurta", "kurti", "t-shirt", "tshirt", "tee", "shirt", "blouse", "top"]],
];

function itemText(item: RoleClassifiableItem): string {
  return [item.category, item.sub_category, item.user_facing_name, item.name]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" ")
    .toLowerCase();
}

/** True if the item is a kurta/kurti specifically (a single ethnic upper). */
export function isKurtaItem(item: RoleClassifiableItem): boolean {
  const cat = (item.category ?? "").trim().toLowerCase();
  if (cat === "kurta") return true;
  const text = itemText(item);
  return text.includes("kurta") || text.includes("kurti");
}

/** Normalize a wardrobe item to a single garment role. */
export function roleForItem(item: RoleClassifiableItem): GarmentRole {
  const cat = (item.category ?? "").trim().toLowerCase();
  if (cat && CATEGORY_ROLE[cat]) return CATEGORY_ROLE[cat];

  const text = itemText(item);
  if (!text) return "unknown";
  for (const [role, keywords] of KEYWORD_ROLE) {
    if (keywords.some((k) => text.includes(k))) return role;
  }
  return "unknown";
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
  const count = (r: GarmentRole) => roles.filter((x) => x === r).length;

  const upper = count("upper");
  const bottom = count("bottom");
  const onePiece = count("one_piece") + count("outfit_reference");
  const unknown = count("unknown");

  const kurtaCount = items.filter(isKurtaItem).length;
  const plainUpperCount = items.filter(
    (it) => roleForItem(it) === "upper" && !isKurtaItem(it)
  ).length;

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
    return { valid: true }; // upper + bottom (+ optional dupatta/accessory/footwear/outerwear)
  }

  // Nothing formed a valid structure (e.g. only accessories, or unknown items).
  if (unknown > 0) {
    return { valid: false, reason: "This look includes an unrecognized item and no clear top + bottom or one-piece." };
  }
  return { valid: false, reason: "Couldn't confirm a complete outfit — need a top + bottom, or a single one-piece." };
}

/** Resolve item ids against a lookup, then validate. Convenience for callers. */
export function validateOutfitByIds(
  itemIds: string[],
  itemsById: Map<string, RoleClassifiableItem>
): ValidationResult {
  const items: RoleClassifiableItem[] = [];
  for (const id of itemIds) {
    const it = itemsById.get(id);
    if (it) items.push(it);
  }
  return validateOutfitItems(items);
}
