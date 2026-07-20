// =====================================================================
// WearWise — Wardrobe Insights & Quiet Gems (Phase 5, Module A)
//
// PURE, DETERMINISTIC logic — no I/O, no DB, no React. Everything the
// board and the daily-drop copy show about "gems" and "insights" is
// computed here from real signals so nothing on screen is fabricated
// (fabricated insight = release blocker per handbook §5 Phase 5).
//
// DATA REALITY (verified against repo, not the Phase 5 prompt):
//   • There is NO `wear_count` column on wardrobe_items. Wear FREQUENCY
//     is derived by aggregating `worn_history.item_ids[]` — see
//     wearCountsFromHistory(). Each history row = one worn occasion, so an
//     item is counted AT MOST ONCE per row (duplicates within a row are a
//     data glitch, never a second wear).
//   • There is NO persisted per-item `compatibility_score`. A Quiet Gem is
//     therefore proven "recommendable" through the REAL engine (see
//     gem-validation.ts) and that proof is injected here as
//     `GemContext.recommendableIds`. This module never re-implements the
//     engine; it only gates recency/availability/cooldown/identity.
//   • "Resting 6+ weeks" (handbook §6.2) drives the gem/recency framing.
// =====================================================================

import type { WardrobeItem } from "@/lib/types";

const DAY_MS = 86_400_000;

/** A piece counts as "quiet" once it has rested at least this long. ~6 weeks. */
export const GEM_RESTING_DAYS = 42;
/** A NEVER-worn piece only qualifies once it has been owned this long, so a
 *  brand-new upload from yesterday is not mislabelled a rediscovered gem. */
export const GEM_MIN_OWNED_DAYS = 42;
/** Skip a suggested gem twice → rest it this long (handbook §5 Phase 5.6). */
export const GEM_COOLDOWN_DAYS = 90;

/** Whole days from an ISO timestamp to `now`, or null when the input is null. */
export function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / DAY_MS);
}

/** Human label for an item, never leaking anything sensitive. */
export function itemLabel(item: WardrobeItem): string {
  return item.user_facing_name || item.sub_category || item.category || "a piece";
}

// ---------------------------------------------------------------------
// Wear frequency — derived from worn_history, the only source of truth.
// Each worn_history row carries the item_ids worn together that day; an
// item counts once per row even if the array lists it twice.
// ---------------------------------------------------------------------
export function wearCountsFromHistory(
  rows: ReadonlyArray<{ item_ids: string[] | null } | null | undefined>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const ids = row?.item_ids;
    if (!Array.isArray(ids)) continue; // null / malformed row → skip safely
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id || seen.has(id)) continue; // ignore blanks + intra-row duplicates
      seen.add(id);
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------
// Quiet Gems
// ---------------------------------------------------------------------
export interface GemContext {
  /** Reference "now" (injected for determinism/tests). Defaults to real now. */
  now?: Date;
  /** Override the resting threshold (default GEM_RESTING_DAYS). */
  restingDays?: number;
  /** itemId → ISO timestamp the cooldown expires. Items still cooling are excluded. */
  cooldownUntil?: Record<string, string | null>;
  /**
   * IDs proven (by the REAL engine — see gem-validation.recommendableItemIds)
   * to participate in at least one valid, complete outfit from the user's
   * currently-available wardrobe. When provided, an item MUST be a member to
   * qualify as a gem. Production callers ALWAYS pass this; when absent the
   * selector runs in recency-only mode (unit-test / diagnostic use only).
   */
  recommendableIds?: ReadonlySet<string> | null;
}

/** "Restedness" used for ranking: days since last worn, or — if never worn —
 *  days owned. Higher = quieter. */
export function gemRestedness(item: WardrobeItem, now: Date): number {
  const sinceWorn = daysSince(item.last_worn_at, now);
  if (sinceWorn !== null) return sinceWorn;
  return daysSince(item.created_at, now) ?? 0;
}

