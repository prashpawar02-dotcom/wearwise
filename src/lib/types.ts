export type Occasion =
  | "work" | "casual" | "college" | "ethnic"
  | "festive" | "party" | "travel" | "family_function";

export const OCCASIONS: { value: Occasion; label: string; hint: string }[] = [
  { value: "work", label: "Work", hint: "Office-ready, put-together" },
  { value: "casual", label: "Casual", hint: "Everyday comfort" },
  { value: "college", label: "College", hint: "Smart & easy" },
  { value: "ethnic", label: "Ethnic", hint: "Kurta, saree, suit" },
  { value: "festive", label: "Festive", hint: "Diwali, Eid, celebrations" },
  { value: "party", label: "Party", hint: "Evening & dressy" },
  { value: "travel", label: "Travel", hint: "Comfy & practical" },
  { value: "family_function", label: "Family function", hint: "Weddings, get-togethers" },
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
  description: string | null;
  item_ids: string[];
  status: SuggestionStatus;
  position: number | null;
  created_at: string;
}
