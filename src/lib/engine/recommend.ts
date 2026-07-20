// =====================================================================
// WearWise — Engine v2 PIPELINE (Phase 1, + missing-footwear hotfix)
// HARD FILTERS -> SCORING -> RANK & EXPLAIN. This is the single gate every
// engine-generated outfit passes. Deterministic and fail-closed.
//
// Completeness policy (CEO-approved, Phase 1 hotfix):
//   1. Try COMPLETE outfits first (garments + footwear when footwear exists).
//   2. If any complete outfit exists → return it unchanged (prior behaviour).
//   3. If NONE exist but a valid garment pairing does and the ONLY missing slot
//      is footwear → return a PARTIAL outfit (garments only) with an honest
//      note, missing_slots:["footwear"], and confidence capped ≤ 0.45.
//   4. Otherwise hero is null with a helpful fail reason.
// It never fabricates footwear and never relaxes any other hard rule: partial
// candidates still pass every filter (availability, weather, cultural,
// formality window, structure, piece-count).
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type {
  EngineContext, EvaluatedOutfit, MissingSlot, OutfitStatus, PartialReason,
  PartialReasonCode, RecommendationResult, ScoredOutfit,
} from "@/lib/engine/types";
import { eligiblePool, candidateRejection } from "@/lib/engine/filters";
import { buildCandidates } from "@/lib/engine/templates";
import { scoreOutfit } from "@/lib/engine/scoring";
import { engineRole, hasFootwear } from "@/lib/engine/classify";
import { footwearPartialReason } from "@/lib/engine/footwear";
import { constrainedInventoryNote } from "@/lib/laundry";

const CORE_ROLES = new Set(["upper", "ethnic_upper", "bottom", "one_piece", "saree", "outerwear"]);
const PARTIAL_CONFIDENCE_CAP = 0.45;

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

function coreIds(o: ScoredOutfit): Set<string> {
  return new Set(o.items.filter((i) => CORE_ROLES.has(engineRole(i))).map((i) => i.id));
}
function shareCore(a: ScoredOutfit, b: ScoredOutfit): boolean {
  const bs = coreIds(b);
  for (const id of coreIds(a)) if (bs.has(id)) return true;
  return false;
}

/** Honest, truthful partial note — never claims the outfit is complete. */
function partialNote(items: WardrobeItem[], reason: PartialReason): string {
  const onePiece = items.some((i) => engineRole(i) === "one_piece" || engineRole(i) === "saree");
  const lead = onePiece ? "Your outfit is ready." : "Top and bottom are ready.";
  const tail = reason === "no_footwear_in_wardrobe"
    ? "I do not have shoes in your wardrobe yet, so choose your own footwear."
    : "Your shoes are all unavailable right now, so choose your own footwear.";
  return `${lead} ${tail}`;
}

/**
 * Generate ranked, validator-passing outfits for a context.
 * @param wanted how many outfits total (hero + backups). Default 3.
 */