export function isGemEligible(item: WardrobeItem, ctx: GemContext = {}): boolean {
  const now = ctx.now ?? new Date();
  const restingDays = ctx.restingDays ?? GEM_RESTING_DAYS;

  // Wearable right now — excludes in_wash / unavailable / archived.
  if (item.availability_status !== "available") return false;

  // A real, identifiable piece (never surface blank/junk rows).
  if (!item.category && !item.user_facing_name && !item.sub_category) return false;

  // Adequate recommendation-critical tag confidence: an item still in the
  // tag-check queue is not trustworthy enough to spotlight.
  if (item.ai_tag_status === "needs_review") return false;

  // Proven engine participation (when the caller supplied the proof).
  if (ctx.recommendableIds && !ctx.recommendableIds.has(item.id)) return false;

  // Active rest/cooldown.
  const cd = ctx.cooldownUntil?.[item.id];
  if (cd) {
    const cdMs = Date.parse(cd);
    if (!Number.isNaN(cdMs) && cdMs > now.getTime()) return false;
  }

  // Rested long enough.
  const sinceWorn = daysSince(item.last_worn_at, now);
  if (sinceWorn !== null) return sinceWorn >= restingDays;

  // Never worn → must have been OWNED long enough to count as "quiet".
  const owned = daysSince(item.created_at, now);
  return owned !== null && owned >= GEM_MIN_OWNED_DAYS;
}

/** Available, genuinely-rested, engine-recommendable pieces, quietest first.
 *  Ordering is fully deterministic (restedness desc, then id asc). */
export function selectQuietGems(items: ReadonlyArray<WardrobeItem>, ctx: GemContext = {}): WardrobeItem[] {
  const now = ctx.now ?? new Date();
  return items
    .filter((it) => isGemEligible(it, ctx))
    .sort((a, b) => gemRestedness(b, now) - gemRestedness(a, now) || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------
// Insight cards — max 3, every number query-backed. If a signal isn't
// real (or a "winner" is tied), the card is omitted — never faked.
// ---------------------------------------------------------------------
export type InsightCard =
  | { kind: "most_worn"; itemId: string; label: string; count: number }
  | { kind: "quiet_gems"; count: number; topItemId: string; topLabel: string }
  | { kind: "laundry"; inWash: number; available: number };

export function buildInsightCards(
  items: ReadonlyArray<WardrobeItem>,
  wearCounts: Record<string, number>,
  ctx: GemContext = {},
): InsightCard[] {
  const cards: InsightCard[] = [];

  // 1) Most-worn — only when there is a SINGLE, unambiguous top item.
  let topId: string | null = null;
  let topCount = 0;
  let tiedAtTop = false;
  for (const it of items) {
    const c = wearCounts[it.id] ?? 0;
    if (c > topCount) {
      topCount = c;
      topId = it.id;
      tiedAtTop = false;
    } else if (c === topCount && c > 0) {
      tiedAtTop = true;
    }
  }
  if (topId && topCount > 0 && !tiedAtTop) {
    const it = items.find((x) => x.id === topId)!;
    cards.push({ kind: "most_worn", itemId: topId, label: itemLabel(it), count: topCount });
  }

  // 2) Quiet gems — count + the single quietest (for the copy).
  const gems = selectQuietGems(items, ctx);
  if (gems.length > 0) {
    cards.push({
      kind: "quiet_gems",
      count: gems.length,
      topItemId: gems[0].id,
      topLabel: itemLabel(gems[0]),
    });
  }

  // 3) Laundry snapshot — only when something is actually in the wash (E4:
  //    omit when nothing is in wash; the board's positive empty-state covers that).
  const inWash = items.filter((i) => i.availability_status === "in_wash").length;
  if (inWash > 0) {
    const available = items.filter((i) => i.availability_status === "available").length;
    cards.push({ kind: "laundry", inWash, available });
  }

  return cards.slice(0, 3);
}
