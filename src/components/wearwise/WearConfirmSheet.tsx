"use client";

import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";

export interface WearConfirmItem {
  id: string;
  label: string;
  image?: string | null;
}

export type WearConfirmState = "idle" | "submitting" | "error" | "stale" | "already";

/**
 * Step 1 of the Wore It flow (Phase 4C) — a lightweight confirmation sheet
 * that opens the instant "Wear this" is tapped, BEFORE any write happens.
 * Shows the exact owned items in today's outfit (the same list already
 * rendered on the Today card — never a fabricated or re-derived set) and
 * asks for one tap to confirm. Every write is server-validated by
 * POST /api/daily-drop/wear (see that route for the ownership/staleness/
 * idempotency contract); this component owns no persistence itself — it
 * only renders whichever of the six required states the parent hands it.
 *
 * On success the parent swaps this sheet for the existing PostWearSheet
 * (laundry disposition, Phase 2, unchanged) — that is a STEP transition
 * within one flow, not a second "open", so PostWearSheet's own
 * postwear_sheet_opened event still fires exactly once per Wore It flow.
 */
export function WearConfirmSheet({
  open,
  items,
  state,
  onPrimary,
  onDismiss,
}: {
  open: boolean;
  items: WearConfirmItem[];
  state: WearConfirmState;
  /** The single primary-button action for the current state — the parent
   *  decides what it means (confirm / retry / refresh / continue). */
  onPrimary: () => void;
  onDismiss: () => void;
}) {
  if (!open) return null;

  const submitting = state === "submitting";
  const subtitle =
    state === "error"
      ? "That didn't go through. Please try again."
      : state === "stale"
        ? "This outfit just changed — refresh to see today's picks."
        : state === "already"
          ? "Already marked worn today."
          : "Confirm you wore this today.";

  const primaryLabel =
    state === "submitting"
      ? "Confirming…"
      : state === "error"
        ? "Try again"
        : state === "stale"
          ? "Refresh"
          : state === "already"
            ? "Continue"
            : "Confirm worn";

  return (
    <Sheet
      open={open}
      onClose={onDismiss}
      title="Today's look"
      subtitle={subtitle}
      dismissable={!submitting}
      footer={
        <div className="space-y-2 pb-1">
          <Button size="full" disabled={submitting} onClick={onPrimary}>
            {primaryLabel}
          </Button>
        </div>
      }
    >
      <ul className="space-y-2.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 rounded-ww-md border border-hairline bg-bone p-2.5">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-ww-sm border border-hairline bg-stone/60">
              {it.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-mist">
                  <Icon.Hanger className="h-5 w-5" />
                </div>
              )}
            </div>
            <span className="min-w-0 flex-1 truncate text-sm text-charcoal">{it.label}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
