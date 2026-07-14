"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { washDisposition, type Disposition } from "@/lib/laundry";

export interface PostWearItem {
  id: string;
  label: string;
  image?: string | null;
  /** Optional category text to sharpen the smart default. */
  category?: string | null;
}

/**
 * Post-wear laundry sheet (handbook §5 Phase 2; Phase 4C step 2). After a
 * wear is confirmed (see WearConfirmSheet + /api/daily-drop/wear), quietly
 * ask where each piece goes tonight — pre-answered with smart defaults so
 * one tap (Done) completes it. Multi-item outfits get per-item chips;
 * single-item outfits collapse to the same two choices. "Ask me less" lets
 * the user turn the whole prompt off — it reuses the existing
 * postwear_sheet_enabled / postwear_prompt_dismissals / ASK_ME_LESS_THRESHOLD
 * contract (see /api/wardrobe/laundry's ask_me_less action); there is no new
 * eligibility or learning model here. Copy passes the flatmate test: asked
 * once, no chore-app nagging, no guilt.
 *
 * The parent owns persistence (via /api/wardrobe/laundry) and the
 * completed/dismissed/failed telemetry; this component owns the interaction
 * and the "opened" + per-choice + "ask me less" events.
 *
 * Phase 4C follow-up (laundry failure visibility): wear confirmation is a
 * separate, already-committed transaction (migration 0023) by the time this
 * sheet is open — laundry persistence failing here must NEVER look like
 * success. The parent keeps this sheet OPEN on failure (no unconditional
 * close-in-finally) and passes `error` so the user sees a clear message and
 * a Retry — the SAME Done/Ask-me-less buttons double as Retry because the
 * user's chosen `choice` state lives in THIS component and survives a
 * failed persist attempt untouched (nothing here unmounts or resets it).
 */
export function PostWearSheet({
  open,
  items,
  onDone,
  onDismiss,
  onAskMeLess,
  saving = false,
  error = null,
}: {
  open: boolean;
  items: PostWearItem[];
  onDone: (dispositions: Record<string, Disposition>) => void;
  onDismiss: () => void;
  onAskMeLess: (dispositions: Record<string, Disposition>) => void;
  saving?: boolean;
  /** Set by the parent when the last persist attempt failed. Rendered as a
   *  visible, non-blocking banner; the sheet stays open and the user's
   *  choices are untouched so Done/Ask me less can be tapped again as Retry. */
  error?: string | null;
}) {
  // Smart defaults, recomputed when the item set changes.
  const defaults = useMemo(() => {
    const m: Record<string, Disposition> = {};
    for (const it of items) {
      m[it.id] = washDisposition({
        category: it.category ?? null,
        sub_category: null,
        user_facing_name: it.label,
      });
    }
    return m;
  }, [items]);

  const [choice, setChoice] = useState<Record<string, Disposition>>(defaults);
  useEffect(() => setChoice(defaults), [defaults]);

  // One "opened" event per open, with counts only (no item identity). Also
  // fires ask_me_less_shown alongside it: the "Ask me less" affordance is
  // always visible whenever this sheet is (its eligibility gate is that the
  // sheet itself is still enabled — postwearEnabled upstream — there is no
  // separate per-tap eligibility to compute).
  useEffect(() => {
    if (!open) return;
    const washSuggested = Object.values(defaults).filter((d) => d === "wash").length;
    track("postwear_sheet_opened", { item_count: items.length, wash_suggested_count: washSuggested });
    track("ask_me_less_shown", { item_count: items.length });
  }, [open, items.length, defaults]);

  if (!open) return null;

  const setAll = (d: Disposition) => {
    track("laundry_status_selected", { to: d, bulk: true, item_count: items.length });
    setChoice(Object.fromEntries(items.map((it) => [it.id, d])));
  };
  const setOne = (id: string, d: Disposition) => {
    track("laundry_status_selected", { to: d, bulk: false });
    setChoice((c) => ({ ...c, [id]: d }));
  };
  const washCount = Object.values(choice).filter((d) => d === "wash").length;
  const doneLabel = saving ? "Saving…" : error ? "Try again" : washCount === 0 ? "All back in the wardrobe" : "Done";

  return (
    <Sheet
      open={open}
      onClose={onDismiss}
      title="Where does this go tonight?"
      subtitle="Set it once and today's wash stays accurate. You can always change it later."
      footer={
        <div className="space-y-2 pb-1">
          {error && (
            <p role="alert" className="rounded-ww-sm border border-terracotta/30 bg-terracotta/[0.08] px-3 py-2 text-xs leading-snug text-terracotta">
              {error}
            </p>
          )}
          <Button size="full" disabled={saving} onClick={() => onDone(choice)}>
            {doneLabel}
          </Button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              track("ask_me_less_enabled", { source: "postwear_sheet" });
              onAskMeLess(choice);
            }}
            className="w-full py-1.5 text-center text-xs text-graphite transition-colors hover:text-charcoal disabled:opacity-50"
          >
            Ask me less
          </button>
          {error && (
            <button
              type="button"
              onClick={onDismiss}
              className="w-full py-1 text-center text-xs text-mist transition-colors hover:text-graphite"
            >
              Skip for now
            </button>
          )}
        </div>
      }
    >
      {items.length > 1 && (
        <div className="mb-3 flex gap-2">
          <BulkButton label="All to wardrobe" icon={<Icon.Hanger className="h-3.5 w-3.5" />} onClick={() => setAll("wardrobe")} />
          <BulkButton label="All to wash" icon={<Icon.Droplet className="h-3.5 w-3.5" />} onClick={() => setAll("wash")} />
        </div>
      )}

      <ul className="space-y-2.5">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-center gap-3 rounded-ww-md border border-hairline bg-bone p-2.5"
          >
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
            <div className="flex shrink-0 gap-1.5" role="group" aria-label={`Where does ${it.label} go?`}>
              <DispChip
                active={choice[it.id] === "wardrobe"}
                onClick={() => setOne(it.id, "wardrobe")}
                icon={<Icon.Hanger className="h-3.5 w-3.5" />}
                label="Wardrobe"
              />
              <DispChip
                active={choice[it.id] === "wash"}
                onClick={() => setOne(it.id, "wash")}
                icon={<Icon.Droplet className="h-3.5 w-3.5" />}
                label="Wash"
              />
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function BulkButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-hairline bg-bone px-3 py-1.5 text-xs font-medium text-graphite transition-colors hover:border-hairline-strong hover:text-charcoal"
    >
      {icon}
      {label}
    </button>
  );
}

function DispChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
        active
          ? label === "Wash"
            ? "border-cobalt/30 bg-cobalt/[0.08] text-[#2c3a59]"
            : "border-plum bg-plum text-bone"
          : "border-hairline bg-bone text-graphite hover:border-hairline-strong"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
