// =====================================================================
// WearWise — Engine v2 PIPELINE (Phase 1)
// HARD FILTERS -> SCORING -> RANK & EXPLAIN. This is the single gate every
// engine-generated outfit passes. Deterministic, fail-closed, and it never
// fabricates an outfit: if nothing valid exists, hero is null with a reason.
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type {
  EngineContext, RecommendationResult, ScoredOutfit,
} from "@/lib/engine/types";
import { eligiblePool, candidateRejection } from "@/lib/engine/filters";
import { buildCandidates } from "@/lib/engine/templates";
import { scoreOutfit } from "@/lib/engine/scoring";
import { engineRole } from "@/lib/engine/classify";

const CORE_ROLES = new Set(["upper", "ethnic_upper", "bottom", "one_piece", "saree", "outerwear"]);

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

function coreIds(o: ScoredOutfit): Set<string> {
  return new Set(o.items.filter((i) => CORE_ROLES.has(engineRole(i))).map((i) => i.id));
}
function shareCore(a: ScoredOutfit, b: ScoredOutfit): boolean {
  const bs = coreIds(b);
  for (const id of coreIds(a)) if (bs.has(id)) return true;
  return false;
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

  // 2. build candidates + reject invalid + SCORE the survivors
  const candidates = buildCandidates(pool, ctx);
  let candidatesValid = 0;
  const scored: ScoredOutfit[] = [];
  for (const c of candidates) {
    if (candidateRejection(c.items, ctx)) continue; // fail closed
    candidatesValid++;
    const s = scoreOutfit(c.items, ctx);
    scored.push({
      itemIds: c.items.map((i) => i.id),
      items: c.items,
      template: c.template,
      total: s.total,
      confidence: 0, // set after margins are known
      factors: s.factors,
      penalties: s.penalties,
      whyThisWorks: s.whyThisWorks,
    });
  }

  // 3. RANK (deterministic: score desc, then stable by item ids)
  scored.sort((a, b) => b.total - a.total || a.itemIds.join().localeCompare(b.itemIds.join()));

  const diagnostics = {
    poolSize: items.length,
    afterAvailability: pool.length,
    candidatesBuilt: candidates.length,
    candidatesValid,
    elapsedMs: 0,
  };

  if (scored.length === 0) {
    diagnostics.elapsedMs = Date.now() - start;
    return { hero: null, backups: [], dualPick: false, failReason: pool.length === 0 ? "no_wearable_items" : "no_valid_outfit", diagnostics };
  }

  // 4. pick hero + distinct backups (prefer non-overlapping cores for variety)
  const picks: ScoredOutfit[] = [scored[0]];
  for (const cand of scored.slice(1)) {
    if (picks.length >= wanted) break;
    if (picks.every((p) => !shareCore(p, cand))) picks.push(cand);
  }
  // top up with next-best even if cores overlap (still distinct item sets)
  for (const cand of scored.slice(1)) {
    if (picks.length >= wanted) break;
    if (!picks.includes(cand)) picks.push(cand);
  }

  // 5. confidence = inventory depth × tag completeness × score margin
  const inventoryDepth = clamp01(candidatesValid / 8);
  const posMax = Object.values(ctx.config.scoringWeights).reduce((a, b) => a + b, 0) || 1;
  picks.forEach((o, idx) => {
    const next = picks[idx + 1] ?? scored[Math.min(scored.length - 1, idx + 1)];
    const margin = clamp01((o.total - (next?.total ?? o.total)) / posMax + 0.5);
    const s = scoreOutfit(o.items, ctx); // recompute for tagCompleteness/norm (cheap)
    o.confidence = clamp01(0.5 * s.norm + 0.2 * inventoryDepth + 0.2 * s.tagCompleteness + 0.1 * margin);
  });

  const hero = picks[0];
  const backups = picks.slice(1);
  const dualPick = hero.confidence < ctx.config.thresholds.confidence_dual_pick;

  diagnostics.elapsedMs = Date.now() - start;
  return { hero, backups, dualPick, diagnostics };
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
