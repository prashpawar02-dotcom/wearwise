// =====================================================================
// WearWise — wardrobe helpers for the "Closet Board"
// Pure, dependency-free (safe on server + client). Maps a wardrobe item to a
// real-life closet zone and to a garment illustration for the photo fallback.
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type { GarmentKind } from "@/components/ui/Icon";

export type Zone = "hanging" | "folded" | "shoes" | "accessories";

export const ZONE_ORDER: Zone[] = ["hanging", "folded", "shoes", "accessories"];

export const ZONE_META: Record<Zone, { title: string; subtitle: string }> = {
  hanging: { title: "Hanging Rail", subtitle: "Shirts, jackets, layers" },
  folded: { title: "Folded Shelf", subtitle: "Tees, knits, denim, trousers" },
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
 * Map an item to one of the four closet zones. Checks the most specific zones
 * first (shoes, accessories), then folded (tees/knits/denim/bottoms), then
 * hanging (shirts/dresses/layers), with a category fallback.
 */
export function zoneForItem(item: WardrobeItem): Zone {
  const t = itemText(item);
  if (/(shoe|sneaker|trainer|loafer|boot|sandal|heel|jutti|mojari|flat|footwear)/.test(t)) return "shoes";
  if (/(belt|watch|bag|clutch|purse|scarf|stole|dupatta|cap|hat|jewel|necklace|earring|bangle|bracelet|accessor)/.test(t)) return "accessories";
  if (/(t-shirt|tshirt|tee|sweater|hoodie|knit|cardigan|jean|denim|trouser|chino|short|legging|palazzo|jogger|skirt|salwar|churidar|bottom)/.test(t)) return "folded";
  if (/(shirt|blouse|top|jacket|blazer|coat|overshirt|dress|gown|anarkali|saree|sari|kurta|kurti|tunic|layer)/.test(t)) return "hanging";

  const cat = (item.category ?? "").trim().toLowerCase();
  if (cat === "footwear") return "shoes";
  if (cat === "accessory" || cat === "dupatta") return "accessories";
  if (cat === "bottom") return "folded";
  if (cat === "top" || cat === "kurta" || cat === "dress" || cat === "saree" || cat === "outerwear") return "hanging";
  return "hanging";
}

/** Map an item to the closest garment illustration (used when no photo exists). */
export function garmentKindForItem(item: WardrobeItem): GarmentKind {
  const t = itemText(item);
  if (/(jean|denim)/.test(t)) return "Jeans";
  if (/(trouser|chino|pant|legging|palazzo|jogger|salwar|churidar|bottom)/.test(t)) return "Pants";
  if (/skirt/.test(t)) return "Skirt";
  if (/(saree|sari|gown|dress|anarkali|lehenga)/.test(t)) return "Dress";
  if (/(sneaker|trainer)/.test(t)) return "Sneaker";
  if (/(shoe|loafer|heel|sandal|jutti|mojari|flat|boot|footwear)/.test(t)) return "Loafer";
  if (/(jacket|blazer|coat|overshirt|cardigan)/.test(t)) return "Jacket";
  if (/(sweater|hoodie|knit|pullover)/.test(t)) return "Sweater";
  if (/belt/.test(t)) return "Belt";
  if (/(watch|accessor|jewel|bag|clutch|earring|necklace|bangle|bracelet|cap|hat|scarf|stole|dupatta)/.test(t)) return "Watch";
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
