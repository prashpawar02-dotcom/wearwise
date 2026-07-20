// =====================================================================
// WearWise — Closet Board placement partition (Phase 5, Module C1)
//
// PURE, deterministic board composition. `zoneForItem` (src/lib/wardrobe.ts)
// remains the single placement authority; this helper only applies the board's
// visibility contract on top of it so the rules are testable in one place:
//   • ARCHIVED items are omitted from the board entirely.
//   • Every remaining item lands in EXACTLY ONE zone (via zoneForItem).
//   • In-wash items are surfaced only through the Laundry surface — never in a
//     zone's `available` shelf.
//   • Unknown-but-valid items use zoneForItem's single documented fallback
//     (hanging) rather than disappearing.
// =====================================================================

import type { WardrobeItem } from "@/lib/types";
import { zoneForItem, ZONE_ORDER, type Zone } from "@/lib/wardrobe";

export interface ZoneBucket {
  /** Every non-archived item placed in this zone (available + in-wash + unavailable). */
  all: WardrobeItem[];
  /** Wearable-now items — the ones a zone shelf renders. */
  available: WardrobeItem[];
  /** In-wash items in this zone (shown only in the Laundry surface, not the shelf). */
  inWash: WardrobeItem[];
  /** Other not-available (excludes archived, which are off-board). */
  unavailable: WardrobeItem[];
}

export interface BoardPartition {
  /** Non-archived items, in input order. */
  boardItems: WardrobeItem[];
  zones: Record<Zone, ZoneBucket>;
  /** All in-wash board items (the Laundry surface source). */
  laundry: WardrobeItem[];
  /** How many items were omitted for being archived. */
  archivedCount: number;
}

function emptyBucket(): ZoneBucket {
  return { all: [], available: [], inWash: [], unavailable: [] };
}

const status = (i: WardrobeItem) => i.availability_status ?? "available";

/** Partition a wardrobe into the board's zones under the visibility contract. */
export function partitionBoardItems(items: ReadonlyArray<WardrobeItem>): BoardPartition {
  const zones = Object.fromEntries(ZONE_ORDER.map((z) => [z, emptyBucket()])) as Record<Zone, ZoneBucket>;
  const boardItems: WardrobeItem[] = [];
  const laundry: WardrobeItem[] = [];
  let archivedCount = 0;

  for (const item of items) {
    if (status(item) === "archived") {
      archivedCount += 1;
      continue; // archived is off-board
    }
    boardItems.push(item);
    const bucket = zones[zoneForItem(item)];
    bucket.all.push(item);
    const s = status(item);
    if (s === "available") bucket.available.push(item);
    else if (s === "in_wash") {
      bucket.inWash.push(item);
      laundry.push(item);
    } else bucket.unavailable.push(item);
  }

  return { boardItems, zones, laundry, archivedCount };
}
