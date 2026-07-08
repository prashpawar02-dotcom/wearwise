// =====================================================================
// WearWise — Engine v2 context loader (Phase 1)
// DB-facing: hydrates an EngineContext from engine_config, occasion_profiles,
// ethnic_pairing_rules and the user's profile prefs. GRACEFUL: any missing
// table/row falls back to the pure defaults in engine/config.ts, so the engine
// keeps working before the migration is applied. NOT part of the pure test
// path (imports Supabase). Weather is passed in by the caller.
// =====================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EngineConfig, EngineContext, EngineOccasion, EthnicPairingRule,
  OccasionProfile, UserPreferences, WeatherContext,
} from "@/lib/engine/types";
import {
  DEFAULT_CONFIG, DEFAULT_ETHNIC_RULES, EMPTY_PREFERENCES, profileForOccasion,
} from "@/lib/engine/config";

interface LoadOpts {
  supabase: SupabaseClient;
  userId: string;
  occasion: EngineOccasion;
  weather?: WeatherContext;
  now?: Date;
}

async function loadConfig(supabase: SupabaseClient): Promise<EngineConfig> {
  try {
    const { data } = await supabase.from("engine_config").select("key,value");
    if (!data || data.length === 0) return DEFAULT_CONFIG;
    const byKey = new Map(data.map((r) => [r.key as string, r.value as Record<string, unknown>]));
    return {
      scoringWeights: { ...DEFAULT_CONFIG.scoringWeights, ...(byKey.get("scoring_weights") ?? {}) },
      penaltyWeights: { ...DEFAULT_CONFIG.penaltyWeights, ...(byKey.get("penalty_weights") ?? {}) },
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...(byKey.get("thresholds") ?? {}) },
      colorRules: { ...DEFAULT_CONFIG.colorRules, ...(byKey.get("color_rules") ?? {}) },
    } as EngineConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function loadProfile(supabase: SupabaseClient, occasion: EngineOccasion): Promise<OccasionProfile> {
  try {
    const { data } = await supabase.from("occasion_profiles").select("*").eq("occasion", occasion).maybeSingle();
    if (!data) return profileForOccasion(occasion);
    return {
      occasion,
      formalityTarget: data.formality_target,
      formalityMin: data.formality_min,
      formalityMax: data.formality_max,
      maxPieces: data.max_pieces,
      comfortMultiplier: data.comfort_multiplier,
      bypassFormality: data.bypass_formality,
      accessoryPolicy: data.accessory_policy,
      activewearOnly: data.activewear_only,
      label: data.label ?? occasion,
    };
  } catch {
    return profileForOccasion(occasion);
  }
}

async function loadEthnicRules(supabase: SupabaseClient): Promise<EthnicPairingRule[]> {
  try {
    const { data } = await supabase.from("ethnic_pairing_rules").select("*").eq("active", true);
    if (!data || data.length === 0) return DEFAULT_ETHNIC_RULES;
    return data.map((r) => ({
      kind: r.kind, subjectKey: r.subject_key, objectKey: r.object_key,
      scope: r.scope ?? "any", message: r.message,
    }));
  } catch {
    return DEFAULT_ETHNIC_RULES;
  }
}

async function loadPreferences(supabase: SupabaseClient, userId: string): Promise<UserPreferences> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("style_preferences,excluded_colors,excluded_categories,excluded_footwear")
      .eq("id", userId).maybeSingle();
    if (!data) return EMPTY_PREFERENCES;
    return {
      ...EMPTY_PREFERENCES,
      excludedColors: data.excluded_colors ?? [],
      excludedCategories: data.excluded_categories ?? [],
      excludedFootwear: data.excluded_footwear ?? [],
      styleVibes: data.style_preferences ?? [],
    };
  } catch {
    return EMPTY_PREFERENCES;
  }
}

/** Build a full EngineContext (falls back to defaults for anything missing). */
export async function loadEngineContext(opts: LoadOpts): Promise<EngineContext> {
  const { supabase, userId, occasion, weather, now } = opts;
  const [config, profile, ethnicRules, preferences] = await Promise.all([
    loadConfig(supabase),
    loadProfile(supabase, occasion),
    loadEthnicRules(supabase),
    loadPreferences(supabase, userId),
  ]);
  return {
    occasion,
    weather: weather ?? { tempC: null, isRaining: false },
    config, profile, ethnicRules, preferences, now,
  };
}
