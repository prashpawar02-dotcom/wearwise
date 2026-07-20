// =====================================================================
// WearWise — Today Quiet-Gem qualification + note (Phase 5, Module F, F2/F3)
//
// PURE. Decides whether the ACTUAL rendered daily recommendation qualifies to
// show a gem note. Participation in a valid complete outfit is proven by the
// gem being a member of the final, complete, availability-validated outfit —
// so this does NOT re-run the engine. It only re-checks, against server truth:
//   • the outfit is complete;
//   • every rendered item id resolves to a current owned item (no stale/deleted);
//   • every rendered item is available RIGHT NOW (final availability);
//   • at least one contained item passes Quiet-Gem gating (rested, available,
//     identifiable, not needs_review, not cooling down, not archived).
// When several gems are present, one is chosen deterministically (quietest,
// then id). Copy is derived only from real dates — never fabricated.
// =====================================================================

import type { WardrobeItem } from "@/lib/types";
import { isGemEligible, gemRestedness, daysSince, itemLabel, type GemContext } from "@/lib/wardrobe/insights";

export interface TodayGemInput {
  /** The FINAL authoritative recommendation's selected item ids. */
  outfitItemIds: ReadonlyArray<string>;
  /** True only when the authoritative recommendation status is "complete". */
  outfitComplete: boolean;
  /** Current owned wardrobe items (for lookup + availability). */
  items: ReadonlyArray<WardrobeItem>;
  now?: Date;
  /** itemId → ISO cooldown expiry (from the 0029 columns). */
  cooldownUntil?: Record<string, string | null>;
}

/** The qualifying gem to spotlight on Today, or null when no note should show. */
export function qualifyingTodayGem(input: TodayGemInput): WardrobeItem | null {
  const now = input.now ?? new Date();
  if (!input.outfitComplete) return null;

  const byId = new Map(input.items.map((i) => [i.id, i]));
  const outfit: WardrobeItem[] = [];
  for (const id of input.outfitItemIds) {
    const it = byId.get(id);
    if (!it) return null; // a rendered item no longer exists → stale → no note
    outfit.push(it);
  }
  if (outfit.length === 0) return null;

  // Final availability: every rendered item must be available right now.
  if (outfit.some((i) => (i.availability_status ?? "available") !== "available")) return null;

  // Gem gating WITHOUT recommendableIds — participation is proven by membership
  // in this final, complete, validated outfit.
  const ctx: GemContext = { now, cooldownUntil: input.cooldownUntil };
  const gems = outfit.filter((i) => isGemEligible(i, ctx));
  if (gems.length === 0) return null;

  // Deterministic choice: quietest first, then id.
  gems.sort((a, b) => gemRestedness(b, now) - gemRestedness(a, now) || a.id.localeCompare(b.id));
  return gems[0];
}

/**
 * Stable "meaningful render" identity for gem_shown dedup (F4): recommendation
 * id + canonical sorted selected item ids + chosen gem id. A swap that changes
 * the rendered outfit changes this key (a distinct render); a React rerender of
 * the same rendered outfit keeps it (no duplicate event).
 */
export function gemShownKey(
  recommendationId: string,
  selectedItemIds: ReadonlyArray<string>,
  gemItemId: string,
): string {
  return `${recommendationId}|${[...selectedItemIds].sort().join(",")}|${gemItemId}`;
}

/**
 * gem_worn (F9) fires ONLY on a newly `confirmed` wear (wear route status "ok")
 * of an authoritative outfit that contained a qualifying gem. The idempotent
 * duplicate ("already") and every failure emit nothing.
 */
export function shouldEmitGemWorn(wearStatus: string, hadQualifyingGem: boolean): boolean {
  return wearStatus === "ok" && hadQualifyingGem;
}

/** Calm, factual note derived only from the gem's real dates. */
export function todayGemNote(gem: WardrobeItem, now: Date = new Date()): string {
  const label = itemLabel(gem).toLowerCase();
  const sinceWorn = daysSince(gem.last_worn_at, now);
  if (sinceWorn === null) {
    // Never worn (but owned long enough to be a gem) — never call it "forgotten".
    return "This piece has been waiting in your wardrobe. A good day to bring it out.";
  }
  const weeks = Math.floor(sinceWorn / 7);
  // Only claim a precise number of weeks when the source date supports it.
  return weeks >= 6
    ? `That ${label} had been resting for ${weeks} weeks. Welcome back.`
    : `That ${label} hasn't been out in a while. Welcome back.`;
}
