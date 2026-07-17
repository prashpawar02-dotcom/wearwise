// =====================================================================
// WearWise — footwear eligibility & partial-reason authority (Phase 4 hotfix)
// LOCKED DECISION 7: the ONE place that decides WHY footwear is absent from a
// recommendation. Runs the same per-item hard filters (eligiblePool) as the
// rest of the engine, then classifies the honest reason for user-facing copy.
// Pure (server + test safe).
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type { EngineContext, PartialReasonCode } from "@/lib/engine/types";
import { engineRole } from "@/lib/engine/classify";
import { eligiblePool } from "@/lib/engine/filters";

/** All footwear-role items in a wardrobe (by the authoritative classifier). */
export function footwearItems(items: WardrobeItem[]): WardrobeItem[] {
  return items.filter((i) => engineRole(i) === "footwear");
}

/** True when at least one owned footwear item passes every per-item hard filter. */
export function hasEligibleFootwear(items: WardrobeItem[], ctx: EngineContext): boolean {
  const shoes = footwearItems(items);
  if (shoes.length === 0) return false;
  return eligiblePool(shoes, ctx).pool.length > 0;
}

/**
 * The most informative honest reason NO footwear reached the eligible pool.
 * Returns null when some footwear IS eligible (i.e. not a footwear-partial).
 * Priority: incomplete tagging → in wash → archived → unavailable →
 * occasion/formality mismatch → generic none-available.
 */
export function footwearPartialReason(
  items: WardrobeItem[],
  ctx: EngineContext,
): PartialReasonCode | null {
  const shoes = footwearItems(items);
  if (shoes.length === 0) return "no_footwear_in_wardrobe";

  const { pool } = eligiblePool(shoes, ctx);
  if (pool.length > 0) return null; // some footwear is genuinely eligible

  if (shoes.some((s) => s.ai_tag_status === "analyzing" || s.ai_tag_status === "failed")) {
    return "incomplete_tagging";
  }
  const statuses = shoes.map((s) => s.availability_status ?? "available");
  if (statuses.some((s) => s === "in_wash")) return "footwear_in_wash";
  if (statuses.some((s) => s === "archived")) return "footwear_archived";
  if (statuses.some((s) => s !== "available")) return "footwear_unavailable";
  // Every owned shoe is 'available' yet none passed → filtered by weather /
  // formality / occasion / cultural / user exclusion.
  return "occasion_or_formality_mismatch";
}
