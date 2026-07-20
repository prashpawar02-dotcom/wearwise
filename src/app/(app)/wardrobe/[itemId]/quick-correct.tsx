"use client";

// =====================================================================
// WearWise — Quick tag correction / check queue (Phase 5, Module D)
// A compact per-item surface for the three recommendation-critical fields.
// Reuses the EXISTING mutation path (browser Supabase update().eq(id).select(),
// owner-isolated by RLS) via the tested `applyTagCorrection` orchestrator.
// Three-tap contract: board → item (tap 1) → field value (tap 2 persists).
//
// Integration guarantees:
//  • success requires a returned OWNED row proving the value + confidence 1
//    (applyTagCorrection verifies; "no error" alone is not success);
//  • one save at a time (all controls disabled while saving) → no stale
//    overwrite of another correction in the same session;
//  • local state is REPLACED from the returned server row, and the queue is
//    recomputed from it (confirmed fields disappear);
//  • does NOT clear ai_tag_status / photo_quality_flag — unrelated review
//    status is left to the existing "Looks good"/editor flows.
// =====================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { CATEGORIES, type WardrobeItem } from "@/lib/types";
import {
  applyTagCorrection,
  criticalFieldsToCheck,
  shouldEmitTagCheckComplete,
  validateFieldValue,
  FIELD_LABEL,
  FORMALITY_OPTIONS,
  CULTURAL_OPTIONS,
  type CriticalField,
  type TagUpdater,
} from "@/lib/wardrobe/tag-correction";
import { Check } from "lucide-react";

interface Option { value: string | number; label: string }

function optionsFor(field: CriticalField): Option[] {
  if (field === "category") return CATEGORIES.map((c) => ({ value: c, label: c }));
  if (field === "formality") return FORMALITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  return CULTURAL_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
}

export function QuickCorrect({ item, onChange }: { item: WardrobeItem; onChange?: (next: WardrobeItem) => void }) {
  const router = useRouter();
  // The set presented when the queue first opened — drives tagcheck_completed.
  // Captured once at mount (same lifecycle as `current` below); it must NOT shrink
  // as fields are confirmed, otherwise completion could never be detected.
  const [presented] = useState(() => criticalFieldsToCheck(item));
  const [current, setCurrent] = useState<WardrobeItem>(item);
  const [busy, setBusy] = useState<CriticalField | null>(null);
  const [errors, setErrors] = useState<Partial<Record<CriticalField, string>>>({});
  const [completedEmitted, setCompletedEmitted] = useState(false);

  // Recompute the queue from the latest (server-replaced) state — confirmed
  // fields drop out immediately.
  const displayed = criticalFieldsToCheck(current);
  if (presented.length === 0 || displayed.length === 0) return null;

  async function saveField(field: CriticalField, value: string | number) {
    if (busy !== null) return; // one save at a time — no overlapping/stale writes
    setBusy(field);
    setErrors((e) => ({ ...e, [field]: undefined }));

    const supabase = createClient();
    const update: TagUpdater = async (patch) => {
      const { data, error } = await supabase
        .from("wardrobe_items")
        .update(patch)
        .eq("id", current.id)
        .select(`id, ${field}, tag_confidence`)
        .maybeSingle();
      return { error: error ? { message: error.message } : null, row: (data as Record<string, unknown>) ?? null };
    };

    const outcome = await applyTagCorrection({ item: current, field, value, update, track });
    if (!outcome.ok || !outcome.row) {
      // Keep the selection available, show a clear error, never close silently.
      setErrors((e) => ({ ...e, [field]: "Couldn't save — tap to try again." }));
      setBusy(null);
      return;
    }

    // Replace local state from the returned server row (source of truth).
    const row = outcome.row;
    const next = {
      ...current,
      [field]: row[field],
      tag_confidence: (row.tag_confidence as Record<string, number>) ?? current.tag_confidence,
      user_corrected_tags: true,
    } as WardrobeItem;
    setCurrent(next);
    onChange?.(next);
    setBusy(null);

    // tagcheck_completed: once, only when every PRESENTED field is confirmed
    // (recomputed from server-truth state), never on skip/close.
    const stillNeeding = criticalFieldsToCheck(next);
    const confirmed = new Set(presented.filter((f) => !stillNeeding.includes(f)));
    if (!completedEmitted && shouldEmitTagCheckComplete(presented, confirmed)) {
      track("tagcheck_completed", { fields: presented.length, source: "tagcheck" });
      setCompletedEmitted(true);
    }
    router.refresh();
  }

  return (
    <div className="rounded-ww-md border border-hairline bg-bone p-3">
      <p className="ww-eyebrow text-plum">Quick check</p>
      <p className="mt-0.5 text-[11px] text-mist">A tap keeps your suggestions sharp. Optional — skip anytime.</p>

      <div className="mt-3 space-y-3">
        {displayed.map((field) => {
          const cur = current[field];
          const curValid = cur != null && cur !== "" && validateFieldValue(field, cur as string | number);
          return (
            <div key={field}>
              <span className="text-xs font-medium text-charcoal">{FIELD_LABEL[field]}</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {curValid && (
                  <button
                    type="button"
                    onClick={() => saveField(field, cur as string | number)}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 rounded-full border border-sage/50 bg-sage/10 px-3 py-1 text-[11px] font-medium text-[#5d7351] disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" /> Looks right
                  </button>
                )}
                {optionsFor(field).map((o) => {
                  const active = String(cur) === String(o.value);
                  return (
                    <button
                      key={String(o.value)}
                      type="button"
                      onClick={() => saveField(field, o.value)}
                      disabled={busy !== null}
                      aria-pressed={active}
                      className={cn(
                        "min-h-[32px] rounded-full border px-3 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
                        active ? "border-plum bg-plum/10 text-plum" : "border-hairline text-graphite hover:border-hairline-strong",
                      )}
                    >
                      {busy === field ? "…" : o.label}
                    </button>
                  );
                })}
              </div>
              {errors[field] && <p className="mt-1 text-[11px] text-destructive">{errors[field]}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