export function recommendOutfits(
  items: WardrobeItem[],
  ctx: EngineContext,
  wanted = 3,
): RecommendationResult {
  const start = Date.now();

  // 1. HARD FILTERS (per-item)
  const { pool } = eligiblePool(items, ctx);

  // 2. build candidates, reject invalid, SCORE survivors — split complete/partial
  const candidates = buildCandidates(pool, ctx);
  let builtComplete = 0, builtPartial = 0;
  const complete: ScoredOutfit[] = [];
  const partial: ScoredOutfit[] = [];
  for (const c of candidates) {
    const isComplete = hasFootwear(c.items);
    if (isComplete) builtComplete++; else builtPartial++;
    if (candidateRejection(c.items, ctx)) continue; // fail closed
    const s = scoreOutfit(c.items, ctx);
    const outfit: ScoredOutfit = {
      itemIds: c.items.map((i) => i.id),
      items: c.items,
      template: c.template,
      total: s.total,
      confidence: 0, // set after margins are known
      factors: s.factors,
      penalties: s.penalties,
      whyThisWorks: s.whyThisWorks,
      completeness: isComplete ? "complete" : "partial",
      missingSlots: isComplete ? [] : (["footwear"] as MissingSlot[]),
    };
    (isComplete ? complete : partial).push(outfit);
  }

  const rank = (a: ScoredOutfit, b: ScoredOutfit) =>
    b.total - a.total || a.itemIds.join().localeCompare(b.itemIds.join());
  complete.sort(rank);
  partial.sort(rank);

  const diagnostics: RecommendationResult["diagnostics"] = {
    poolSize: items.length,
    afterAvailability: pool.length,
    candidatesBuilt: builtComplete,
    candidatesValid: complete.length,
    partialCandidatesBuilt: builtPartial,
    partialCandidatesValid: partial.length,
    elapsedMs: 0,
  };

  // 3. choose the working set: COMPLETE first, PARTIAL only as fallback.
  const usingPartial = complete.length === 0 && partial.length > 0;
  const working = complete.length > 0 ? complete : partial;

  if (working.length === 0) {
    diagnostics.elapsedMs = Date.now() - start;
    return {
      hero: null, backups: [], dualPick: false,
      failReason: pool.length === 0 ? "no_wearable_items" : "no_valid_outfit",
      outfitStatus: "complete", missingSlots: [], partialReasonCode: null, diagnostics,
    };
  }

  // partialReason: distinguish "no shoes owned" vs "shoes owned but unavailable".
  const rawHasFootwear = hasFootwear(items);
  const partialReason: PartialReason | undefined = usingPartial
    ? (rawHasFootwear ? "no_available_footwear" : "no_footwear_in_wardrobe")
    : undefined;

  // 4. pick hero + distinct backups (prefer non-overlapping cores for variety)
  const picks: ScoredOutfit[] = [working[0]];
  for (const cand of working.slice(1)) {
    if (picks.length >= wanted) break;
    if (picks.every((p) => !shareCore(p, cand))) picks.push(cand);
  }
  for (const cand of working.slice(1)) {
    if (picks.length >= wanted) break;
    if (!picks.includes(cand)) picks.push(cand);
  }

  // 5. confidence = inventory depth × tag completeness × score margin.
  //    Partial outfits are truthfully capped and carry the honest note.
  const validCount = working.length;
  const inventoryDepth = clamp01(validCount / 8);
  const posMax = Object.values(ctx.config.scoringWeights).reduce((a, b) => a + b, 0) || 1;
  picks.forEach((o, idx) => {
    const next = picks[idx + 1] ?? working[Math.min(working.length - 1, idx + 1)];
    const margin = clamp01((o.total - (next?.total ?? o.total)) / posMax + 0.5);
    const s = scoreOutfit(o.items, ctx);
    let confidence = clamp01(0.5 * s.norm + 0.2 * inventoryDepth + 0.2 * s.tagCompleteness + 0.1 * margin);
    if (usingPartial) {
      confidence = Math.min(PARTIAL_CONFIDENCE_CAP, confidence);
      o.partialReason = partialReason;
      const note = partialNote(o.items, partialReason as PartialReason);
      o.whyThisWorks = [note, ...o.whyThisWorks.filter((w) => w !== note)];
    }
    o.confidence = confidence;
  });

  const hero = picks[0];
  const backups = picks.slice(1);
  const dualPick = hero.confidence < ctx.config.thresholds.confidence_dual_pick;

  if (usingPartial) {
    diagnostics.missingSlots = ["footwear"];
    diagnostics.partialReason = partialReason;
  }
  diagnostics.elapsedMs = Date.now() - start;

  return {
    hero, backups, dualPick,
    failReason: usingPartial ? "partial_missing_footwear" : undefined,
    outfitStatus: usingPartial ? "partial" : "complete",
    missingSlots: usingPartial ? ["footwear"] : [],
    partialReason,
    // Fine-grained honest reason for storage/UI (computed from the FULL wardrobe).
    partialReasonCode: usingPartial ? footwearPartialReason(items, ctx) : null,
    // Honest note when today's clean options were the best available under
    // laundry pressure (Phase 2). Computed from the FULL wardrobe (incl. in_wash).
    constrainedNote: constrainedInventoryNote(items, ctx.occasion),
    diagnostics,
  };
}

/**
 * Score an ALREADY-selected outfit and produce the persistable factor
 * breakdown + confidence + dual-pick flag. Used to store per-recommendation
 * factor contributions (acceptance: "factor contributions stored") without
 * changing how the outfit was chosen.
 */
export function explainSelectedOutfit(items: WardrobeItem[], ctx: EngineContext): {
  confidence: number;
  is_dual_pick: boolean;
  factor_breakdown: {
    factors: ScoredOutfit["factors"];
    penalties: ScoredOutfit["penalties"];
    whyThisWorks: string[];
    total: number;
  };
} {
  const s = scoreOutfit(items, ctx);
  const confidence = clamp01(0.6 * s.norm + 0.4 * s.tagCompleteness);
  return {
    confidence,
    is_dual_pick: confidence < ctx.config.thresholds.confidence_dual_pick,
    factor_breakdown: { factors: s.factors, penalties: s.penalties, whyThisWorks: s.whyThisWorks, total: s.total },
  };
}

/**
 * LOCKED DECISION 7 — the single engine-level evaluator for an ALREADY-selected
 * outfit (swap / mood / put-back / another-option). Uses the SAME engineRole,
 * partial-state logic (footwearPartialReason), and scoring/explanation as fresh
 * generation. `inventory` is the user's full wardrobe (needed to decide WHY a
 * slot is missing). It never re-invents partial reasons elsewhere.
 */
export function evaluateSelectedOutfit(
  items: WardrobeItem[],
  ctx: EngineContext,
  inventory: WardrobeItem[],
): EvaluatedOutfit {
  const hasShoe = items.some((i) => engineRole(i) === "footwear");
  const outfit_status: OutfitStatus = hasShoe ? "complete" : "partial";
  const missing_slots: MissingSlot[] = hasShoe ? [] : ["footwear"];
  const partial_reason: PartialReasonCode | null = hasShoe ? null : footwearPartialReason(inventory, ctx);

  const s = scoreOutfit(items, ctx);
  const confidence = clamp01(0.6 * s.norm + 0.4 * s.tagCompleteness);
  const factor_breakdown = { factors: s.factors, penalties: s.penalties, whyThisWorks: s.whyThisWorks, total: s.total };
  return {
    outfit_status,
    missing_slots,
    partial_reason,
    confidence,
    is_dual_pick: confidence < ctx.config.thresholds.confidence_dual_pick,
    factor_breakdown,
    whyThisWorks: s.whyThisWorks,
  };
}
