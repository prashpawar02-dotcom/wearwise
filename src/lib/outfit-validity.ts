// =====================================================================
// WearWise — Runtime outfit validity (Phase 3 production hotfix)
// SERVER-ONLY. The single authoritative "is this stored outfit still wearable
// RIGHT NOW?" check. Every read/apply path that surfaces a persisted or
// precomputed outfit (daily drop, backups, legacy outfit-suggestion cards,
// swap/mood/another-option apply, precomputed swap candidates) must pass its
// item IDs through here BEFORE returning them to the client.
//
// FAIL CLOSED: an item that is missing, owned by someone else (RLS returns no
// row), in the wash, unavailable, or archived is never wearable. Applicable
// hard filters are re-run on the fully-available set so a combination that has
// since become illegal (e.g. a locked piece that would now clash) is caught too.
// =====================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WardrobeItem } from "@/lib/types";
import type { EngineContext } from "@/lib/engine/types";
import { candidateRejection } from "@/lib/engine/filters";

export type InvalidReason =
  | "in_wash" | "unavailable" | "archived" | "missing" | "hard_filter_failed";

export interface ItemInvalidity { itemId: string; reason: InvalidReason; }

export interface ValidityResult {
  /** True only when every requested item is present, owned, available, and the
   *  combination passes the hard filters (when a ctx is supplied). */
  valid: boolean;
  /** IDs that are present + owned + available (order follows the input). */
  validItemIds: string[];
  /** Every item that failed, with a structured reason. */
  invalid: ItemInvalidity[];
  /** The reloaded, currently-available rows (for rendering). */
  items: WardrobeItem[];
}

function reasonForStatus(status: string | null | undefined): InvalidReason {
  switch (status) {
    case "in_wash": return "in_wash";
    case "archived": return "archived";
    default: return "unavailable";
  }
}

/**
 * Reload current wardrobe rows for `itemIds` (owner-scoped) and classify each.
 * Pass an EngineContext to also re-run the hard-filter layer on the available
 * set. Never throws for a normal miss — an unreadable row is treated as missing
 * (fail closed).
 */
export async function validateOutfitCurrent(
  supabase: SupabaseClient,
  userId: string,
  itemIds: string[],
  opts: { ctx?: EngineContext } = {},
): Promise<ValidityResult> {
  const ids = [...new Set(itemIds)].filter(Boolean);
  if (ids.length === 0) {
    return { valid: false, validItemIds: [], invalid: [], items: [] };
  }

  let rows: WardrobeItem[] = [];
  try {
    const { data } = await supabase
      .from("wardrobe_items")
      .select("*")
      .eq("user_id", userId)
      .in("id", ids);
    rows = (data ?? []) as WardrobeItem[];
  } catch {
    // Read failure → treat everything as unverifiable → fail closed below.
    rows = [];
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const invalid: ItemInvalidity[] = [];
  const available: WardrobeItem[] = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) { invalid.push({ itemId: id, reason: "missing" }); continue; } // missing OR other-user (RLS)
    const status = row.availability_status ?? "available";
    if (status !== "available") { invalid.push({ itemId: id, reason: reasonForStatus(status) }); continue; }
    available.push(row);
  }

  // Re-run applicable hard filters on the still-available set (fail closed).
  let hardFail = false;
  if (invalid.length === 0 && opts.ctx && available.length > 0) {
    const rej = candidateRejection(available, opts.ctx);
    if (rej) { hardFail = true; invalid.push({ itemId: available[0].id, reason: "hard_filter_failed" }); }
  }

  return {
    valid: invalid.length === 0 && !hardFail,
    validItemIds: available.map((i) => i.id),
    invalid,
    items: available,
  };
}

/** Convenience: true when EVERY id is currently wearable (availability only). */
export async function allItemsAvailable(
  supabase: SupabaseClient,
  userId: string,
  itemIds: string[],
): Promise<boolean> {
  const r = await validateOutfitCurrent(supabase, userId, itemIds);
  return r.valid;
}
