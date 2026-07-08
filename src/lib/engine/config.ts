// =====================================================================
// WearWise — Engine v2 default config & reference data (Phase 1)
// Pure. These defaults MIRROR the migration 0020 seed rows so the engine
// runs deterministically even before a DB round-trip (and in unit tests).
// A DB loader (engine/loadConfig.ts) may override any of these at runtime;
// weights are therefore "configurable at runtime" per the acceptance bar.
// =====================================================================
import type {
  EngineConfig,
  EngineOccasion,
  EthnicPairingRule,
  OccasionProfile,
  UserPreferences,
} from "@/lib/engine/types";

export const DEFAULT_CONFIG: EngineConfig = {
  scoringWeights: {
    color_harmony: 1.0,
    formality_coherence: 1.0,
    occasion_fit: 1.2,
    comfort: 0.8,
    user_style_alignment: 0.9,
    novelty: 0.6,
  },
  penaltyWeights: {
    repeat: 1.0,
    weather_soft: 0.7,
    pattern_risk: 0.8,
    accessory_irrelevance: 0.6,
  },
  thresholds: {
    confidence_dual_pick: 0.55,
    item_cooldown_days_casual: 4,
    item_cooldown_days_office: 7,
    pair_cooldown_days: 14,
    max_saturated_hues: 2,
    max_bold_patterns: 1,
  },
  colorRules: {
    neutrals: [
      "neutral", "white", "black", "grey", "gray", "beige", "cream",
      "ivory", "navy", "denim", "tan", "brown", "charcoal",
    ],
    metallics: ["gold", "silver", "bronze", "copper"],
  },
};

export const DEFAULT_OCCASION_PROFILES: Record<EngineOccasion, OccasionProfile> = {
  work:            p("work", 4, 3, 5, 5, 1.0, false, "optional", false, "Work"),
  office:          p("office", 4, 3, 5, 5, 1.0, false, "optional", false, "Office"),
  interview:       p("interview", 5, 4, 5, 5, 1.0, false, "encouraged", false, "Interview"),
  casual:          p("casual", 2, 1, 3, 4, 1.2, false, "discouraged", false, "Casual"),
  college:         p("college", 2, 1, 3, 4, 1.2, false, "discouraged", false, "College"),
  travel:          p("travel", 2, 1, 3, 4, 1.4, false, "discouraged", false, "Travel"),
  dinner_date:     p("dinner_date", 4, 3, 5, 5, 1.0, false, "encouraged", false, "Dinner/date"),
  dinner:          p("dinner", 4, 3, 5, 5, 1.0, false, "encouraged", false, "Dinner"),
  party:           p("party", 4, 3, 5, 6, 1.0, false, "encouraged", false, "Party"),
  ethnic:          p("ethnic", 4, 3, 5, 6, 1.0, false, "encouraged", false, "Ethnic"),
  festive:         p("festive", 5, 3, 5, 6, 1.0, false, "encouraged", false, "Festive"),
  family_function: p("family_function", 4, 3, 5, 6, 1.0, false, "encouraged", false, "Family function"),
  wedding_guest:   p("wedding_guest", 5, 4, 5, 6, 1.0, false, "encouraged", false, "Wedding guest"),
  formal_event:    p("formal_event", 5, 4, 5, 5, 1.0, false, "encouraged", false, "Formal event"),
  gym:             p("gym", 1, 1, 5, 3, 2.0, true, "discouraged", true, "Gym"),
};

function p(
  occasion: EngineOccasion, target: number, min: number, max: number,
  maxPieces: number, comfort: number, bypass: boolean,
  accessory: OccasionProfile["accessoryPolicy"], activewearOnly: boolean, label: string,
): OccasionProfile {
  return {
    occasion, formalityTarget: target, formalityMin: min, formalityMax: max,
    maxPieces, comfortMultiplier: comfort, bypassFormality: bypass,
    accessoryPolicy: accessory, activewearOnly, label,
  };
}

export const DEFAULT_ETHNIC_RULES: EthnicPairingRule[] = [
  { kind: "forbid", subjectKey: "kurta", objectKey: "belt", scope: "any", message: "A belt is not worn over a kurta." },
  { kind: "forbid", subjectKey: "saree", objectKey: "belt", scope: "any", message: "A belt does not belong with a saree." },
  { kind: "forbid", subjectKey: "western_top", objectKey: "dupatta", scope: "any", message: "A dupatta is an ethnic drape; it does not pair with a western top + pants." },
  { kind: "forbid", subjectKey: "dress", objectKey: "dupatta", scope: "any", message: "A dupatta does not pair with a western one-piece dress." },
  { kind: "forbid", subjectKey: "jeans", objectKey: "dupatta", scope: "any", message: "A dupatta does not pair with jeans." },
  { kind: "require", subjectKey: "lehenga", objectKey: "choli", scope: "any", message: "A lehenga is worn with a choli/blouse, not a western top." },
];

export const EMPTY_PREFERENCES: UserPreferences = {
  excludedColors: [],
  excludedCategories: [],
  excludedFootwear: [],
  styleVibes: [],
  favoriteItemIds: [],
  modestyFloor: 1,
};

/** Resolve an occasion profile, falling back to 'casual' for unknown strings. */
export function profileForOccasion(occasion: string): OccasionProfile {
  return (
    DEFAULT_OCCASION_PROFILES[occasion as EngineOccasion] ??
    DEFAULT_OCCASION_PROFILES.casual
  );
}
