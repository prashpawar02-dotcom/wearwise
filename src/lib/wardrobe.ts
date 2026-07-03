// =====================================================================
// WearWise — wardrobe helpers for the "Closet Board"
// Pure, dependency-free (safe on server + client). Maps a wardrobe item to a
// real-life closet zone and to a garment illustration for the photo fallback.
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type { GarmentKind } from "@/components/ui/Icon";

export type Zone = "hanging" | "folded" | "occasion" | "shoes" | "accessories";

// Board order: Hanging → Folded → Occasion & Traditional → Shoes → Accessories.
export const ZONE_ORDER: Zone[] = ["hanging", "folded", "occasion", "shoes", "accessories"];

export const ZONE_META: Record<Zone, { title: string; subtitle: string }> = {
  hanging: { title: "Hanging Rail", subtitle: "Tops, shirts, jackets, layers" },
  folded: { title: "Folded Shelf", subtitle: "Bottoms, tees, knits, folded pieces" },
  occasion: { title: "Occasion & Traditional", subtitle: "Festive, ethnic & formal wear" },
  shoes: { title: "Shoe Rack", subtitle: "Shoes that complete the outfit" },
  accessories: { title: "Accessories Tray", subtitle: "Finishing pieces" },
};

function itemText(item: WardrobeItem): string {
  return [item.category, item.sub_category, item.user_facing_name]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" ")
    .toLowerCase();
}

/**
 * Map an item to one of the closet zones. Order matters: shoes and occasion/
 * traditional (special pieces) are checked before the general hanging/folded
 * split, then accessories, with a category fallback.
 */
export function zoneForItem(item: WardrobeItem): Zone {
  const t = itemText(item);
  if (/(shoe|sneaker|trainer|loafer|boot|sandal|heel|jutti|mojari|flat|footwear)/.test(t)) return "shoes";
  // Special / traditional / formal event wear (culture-aware, not culture-locked)
  if (/(saree|sari|lehenga|sherwani|anarkali|kurta|kurti|dupatta|festive|ethnic|gown|tuxedo|ceremon|wedding|sari|salwar suit|churidar suit|abaya|kaftan)/.test(t)) return "occasion";
  if (/(belt|watch|bag|clutch|purse|scarf|stole|cap|hat|hijab|tie|jewel|necklace|earring|bangle|bracelet|accessor)/.test(t)) return "accessories";
  if (/(t-shirt|tshirt|tee|sweater|hoodie|knit|cardigan|jean|denim|trouser|chino|short|legging|palazzo|jogger|skirt|salwar|churidar|bottom)/.test(t)) return "folded";
  if (/(shirt|blouse|top|jacket|blazer|coat|overshirt|dress|layer)/.test(t)) return "hanging";

  const cat = (item.category ?? "").trim().toLowerCase();
  if (cat === "footwear") return "shoes";
  if (cat === "saree" || cat === "kurta") return "occasion";
  if (cat === "dupatta") return "occasion";
  if (cat === "accessory") return "accessories";
  if (cat === "bottom") return "folded";
  if (cat === "dress" || cat === "top" || cat === "outerwear") return "hanging";
  return "hanging";
}

/** Map an item to the closest garment illustration (used when no photo exists). */
export function garmentKindForItem(item: WardrobeItem): GarmentKind {
  const t = itemText(item);
  if (/(jean|denim)/.test(t)) return "Jeans";
  if (/(trouser|chino|pant|legging|palazzo|jogger|salwar|churidar|bottom)/.test(t)) return "Pants";
  if (/skirt/.test(t)) return "Skirt";
  if (/(saree|sari|gown|dress|anarkali|lehenga|kurta|kurti)/.test(t)) return "Dress";
  if (/(sneaker|trainer)/.test(t)) return "Sneaker";
  if (/(shoe|loafer|heel|sandal|jutti|mojari|flat|boot|footwear)/.test(t)) return "Loafer";
  if (/(jacket|blazer|coat|overshirt|cardigan|sherwani)/.test(t)) return "Jacket";
  if (/(sweater|hoodie|knit|pullover)/.test(t)) return "Sweater";
  if (/belt/.test(t)) return "Belt";
  if (/(watch|accessor|jewel|bag|clutch|earring|necklace|bangle|bracelet|cap|hat|scarf|stole|dupatta|tie)/.test(t)) return "Watch";
  if (/(t-shirt|tshirt|tee)/.test(t)) return "Tshirt";
  return "Shirt";
}

/** Map a colour name to a swatch hex for the garment fallback tiles. */
export function colorToHex(color?: string | null): string {
  const map: Record<string, string> = {
    white: "#F4F0E8", ivory: "#F2ECE0", cream: "#F2ECE0", beige: "#E3D8C6",
    black: "#1C1A17", grey: "#8A857C", gray: "#8A857C", charcoal: "#2B2925",
    navy: "#2A3852", blue: "#3A4E7A", "sky blue": "#9DB6D6",
    red: "#9E3B36", maroon: "#5A2330", pink: "#C98BA0", rose: "#C98BA0",
    green: "#5E7351", olive: "#6B6A3A", sage: "#8AA17C",
    yellow: "#D8B24A", gold: "#B8915A", mustard: "#C79A3E",
    brown: "#7B4B2E", tan: "#B98D63", camel: "#B98D63",
    purple: "#5C4A6E", plum: "#4A2C3D", lavender: "#C4BBD4",
    orange: "#C77A5A", terracotta: "#C77A5A",
  };
  const key = (color ?? "").trim().toLowerCase();
  return map[key] ?? "#EAE3D7";
}

// ---- Item state badges — derived ONLY from real metadata (never faked) ----

export type ItemBadge = { label: string; tone: "champagne" | "plum" | "sage" };

const DAY_MS = 86_400_000;

/** Whole days since a date string, or null. */
export function daysSince(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

/**
 * A single, honest state badge for an item. Priority: needs-review/analyzing
 * (from ai_tag_status) → quiet gem (worn, but not for 45+ days) → recently
 * worn (within 7 days). Returns null when there's nothing real to show. No
 * favorites / high-value / outfit-count claims (that data does not exist yet).
 */
export function itemBadge(item: WardrobeItem): ItemBadge | null {
  if (item.ai_tag_status === "needs_review") return { label: "Needs review", tone: "champagne" };
  if (item.ai_tag_status === "analyzing") return { label: "Analyzing", tone: "champagne" };
  const d = daysSince(item.last_worn_at);
  if (d != null) {
    if (d >= 45) return { label: "Quiet gem", tone: "plum" };
    if (d <= 7) return { label: "Recently worn", tone: "sage" };
  }
  return null;
}

/** "Last worn" helper for item cards; null when never recorded. */
export function lastWornLabel(item: WardrobeItem): string | null {
  const d = daysSince(item.last_worn_at);
  if (d == null) return null;
  if (d <= 0) return "Worn today";
  if (d === 1) return "Worn yesterday";
  if (d < 30) return `Worn ${d} days ago`;
  const months = Math.round(d / 30);
  return `Worn ${months} ${months === 1 ? "month" : "months"} ago`;
}
