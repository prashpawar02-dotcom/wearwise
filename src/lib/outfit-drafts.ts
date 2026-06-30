import { OCCASIONS, type Occasion, type WardrobeItem } from "@/lib/types";

export const MIN_ITEMS_FOR_DRAFTS = 5;

const occasionLabel = (v: string) => OCCASIONS.find((o) => o.value === v)?.label ?? v;

/** Compact, model-friendly view of one wardrobe item. */
export function itemForModel(it: WardrobeItem) {
  return {
    id: it.id,
    name: it.user_facing_name ?? null,
    category: it.category ?? null,
    sub_category: it.sub_category ?? null,
    color: it.color ?? null,
    secondary_colors: it.secondary_colors ?? [],
    pattern: it.pattern ?? null,
    style: it.style ?? null,
    occasion_tags: it.occasion_tags ?? [],
    ethnic_western_fusion: it.ethnic_western_fusion ?? null,
  };
}

export interface RawSuggestion {
  title?: string;
  items_used?: string[];
  styling_reason?: string;
  avoid_note?: string;
  missing_item_suggestion?: string;
  confidence?: number;
}

export interface CleanSuggestion {
  title: string;
  item_ids: string[];
  styling_reason: string | null;
  avoid_note: string | null;
  missing_item_suggestion: string | null;
  confidence: number;
}

function shortStr(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t ? t.slice(0, max) : null;
}

/** Validate model output: keep only real item ids, cap to 3 suggestions. */
export function cleanSuggestions(raw: unknown, validIds: Set<string>): CleanSuggestion[] {
  const arr =
    raw && typeof raw === "object" && Array.isArray((raw as { suggestions?: unknown[] }).suggestions)
      ? ((raw as { suggestions: RawSuggestion[] }).suggestions)
      : [];

  const out: CleanSuggestion[] = [];
  for (const s of arr.slice(0, 3)) {
    const ids = Array.isArray(s.items_used)
      ? Array.from(new Set(s.items_used.filter((id) => typeof id === "string" && validIds.has(id))))
      : [];
    if (ids.length === 0) continue; // never invent items — skip empty looks
    const confidence = typeof s.confidence === "number" ? Math.max(0, Math.min(1, s.confidence)) : 0.5;
    out.push({
      title: shortStr(s.title, 60) ?? "Outfit idea",
      item_ids: ids,
      styling_reason: shortStr(s.styling_reason, 280),
      avoid_note: shortStr(s.avoid_note, 200),
      missing_item_suggestion: shortStr(s.missing_item_suggestion, 120),
      confidence,
    });
  }
  return out;
}

export function buildOutfitPrompt(occasion: Occasion, notes: string | null, items: WardrobeItem[], retryNote?: string) {
  const wardrobe = items.map(itemForModel);
  return `You are a thoughtful personal stylist for an Indian women's wardrobe app (users 22-40).
Create outfit ideas using ONLY the clothes this user already owns (listed below).

OCCASION: ${occasionLabel(occasion)}
USER NOTES: ${notes ? notes : "(none)"}

WARDROBE (use only these exact ids in items_used):
${JSON.stringify(wardrobe)}

Return ONLY JSON in this exact shape:
{
  "suggestions": [
    {
      "title": "Short outfit title",
      "items_used": ["<wardrobe id>", "<wardrobe id>"],
      "styling_reason": "Why this outfit works for the occasion",
      "avoid_note": "What to avoid with this look",
      "missing_item_suggestion": "One optional item that would complete it, only if genuinely useful (else empty string)",
      "confidence": 0.0
    }
  ]
}

OUTFIT STRUCTURE (MUST FOLLOW — these are hard constraints):
- NEVER combine two upper-body garments in one look (e.g. two tops, top + shirt, top + kurta).
- NEVER combine two kurtas in one look.
- NEVER combine a kurta with a t-shirt, top, or shirt. (A jacket/blazer/cardigan/coat is outerwear and may layer over one top — nothing here is outerwear unless tagged Outerwear.)
- A dress, saree, gown, anarkali, or jumpsuit is a complete one-piece: never add a separate top or bottom to it.
- Every look MUST follow exactly one of these structures:
  a) one upper (top/shirt/kurta/blouse) + one bottom (jeans/trousers/palazzo/salwar/churidar/skirt) [+ optional dupatta, footwear, accessory, one outerwear]
  b) one one-piece (dress/saree/gown/anarkali/jumpsuit) [+ optional outerwear, footwear, accessory, dupatta]
  c) ethnic set: kurta + bottom (+ optional dupatta, footwear, accessory)
- A top with no bottom is invalid. A bottom with no top is invalid.

RULES:
- Suggest EXACTLY 3 outfits. Use ONLY ids from the wardrobe list. NEVER invent items the user does not own.
- Do not suggest shopping beyond the single optional "missing_item_suggestion".
- Use practical Indian wardrobe logic. Balance top/bottom or dress/saree/kurta + dupatta + footwear + accessory where available.
- Avoid pairing too many strong prints together.
- Work: polished, modest, not flashy. Casual: comfortable and easy. Dinner/date: slightly elevated, not overdone.
  Family function: respectful, polished, Indian-context friendly. Travel: comfortable, repeat-friendly, easy movement.
  Festive/Ethnic: prefer ethnic or fusion pieces if available. Party: dressier.
- TONE: like a stylish, practical friend.
- NEVER mention body shape, size, weight, attractiveness, or skin tone. No body-judgment or creepy language. Describe the clothes, not the person.
Return strict JSON, no commentary.${retryNote ? "\n\nIMPORTANT: " + retryNote : ""}`;
}
