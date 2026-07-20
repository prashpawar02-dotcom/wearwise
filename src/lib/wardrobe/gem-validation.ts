// =====================================================================
// WearWise — Quiet-Gem participation proof (Phase 5, Module A)
//
// A Quiet Gem must be PROVEN capable of participating in a real, valid,
// complete outfit — not merely available/old/rarely-worn. This module does
// NOT re-implement the recommender. It reuses the engine's own seams:
//   eligiblePool()      — the exact hard-filter pass
//   buildCandidates()   — the exact candidate generation
//   candidateRejection()— the exact per-outfit hard validation
//   engineRole()        — the exact garment-role vocabulary (footwear = complete)
// and collects the item IDs that survive into at least one COMPLETE candidate
// for at least one realistic context. When participation cannot be proven,
// the item is simply omitted (handbook §5: "omit the gem rather than guess").
// =====================================================================

import type { WardrobeItem } from "@/lib/types";
import type { EngineContext } from "@/lib/engine/types";
// Import directly from the specific engine modules (not the "@/lib/engine"
// barrel) so this stays free of the Supabase-backed loadContext in the barrel.
// hasFootwear is the SAME completeness gate recommend.ts uses (extracted into
// classify.ts) — no rule is reproduced here.
import { eligiblePool, candidateRejection } from "@/lib/engine/filters";
import { buildCandidates } from "@/lib/engine/templates";
import { hasFootwear } from "@/lib/engine/classify";

/**
 * IDs of items that participate in ≥1 hard-valid, COMPLETE outfit the engine
 * can actually build from `available` across ANY of the given contexts.
 * Deterministic and side-effect free.
 */
export function recommendableItemIds(
  available: ReadonlyArray<WardrobeItem>,
  contexts: ReadonlyArray<EngineContext>,
): Set<string> {
  const ids = new Set<string>();
  const items = available as WardrobeItem[];
  for (const ctx of contexts) {
    const { pool } = eligiblePool(items, ctx);
    for (const candidate of buildCandidates(pool, ctx)) {
      if (!hasFootwear(candidate.items)) continue; // complete outfits only (same gate as recommend)
      if (candidateRejection(candidate.items, ctx)) continue; // same hard validation used before display
      for (const it of candidate.items) ids.add(it.id);
    }
  }
  return ids;
}
