// =====================================================================
// WearWise — Swap server helpers (Phase 3, Phase 4 canonical-context rewire)
// Shared, session-scoped building blocks for the swap / mood / option / undo
// routes. LOCKED DECISION 4: every recommendation-writing path now builds the
// SAME authenticated EngineContext (loadEngineContext) that Admin QA uses — no
// weaker defaultContext/EMPTY_PREFERENCES path remains.
// =====================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { getWeatherContext } from "@/lib/weather";
import { loadEngineContext } from "@/lib/engine/loadContext";
import { resolveEngineOccasion } from "@/lib/engine/occasion";
import { explainSelectedOutfit } from "@/lib/engine/recommend";
import type { EngineContext, EngineOccasion } from "@/lib/engine/types";
import type { DailyRecommendation, Profile, WardrobeItem } from "@/lib/types";
import { capState, type CapState } from "@/lib/swap-caps";

/** Map a stored occasion_context label to the engine occasion (canonical). */
export function occasionFromContext(
  occasionContext: string | null,
  defaultOccasion?: string | null,
): EngineOccasion {
  return resolveEngineOccasion(defaultOccasion, occasionContext);
}

/**
 * 1-based ordinal of the user's drop-day (a "session" ≈ a daily drop). One row
 * exists per user per local date, so the row count is the session number.
 */
export async function sessionOrdinal(supabase: SupabaseClient, userId: string): Promise<number> {
  try {
    const { count } = await supabase
      .from("daily_recommendations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    return typeof count === "number" && count > 0 ? count : 1;
  } catch {
    return 1;
  }
}

/** Resolve the current cap state for a drop (server-authoritative). */
export async function dropCapState(
  supabase: SupabaseClient,
  userId: string,
  rec: DailyRecommendation,
): Promise<CapState> {
  const ordinal = await sessionOrdinal(supabase, userId);
  return capState({
    swapsUsed: rec.swaps_used ?? 0,
    optionsUsed: rec.options_used ?? 0,
    sessionOrdinal: ordinal,
  });
}

/**
 * Build the swap EngineContext — the SAME authenticated context Admin QA and
 * Today generation use (loadEngineContext: per-user prefs + DB config + live
 * weather), under the canonically-resolved occasion.
 */
export async function buildSwapContext(
  supabase: SupabaseClient,
  profile: Profile | null,
  rec: DailyRecommendation,
): Promise<EngineContext> {
  let tempC: number | null = null;
  let isRaining = false;
  if (profile?.weather_advice_enabled && profile.city) {
    const w = await getWeatherContext(profile.city);
    if (w) { tempC = w.tempC; isRaining = w.category === "rainy"; }
  }
  const occasion = resolveEngineOccasion(profile?.default_occasion, rec.occasion_context);
  return loadEngineContext({
    supabase,
    userId: rec.user_id,
    occasion,
    weather: { tempC, isRaining },
  });
}

/** Re-derive persistable explanation for a (new) outfit — keeps Why-This-Works 1:1. */
export function explainForItems(items: WardrobeItem[], ctx: EngineContext): {
  confidence: number;
  factor_breakdown: Record<string, unknown>;
  is_dual_pick: boolean;
  whyThisWorks: string[];
} {
  const e = explainSelectedOutfit(items, ctx);
  return {
    confidence: e.confidence,
    factor_breakdown: e.factor_breakdown as unknown as Record<string, unknown>,
    is_dual_pick: e.is_dual_pick,
    whyThisWorks: e.factor_breakdown.whyThisWorks,
  };
}

/** Serialisable cap summary for API responses (Infinity → null = unlimited). */
export function capSummary(cap: CapState): {
  sessionExempt: boolean;
  swapRemaining: number | null;
  optionRemaining: number | null;
  canSwap: boolean;
  canOption: boolean;
} {
  return {
    sessionExempt: cap.sessionExempt,
    swapRemaining: Number.isFinite(cap.swapRemaining) ? cap.swapRemaining : null,
    optionRemaining: Number.isFinite(cap.optionRemaining) ? cap.optionRemaining : null,
    canSwap: cap.canSwap,
    canOption: cap.canOption,
  };
}
