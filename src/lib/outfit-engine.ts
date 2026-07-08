// =====================================================================
// WearWise — outfit engine adapter (Phase 1)
// The deterministic generator now delegates to Engine v2
// (src/lib/engine/*): HARD FILTERS -> SCORING -> RANK & EXPLAIN. This file
// keeps the original engineOutfits() signature so existing callers
// (analysis/generate, outfit-requests/generate) transparently get the
// rules-gated, scored, explainable pipeline. Every returned look has already
// passed the fail-closed validator inside the pipeline.
// =====================================================================
import { recommendOutfits } from "@/lib/engine/recommend";
import {
  DEFAULT_CONFIG, DEFAULT_ETHNIC_RULES, EMPTY_PREFERENCES, profileForOccasion,
} from "@/lib/engine/config";
import type { EngineContext, EngineOccasion, ScoredOutfit } from "@/lib/engine/types";
import type { Occasion, WardrobeItem } from "@/lib/types";

export interface EngineOutfit {
  title: string;
  item_ids: string[];
  styling_reason: string;
  confidence: number;
}

const TEMPLATE_LABEL: Record<string, string> = {
  ethnic_set: "Ethnic set",
  kurta_set: "Kurta look",
  saree_set: "Saree look",
  one_piece: "One-piece look",
  separates: "Top & bottom",
  gym: "Activewear",
};

/**
 * Build a default (DB-free) EngineContext. Used by the synchronous callers
 * that don't hydrate weather/config; the DB loader (loadEngineContext) is used
 * where weather + per-user config matter.
 */
export function defaultContext(occasion: EngineOccasion): EngineContext {
  return {
    occasion,
    weather: { tempC: null, isRaining: false },
    config: DEFAULT_CONFIG,
    profile: profileForOccasion(occasion),
    ethnicRules: DEFAULT_ETHNIC_RULES,
    preferences: EMPTY_PREFERENCES,
  };
}

function toEngineOutfit(o: ScoredOutfit): EngineOutfit {
  const why = o.whyThisWorks.length
    ? o.whyThisWorks.join(" · ")
    : "A clean, occasion-appropriate combination from clothes you already own.";
  return {
    title: TEMPLATE_LABEL[o.template] ?? "Outfit",
    item_ids: o.itemIds,
    styling_reason: why,
    confidence: Number(o.confidence.toFixed(2)),
  };
}

/**
 * Generate up to `count` distinct, validator-passing outfits for an occasion.
 * Deterministic: same wardrobe + occasion in → same outfits out.
 */
export function engineOutfits(allItems: WardrobeItem[], occasion: Occasion, count: number): EngineOutfit[] {
  const ctx = defaultContext(occasion as EngineOccasion);
  const result = recommendOutfits(allItems, ctx, Math.max(1, count));
  const looks = result.hero ? [result.hero, ...result.backups] : [];
  return looks.slice(0, count).map(toEngineOutfit);
}
