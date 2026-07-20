// =====================================================================
// WearWise — Recommendation-critical tag correction + check queue
// (Phase 5, Module D). PURE logic + a dependency-injected orchestrator so the
// persistence/telemetry contract is unit-testable without React or Supabase.
//
// SCOPE — only the three fields with proven recommendation read sites:
//   • category     (engine role / structure — classify.ts)
//   • formality    (formality window — filters.ts)
//   • cultural_tag (pairing legality — filters/guards)
// Impact order (highest first) doubles as the stable priority tiebreak.
//
// The corrected value persists through the EXISTING mutation path
// (browser Supabase `update().eq(id)`, owner-isolated by RLS). Only the edited
// field's confidence becomes 1; unrelated tag_confidence keys are preserved.
// =====================================================================

import { CATEGORIES, type WardrobeItem } from "@/lib/types";

export type CriticalField = "category" | "formality" | "cultural_tag";

/** Impact order (desc) — also the stable priority for deterministic ordering. */
export const CRITICAL_FIELD_ORDER: readonly CriticalField[] = ["category", "formality", "cultural_tag"];

/** A confirmed field (confidence === 1) is never re-surfaced; a field below this
 *  (or with a missing value) is worth a quick check. */
export const TAG_CHECK_LOW_CONFIDENCE = 0.7;

export const FORMALITY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: "Very casual" },
  { value: 2, label: "Casual" },
  { value: 3, label: "Smart casual" },
  { value: 4, label: "Formal" },
  { value: 5, label: "Very formal" },
];

export const CULTURAL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "western", label: "Western" },
  { value: "indian_ethnic", label: "Ethnic" },
  { value: "indo_western", label: "Indo-Western" },
];

export const FIELD_LABEL: Record<CriticalField, string> = {
  category: "Category",
  formality: "How dressy",
  cultural_tag: "Style",
};

/** Per-field confidence from the item's tag_confidence JSON, or null. */
export function fieldConfidence(item: WardrobeItem, field: CriticalField): number | null {
  const v = item.tag_confidence?.[field];
  return typeof v === "number" ? v : null;
}

export function fieldValueMissing(item: WardrobeItem, field: CriticalField): boolean {
  const v = item[field];
  return v === null || v === undefined || v === "";
}

/** A field needs a quick check when it is NOT user-confirmed (confidence 1) and
 *  either its value is missing or its confidence is explicitly low. */
export function needsCheck(item: WardrobeItem, field: CriticalField): boolean {
  const conf = fieldConfidence(item, field);
  if (conf === 1) return false; // already confirmed → omit
  if (fieldValueMissing(item, field)) return true;
  return conf !== null && conf < TAG_CHECK_LOW_CONFIDENCE;
}

/** Ordered (impact desc), ≤3 critical fields that need a check. Deterministic. */
export function criticalFieldsToCheck(item: WardrobeItem): CriticalField[] {
  return CRITICAL_FIELD_ORDER.filter((f) => needsCheck(item, f));
}

export function validateFieldValue(field: CriticalField, value: unknown): boolean {
  if (field === "category") return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
  if (field === "formality") return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
  return typeof value === "string" && CULTURAL_OPTIONS.some((o) => o.value === value);
}

/** Merge: set ONLY the edited field's confidence to 1, preserve every other key. */
export function mergeTagConfidence(
  existing: Record<string, number> | null | undefined,
  field: CriticalField,
  confidence = 1,
): Record<string, number> {
  return { ...(existing ?? {}), [field]: confidence };
}

// ---- Orchestrator (dependency-injected → unit-testable) ------------------

export interface TagUpdateResult {
  error: { message: string } | null;
  /** The returned owned row AFTER the update (from a narrow `.select()`), or null
   *  when zero rows were affected (RLS cross-owner denial / not-found). */
  row: Record<string, unknown> | null;
}
export type TagUpdater = (patch: Record<string, unknown>) => Promise<TagUpdateResult>;
export type Tracker = (event: string, props: Record<string, string | number | boolean>) => void;

export interface TagCorrectionOutcome {
  ok: boolean;
  error?: string;
  patch?: Record<string, unknown>;
  /** The verified server row on success — the UI replaces local state from this. */
  row?: Record<string, unknown>;
}

/**
 * Persist ONE critical-field correction through the injected updater, emitting
 * `tag_edited` exactly once AFTER a confirmed persistence. Invalid values and
 * failed/cross-owner (0-row) updates persist nothing and emit no telemetry.
 */
export async function applyTagCorrection(args: {
  item: WardrobeItem;
  field: CriticalField;
  value: string | number;
  update: TagUpdater;
  track: Tracker;
  source?: string;
}): Promise<TagCorrectionOutcome> {
  const { item, field, value, update, track, source = "tagcheck" } = args;

  if (!validateFieldValue(field, value)) {
    return { ok: false, error: "invalid_value" }; // no update, no telemetry
  }

  const patch: Record<string, unknown> = {
    [field]: value,
    tag_confidence: mergeTagConfidence(item.tag_confidence, field),
    user_corrected_tags: true,
  };

  let result: TagUpdateResult;
  try {
    result = await update(patch);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "update_failed" };
  }

  // Prove persistence from the RETURNED OWNED ROW — "no Supabase error" alone
  // is not success (cross-owner writes come back as zero rows with no error).
  if (result.error) return { ok: false, error: result.error.message };
  const row = result.row;
  if (!row) return { ok: false, error: "not_updated" }; // zero rows → auth/not-found failure
  if (row[field] !== value) return { ok: false, error: "persist_mismatch" };
  const conf = (row.tag_confidence as Record<string, number> | null | undefined)?.[field];
  if (conf !== 1) return { ok: false, error: "confidence_mismatch" };

  track("tag_edited", { field, source }); // exactly once, after PROVEN persistence
  return { ok: true, patch, row };
}

/** True only when every field presented for this item has been confirmed/corrected. */
export function shouldEmitTagCheckComplete(
  presented: ReadonlyArray<CriticalField>,
  confirmed: ReadonlySet<CriticalField>,
): boolean {
  return presented.length > 0 && presented.every((f) => confirmed.has(f));
}
