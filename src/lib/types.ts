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
export type AvailabilityStatus = "available" | "in_wash" | "unavailable" | "archived";

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
  // Daily Outfit Drop preferences (migration 0008, Phase 1). Preferences only —
  // nothing reads these to send notifications yet.
  timezone: string | null;
  daily_drop_enabled: boolean;
  daily_drop_time: string;          // 'HH:MM' or 'HH:MM:SS' (Postgres time)
  daily_drop_days: number[];        // 0=Sun..6=Sat
  show_quiet_gems: boolean;
  weather_advice_enabled: boolean;
  // Engine v2 absolute exclusions (optional; NULL/empty = no exclusions).
  excluded_colors?: string[] | null;
  excluded_categories?: string[] | null;
  excluded_footwear?: string[] | null;
  // Laundry / Availability (migration 0021, Phase 2). All optional so older
  // reads compile; the DB carries safe defaults.
  postwear_sheet_enabled?: boolean;
  postwear_prompt_dismissals?: number;
  wash_cycle_days?: number;
  laundry_return_prompt_at?: string | null;
  laundry_wash_note_at?: string | null;
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
  // Laundry / availability (v0.7). Defaults to 'available' in the DB.
  availability_status: AvailabilityStatus;
  in_wash_since: string | null;
  // Engine v2 structured attributes (migration 0020). All nullable: NULL = unknown/unconfirmed.
  color_family: string | null;
  pattern_boldness: number | null;   // 0 none .. 3 bold
  fabric: string | null;             // coarse: cotton|linen|denim|wool|silk|synthetic|velvet|...
  sleeve_length: string | null;
  fit: string | null;
  formality: number | null;          // 1 very casual .. 5 formal
  warmth: number | null;             // 1 very light .. 5 very warm
  min_temp_c: number | null;
  max_temp_c: number | null;
  weather_tags: string[] | null;
  cultural_tag: string | null;       // indian_ethnic|western|indo_western | NULL = unconfirmed
  modesty_level: number | null;      // 1 .. 5 (5 = most covered)
  layering_role: string | null;      // base|standalone|mid|outer|drape
  accessory_role: string | null;
  footwear_formality: number | null;
  footwear_weather: string | null;
  set_id: string | null;
  set_required_components: string[] | null;
  avoid_with: string[] | null;
  tag_confidence: Record<string, number> | null;
  photo_quality_flag: boolean;
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

// User feedback on an approved suggestion (v0.6).
export type WouldWear = "yes" | "maybe" | "no";

export interface OutfitSuggestionFeedback {
  id: string;
  suggestion_id: string;
  request_id: string | null;
  user_id: string;
  useful: boolean | null;
  would_wear: WouldWear | string | null;
  reason: string | null;
  note: string | null;
  created_at: string;
}

// Daily Outfit Drop — cached recommendation, one per user per local date
// (migration 0009). Stores wardrobe item IDs only; never image URLs.
export type DailyRecStatus = "prepared" | "opened" | "worn" | "skipped" | "failed";

export interface DailyRecommendation {
  id: string;
  user_id: string;
  local_date: string;            // 'YYYY-MM-DD' in the user's local timezone
  status: DailyRecStatus;
  selected_item_ids: string[];
  weather_summary: string | null;
  occasion_context: string | null;
  reasoning: string | null;
  daily_insight: string | null;
  fail_reason: string | null;
  opened_at: string | null;
  worn_at: string | null;
  skipped_at: string | null;
  created_at: string;
  updated_at: string;
  // Module B cache (migration 0019): pre-computed "another option" sets.
  alt_item_ids?: string[][];
  alt_cursor?: number;
  // Engine v2 (migration 0020): stored factor contributions + confidence.
  confidence?: number | null;
  factor_breakdown?: Record<string, unknown> | null;
  is_dual_pick?: boolean;
  engine_version?: string | null;
}

// ---- Subscriptions (migration 0012) ----
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";

export interface Subscription {
  user_id: string;
  plan: "free" | "pro";
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  updated_at: string;
}

// ---- Streaks (migration 0013) ----
export interface Streak {
  user_id: string;
  current_count: number;
  longest_count: number;
  last_active_date: string | null;
  freezes_remaining: number;
}

// ---- Lookbook (migration 0014) ----
export interface SavedLook {
  id: string;
  user_id: string;
  suggestion_id: string | null;
  recommendation_id: string | null;
  title: string | null;
  item_ids: string[];
  created_at: string;
}
