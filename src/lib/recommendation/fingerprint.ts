// =====================================================================
// WearWise — canonical inventory fingerprint (Phase 4 hotfix, locked decision 5)
// Stable hash over sorted wardrobe rows using ONLY eligibility-affecting fields.
// Excludes display/history fields (image path, last_worn_at, laundry notes,
// generated copy). Pure & deterministic; same inventory → same fingerprint.
// =====================================================================
import type { WardrobeItem } from "@/lib/types";

/** Fields that genuinely change whether/how an item can be recommended. */
function canonicalRow(i: WardrobeItem): string {
  const occ = (i.occasion_tags ?? []).map((o) => String(o)).sort();
  // JSON.stringify keeps field boundaries unambiguous (no separator collisions).
  return JSON.stringify([
    i.id ?? "",
    i.availability_status ?? "available",
    (i.category ?? "").trim().toLowerCase(),
    (i.sub_category ?? "").trim().toLowerCase(),
    i.cultural_tag ?? "",
    i.formality == null ? "" : String(i.formality),
    i.ai_tag_status ?? "",
    occ,
  ]);
}

/** Stable 64-bit-ish hex hash (djb2 ⊕ sdbm); non-cryptographic, change-detection only. */
function stableHash(s: string): string {
  let h1 = 5381 >>> 0;
  let h2 = 0 >>> 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (((h1 << 5) + h1) ^ c) >>> 0;              // djb2 xor
    h2 = (c + (h2 << 6) + (h2 << 16) - h2) >>> 0;   // sdbm
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * Canonical fingerprint of the recommendation-affecting wardrobe state.
 * Order-independent (rows are sorted) so row ordering never flips it.
 */
export function computeInventoryFingerprint(items: WardrobeItem[]): string {
  const rows = items.map(canonicalRow).sort();
  return stableHash(rows.join("\n"));
}
