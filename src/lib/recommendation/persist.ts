// =====================================================================
// WearWise — shared recommendation persistence contract (Phase 4 hotfix)
// LOCKED DECISION 8: every writer of daily_recommendations that changes
// selected_item_ids MUST route through here so the stored authoritative
// metadata (outfit_status / missing_slots / partial_reason / confidence /
// factor_breakdown / engine_version / inventory_fingerprint) always MATCHES
// the stored selected_item_ids. The engine owns the values (locked decision 7);
// this layer only persists them — it never re-derives partial reasons itself.
// =====================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WardrobeItem } from "@/lib/types";
import type {
  EngineContext, EvaluatedOutfit, OutfitStatus, RecommendationResult,
} from "@/lib/engine/types";
import { evaluateSelectedOutfit } from "@/lib/engine/recommend";
import { computeInventoryFingerprint } from "@/lib/recommendation/fingerprint";

export const ENGINE_VERSION = "v2";

/** Authoritative metadata columns for a FRESH generation (from the engine result). */
export function freshAuthoritativeColumns(result: RecommendationResult, fingerprint: string) {
  const hero = result.hero;
  const outfit_status: OutfitStatus =
    hero == null ? "constrained" : result.outfitStatus === "partial" ? "partial" : "complete";
  return {
    outfit_status,
    missing_slots: result.missingSlots ?? [],
    partial_reason: result.partialReasonCode ?? null,
    confidence: hero?.confidence ?? null,
    is_dual_pick: result.dualPick,
    factor_breakdown: hero
      ? { factors: hero.factors, penalties: hero.penalties, whyThisWorks: hero.whyThisWorks, total: hero.total }
      : null,
    engine_version: ENGINE_VERSION,
    inventory_fingerprint: fingerprint,
  };
}

/** Authoritative metadata columns for an evaluated (mutated) outfit. */
export function evaluatedAuthoritativeColumns(ev: EvaluatedOutfit, fingerprint: string) {
  return {
    outfit_status: ev.outfit_status,
    missing_slots: ev.missing_slots,
    partial_reason: ev.partial_reason,
    confidence: ev.confidence,
    is_dual_pick: ev.is_dual_pick,
    factor_breakdown: ev.factor_breakdown,
    engine_version: ENGINE_VERSION,
    inventory_fingerprint: fingerprint,
  };
}

export interface MutationPersistArgs {
  recId: string;
  userId: string;
  /** New outfit item IDs (order preserved). */
  selectedIds: string[];
  /** The ordered outfit items for the new selection. */
  items: WardrobeItem[];
  /** Full current wardrobe (needed to decide WHY a slot is missing). */
  inventory: WardrobeItem[];
  ctx: EngineContext;
  /** Explicit reasoning that WINS over the engine why-line (e.g. mood result). */
  reasoning?: string | null;
  /** Fallback reasoning used only when there is no explicit reasoning and the
   *  engine produced no why-line. */
  reasoningFallback?: string | null;
  /** Route-specific extra columns (caps, pre_swap_item_ids, alt_cursor, options_used, swaps_used). */
  extra?: Record<string, unknown>;
}

/**
 * Apply a mutation (swap / mood / put-back / another-option) with matching
 * authoritative metadata in ONE update. Returns the engine evaluation so routes
 * can echo whyThisWorks without recomputing.
 */
export async function persistMutatedRecommendation(
  supabase: SupabaseClient,
  args: MutationPersistArgs,
): Promise<{ error: unknown; evaluated: EvaluatedOutfit; reasoning: string | null }> {
  const ev = evaluateSelectedOutfit(args.items, args.ctx, args.inventory);
  const fingerprint = computeInventoryFingerprint(args.inventory);
  const reasoning = args.reasoning || ev.whyThisWorks[0] || args.reasoningFallback || null;
  const patch: Record<string, unknown> = {
    selected_item_ids: args.selectedIds,
    reasoning,
    ...evaluatedAuthoritativeColumns(ev, fingerprint),
    updated_at: new Date().toISOString(),
    ...(args.extra ?? {}),
  };
  const { error } = await supabase
    .from("daily_recommendations")
    .update(patch)
    .eq("id", args.recId)
    .eq("user_id", args.userId);
  return { error, evaluated: ev, reasoning };
}
