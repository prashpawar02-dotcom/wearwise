// =====================================================================
// WearWise — Recommendation Engine v2, shared types (Phase 1)
// Pure & dependency-free (only imports the app's WardrobeItem type). Safe
// to import on the server, in tests, and in any pure context.
// =====================================================================
import type { WardrobeItem } from "@/lib/types";

/**
 * Occasion the engine reasons about. Superset of the DB occasion_type enum:
 * adds gym/interview/wedding_guest/dinner/formal_event/office WITHOUT an enum
 * migration (behaviour lives in the occasion_profiles table / OCCASION_PROFILES).
 */
export type EngineOccasion =
  | "work" | "office" | "interview"
  | "casual" | "college" | "travel"
  | "dinner_date" | "dinner" | "party"
  | "ethnic" | "festive" | "family_function"
  | "wedding_guest" | "formal_event"
  | "gym";

/** Normalized garment role used across filters/scoring/templates. */
export type EngineRole =
  | "upper"        // shirt/top/tee/blouse
  | "ethnic_upper" // kurta/kurti/choli
  | "bottom"
  | "one_piece"    // dress/gown/jumpsuit/anarkali
  | "saree"
  | "outerwear"    // blazer/jacket/cardigan
  | "drape"        // dupatta/stole
  | "footwear"
  | "accessory"    // belt/bag/jewelry/watch
  | "activewear_top"
  | "activewear_bottom"
  | "unknown";

/** Runtime-tunable weights & thresholds (mirrors engine_config rows). */
export interface EngineConfig {
  scoringWeights: {
    color_harmony: number;
    formality_coherence: number;
    occasion_fit: number;
    comfort: number;
    user_style_alignment: number;
    novelty: number;
  };
  penaltyWeights: {
    repeat: number;
    weather_soft: number;
    pattern_risk: number;
    accessory_irrelevance: number;
  };
  thresholds: {
    confidence_dual_pick: number;
    item_cooldown_days_casual: number;
    item_cooldown_days_office: number;
    pair_cooldown_days: number;
    max_saturated_hues: number;
    max_bold_patterns: number;
  };
  colorRules: {
    neutrals: string[];
    metallics: string[];
  };
}

/** Behaviour for one occasion (mirrors an occasion_profiles row). */
export interface OccasionProfile {
  occasion: EngineOccasion;
  formalityTarget: number;
  formalityMin: number;
  formalityMax: number;
  maxPieces: number;
  comfortMultiplier: number;
  bypassFormality: boolean;
  accessoryPolicy: "discouraged" | "optional" | "encouraged";
  activewearOnly: boolean;
  label: string;
}

/** One cultural pairing rule (mirrors an ethnic_pairing_rules row). */
export interface EthnicPairingRule {
  kind: "forbid" | "require";
  subjectKey: string;
  objectKey: string;
  scope: string; // occasion or 'any'
  message: string;
}

/** User absolute exclusions + learned prefs the engine honours. */
export interface UserPreferences {
  excludedColors: string[];
  excludedCategories: string[];
  excludedFootwear: string[];
  /** style vibe keywords from onboarding, e.g. ['minimal','ethnic'] */
  styleVibes: string[];
  /** item ids the user has marked favorite (novelty guard + accessory justification) */
  favoriteItemIds: string[];
  /** minimum modesty_level (1..5) any garment must meet; 1 = no constraint. */
  modestyFloor: number;
}

/** Weather context for the day. */
export interface WeatherContext {
  tempC: number | null;
  isRaining: boolean;
}

/** Everything the engine needs besides the wardrobe itself. */
export interface EngineContext {
  occasion: EngineOccasion;
  weather: WeatherContext;
  config: EngineConfig;
  profile: OccasionProfile;
  ethnicRules: EthnicPairingRule[];
  preferences: UserPreferences;
  /** ISO date the recommendation is FOR (drives cooldowns); defaults to now. */
  now?: Date;
}

/** A single scoring factor's contribution (positive) or penalty (negative). */
export interface FactorContribution {
  name: string;
  raw: number;         // 0..1 factor score (or 0..1 penalty magnitude)
  weight: number;      // config weight applied
  contribution: number; // signed contribution to the total
  detail?: string;     // human-readable, for Why-This-Works + QA
}

/** Why one candidate outfit was rejected by a hard filter. */
export interface FilterRejection {
  filter: string;
  reason: string;
}

/** A fully scored, validator-passing outfit. */
export interface ScoredOutfit {
  itemIds: string[];
  items: WardrobeItem[];
  template: string;       // which structure template produced it
  total: number;          // final weighted score
  confidence: number;     // 0..1
  factors: FactorContribution[];   // positive contributions
  penalties: FactorContribution[]; // negative contributions
  /** Top-3 plain-language reasons, rendered from real factors (§3.5). */
  whyThisWorks: string[];
}

/** The engine's top-level result. */
export interface RecommendationResult {
  hero: ScoredOutfit | null;
  backups: ScoredOutfit[];
  /** True when confidence < threshold: caller should show two picks honestly. */
  dualPick: boolean;
  /** Machine reason when hero is null (never fabricate an outfit). */
  failReason?: string;
  /** Diagnostics for the admin QA route (not shown to users). */
  diagnostics: {
    poolSize: number;
    afterAvailability: number;
    candidatesBuilt: number;
    candidatesValid: number;
    elapsedMs: number;
  };
}

export type { WardrobeItem };
