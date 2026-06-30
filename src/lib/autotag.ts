import { CATEGORIES, PATTERNS, OCCASIONS, type Occasion } from "@/lib/types";

export const CONFIDENCE_REVIEW_THRESHOLD = 0.6;

const CATEGORY_SET = new Set(CATEGORIES.map((c) => c.toLowerCase()));
const PATTERN_SET = new Set([...PATTERNS, "Other"].map((p) => p.toLowerCase()));
const OCCASION_BY_LABEL = new Map(OCCASIONS.map((o) => [o.label.toLowerCase(), o.value]));
const OCCASION_BY_VALUE = new Map(OCCASIONS.map((o) => [o.value, o.value]));

// Descriptors we never surface to the user (transparency / body-fit / revealing).
const BANNED_DESCRIPTORS: RegExp[] = [
  /\bsheer\b/gi, /\bsee[-\s]?through\b/gi, /\btransparent\b/gi, /\btranslucent\b/gi,
  /\bbody[-\s]?con\b/gi, /\bskin[-\s]?tight\b/gi, /\bform[-\s]?fitting\b/gi, /\bfitted\b/gi,
  /\blow[-\s]?cut\b/gi, /\bplunging\b/gi, /\brevealing\b/gi, /\bcleavage\b/gi,
  /\bbust\b/gi, /\bclingy\b/gi, /\btight\b/gi,
];

export interface RawTags {
  category?: string;
  sub_category?: string;
  primary_color?: string;
  secondary_colors?: string[];
  pattern?: string;
  style?: string;
  occasion_tags?: string[];
  ethnic_western_fusion?: string;
  user_facing_name?: string;
  confidence?: number;
}

export interface CleanTags {
  category: string | null;
  sub_category: string | null;
  color: string | null;
  secondary_colors: string[];
  pattern: string | null;
  style: string | null;
  occasion_tags: Occasion[];
  ethnic_western_fusion: string | null;
  user_facing_name: string | null;
  ai_confidence: number;
  needs_review: boolean;
}

function titleCase(s: string) {
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function sentenceCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Strip banned descriptors and tidy whitespace/punctuation. */
function sanitize(s: string | null): string | null {
  if (!s) return null;
  let out = s;
  for (const re of BANNED_DESCRIPTORS) out = out.replace(re, "");
  out = out
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*,/g, ",")
    .replace(/^[\s,;.&-]+|[\s,;.&-]+$/g, "")
    .trim();
  return out || null;
}

function shortStr(s: unknown, max = 60): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t ? t.slice(0, max) : null;
}

function matchCategory(input?: string): string | null {
  if (!input) return null;
  const key = input.trim().toLowerCase();
  return CATEGORY_SET.has(key) ? titleCase(key) : null;
}

function matchPattern(input?: string): string | null {
  if (!input) return null;
  const key = input.trim().toLowerCase();
  return PATTERN_SET.has(key) ? titleCase(key) : "Other";
}

function matchOccasions(input?: string[]): Occasion[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<Occasion>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const key = raw.trim().toLowerCase();
    const v = OCCASION_BY_LABEL.get(key) ?? OCCASION_BY_VALUE.get(key as Occasion);
    if (v) out.add(v);
  }
  return Array.from(out);
}

function matchFusion(input?: string): string | null {
  if (!input) return null;
  const key = input.trim().toLowerCase();
  if (key.startsWith("ethnic")) return "Ethnic";
  if (key.startsWith("west")) return "Western";
  if (key.startsWith("fus")) return "Fusion";
  return null;
}

/** Validate + coerce + sanitise the model output into safe, DB-ready values. */
export function cleanTags(raw: RawTags): CleanTags {
  const category = matchCategory(raw.category);
  const confidence = typeof raw.confidence === "number"
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0;

  const secondary = Array.isArray(raw.secondary_colors)
    ? raw.secondary_colors.map((c) => shortStr(c, 24)).filter((c): c is string => !!c).slice(0, 4)
    : [];

  const subRaw = sanitize(shortStr(raw.sub_category, 40));
  const styleRaw = sanitize(shortStr(raw.style, 80));
  const nameRaw = sanitize(shortStr(raw.user_facing_name, 50));

  const needs_review = confidence < CONFIDENCE_REVIEW_THRESHOLD || category === null;

  return {
    category,
    sub_category: subRaw ? sentenceCase(subRaw) : null,
    color: shortStr(raw.primary_color, 24),
    secondary_colors: secondary,
    pattern: matchPattern(raw.pattern),
    style: styleRaw ? sentenceCase(styleRaw) : null,
    occasion_tags: matchOccasions(raw.occasion_tags),
    ethnic_western_fusion: matchFusion(raw.ethnic_western_fusion),
    user_facing_name: nameRaw,
    ai_confidence: confidence,
    needs_review,
  };
}

export const AUTOTAG_INSTRUCTIONS = `You are a tasteful fashion cataloguer for an Indian women's wardrobe app (users aged 22-40).
Look at the single clothing item in the photo and return ONLY a JSON object with these exact keys:
{
  "category": one of ["Top","Bottom","Dress","Kurta","Saree","Dupatta","Footwear","Outerwear","Accessory"],
  "sub_category": a clean 2-4 word description in sentence case, e.g. "Floral button-up blouse", "Straight-leg trousers". No fabric-transparency or body-fit words.
  "primary_color": short colour name, e.g. "Pink",
  "secondary_colors": array of short colour names (can be empty),
  "pattern": one of ["Solid","Printed","Embroidered","Striped","Floral","Checked","Other"],
  "style": a short, tasteful descriptor of look/feel, e.g. "Lightweight & soft", "Smart & structured",
  "occasion_tags": 1-3 from ["Work","Casual","Dinner/date","Family function","Travel","Ethnic","Festive","Party","College"],
  "ethnic_western_fusion": one of ["Ethnic","Western","Fusion"],
  "user_facing_name": short friendly name, max 4 words, e.g. "Pink floral top",
  "confidence": number 0.0 to 1.0 for how sure you are about the category
}

WRITING RULES (important):
- Keep all text respectful and body-neutral. NEVER use words like: sheer, see-through, transparent, tight, bodycon, fitted, low-cut, revealing, plunging, cleavage. Describe the garment, not the body.
- Prefer words like "lightweight", "soft", "flowy", "structured", "relaxed".

OCCASION RULES:
- Include "Work" for office-appropriate pieces (soft/neutral tops, structured pieces, formal wear).
- Use "Dinner/date" for dressier evening looks.
- Use "Ethnic"/"Festive" for kurtas, sarees, and embellished ethnic wear.
- Do NOT use "College" unless the item is distinctly youthful campus wear; prefer "Work" or "Casual" instead.
- Use Indian wardrobe context (kurta, saree, dupatta, etc.). If unsure of the category, pick the closest and lower the confidence.

Return strict JSON, no commentary.`;
