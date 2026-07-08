// Test fixtures for Engine v2 golden tests. Pure — no framework needed.
import type { WardrobeItem } from "@/lib/types";

let seq = 0;
export function mk(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  seq += 1;
  const base: WardrobeItem = {
    id: overrides.id ?? `item-${seq}`,
    user_id: "user-1",
    image_path: "user-1/x.jpg",
    category: null,
    color: "blue",
    pattern: "solid",
    occasion_tags: [],
    notes: null,
    last_worn_at: null,
    ai_tag_status: "tagged",
    ai_confidence: 0.9,
    user_facing_name: null,
    sub_category: null,
    style: null,
    secondary_colors: [],
    ethnic_western_fusion: null,
    auto_tagged_at: null,
    user_corrected_tags: false,
    availability_status: "available",
    in_wash_since: null,
    color_family: "blue",
    pattern_boldness: 0,
    fabric: "cotton",
    sleeve_length: null,
    fit: "regular",
    formality: 3,
    warmth: 2,
    min_temp_c: null,
    max_temp_c: null,
    weather_tags: [],
    cultural_tag: "western",
    modesty_level: 3,
    layering_role: "standalone",
    accessory_role: null,
    footwear_formality: null,
    footwear_weather: null,
    set_id: null,
    set_required_components: [],
    avoid_with: [],
    tag_confidence: {},
    photo_quality_flag: false,
    created_at: "2026-01-01T00:00:00Z",
  };
  return { ...base, ...overrides };
}

// Handy shorthands.
export const top = (o: Partial<WardrobeItem> = {}) => mk({ category: "top", user_facing_name: "Top", ...o });
export const bottom = (o: Partial<WardrobeItem> = {}) => mk({ category: "bottom", user_facing_name: "Trousers", ...o });
export const shoes = (o: Partial<WardrobeItem> = {}) => mk({ category: "footwear", user_facing_name: "Shoes", footwear_formality: 3, ...o });
export const kurta = (o: Partial<WardrobeItem> = {}) => mk({ category: "kurta", user_facing_name: "Kurta", cultural_tag: "indian_ethnic", ...o });
export const dupatta = (o: Partial<WardrobeItem> = {}) => mk({ category: "dupatta", user_facing_name: "Dupatta", cultural_tag: "indian_ethnic", layering_role: "drape", ...o });
export const saree = (o: Partial<WardrobeItem> = {}) => mk({ category: "saree", user_facing_name: "Saree", cultural_tag: "indian_ethnic", layering_role: "standalone", ...o });
export const dress = (o: Partial<WardrobeItem> = {}) => mk({ category: "dress", user_facing_name: "Dress", layering_role: "standalone", ...o });
export const belt = (o: Partial<WardrobeItem> = {}) => mk({ category: "accessory", user_facing_name: "Belt", accessory_role: "belt", ...o });
