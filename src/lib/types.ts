export type Occasion =
  | "work" | "casual" | "dinner_date" | "ethnic"
  | "festive" | "party" | "travel" | "family_function" | "college";

// Ordered by priority for WearWise's target user. College is kept for manual
// tagging / student profiles but is deprioritised by the AI.
export const OCCASIONS: { value: Occasion; label: string; hint: string }[] = [
  { value: "work", label: "Work", hint: "Office-ready, put-together" },
  { value: "casual", label: "Casual", hint: "Everyday comfort" },
  { value: "dinner_date", label: "Dinner/date", hint: "Dressy evening out" },
  { value: "family_function", label: "Family function", hint: "Weddings, get-togethers" },
  { value: "travel", label: "Travel", hint: "Comfy & practical" },
  { value: "ethnic", label: "Ethnic", hint: "Kurta, saree, suit" },
  { value: "festive", label: "Festive", hint: "Diwali, Eid, celebrations" },
  { value: "party", label: "Party", hint: "Evening & dressy" },
  { value: "college", label: "College", hint: "Smart & easy (student)" },
];

export const CATEGORIES = [
  "Top", "Bottom", "Dress", "Kurta", "Saree", "Dupatta",
  "Footwear", "Outerwear", "Accessory",
] as const;

export const PATTERNS = [
  "Solid", "Printed", "Embroidered", "Striped", "Floral", "Checked",
] as const;

export type RequestStatus = "pending" | "in_review" | "fulfilled" | "archived";
export type SuggestionStatus = "draft" | "approved" | "rejected";
export type AiTagStatus = "analyzing" | "tagged" | "needs_review" | "failed";

export const AUTOTAG_PRIVACY_COPY =
  "We use AI to identify clothing type, colour, and style from your wardrobe photos. Your wardrobe stays private.";

export interface Profile {
  id: string;
  full_name: string | null;
  age_range: string | null;
  city: string | null;
  style_preferences: string[] | null;
  is_admin: boolean;
  is_premium: boolean;
  onboarded: boolean;
  created_at: string;
}

export interface WardrobeItem {
  id: string;
  user_id: string;
  image_path: string;
  category: string | null;
  color: string | null;
  pattern: string | null;
  occasion_tags: Occasion[] | null;
  notes: string | null;
  last_worn_at: string | null;
  // Auto-tagging (v0.2)
  ai_tag_status: AiTagStatus;
  ai_confidence: number | null;
  user_facing_name: string | null;
  sub_category: string | null;
  style: string | null;
  secondary_colors: string[] | null;
  ethnic_western_fusion: string | null;
  auto_tagged_at: string | null;
  user_corrected_tags: boolean;
  created_at: string;
}

export interface OutfitRequest {
  id: string;
  user_id: string;
  occasion: Occasion;
  notes: string | null;
  status: RequestStatus;
  created_at: string;
}

export interface OutfitSuggestion {
  id: string;
  request_id: string;
  user_id: string;
  title: string | null;
  description: string | null; // styling reason
  item_ids: string[];
  status: SuggestionStatus;
  position: number | null;
  // AI outfit drafts (v0.4)
  avoid_note: string | null;
  missing_item_suggestion: string | null;
  ai_confidence: number | null;
  source: string; // 'manual' | 'ai'
  created_at: string;
}
