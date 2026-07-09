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
 * Post-wear laundry sheet (handbook §5 Phase 2). After "Wore It", quietly ask
 * where each piece goes tonight — pre-answered with smart defaults so one tap
 * (Done) completes it. Multi-item outfits get per-item chips; single-item
 * outfits collapse to the same two choices. "Ask me less" lets the user turn
 * the whole prompt off. Copy passes the flatmate test: asked once, no chore-app
 * nagging, no guilt.
 *
 * The parent owns persistence (via /api/wardrobe/laundry) and the
 * completed/dismissed telemetry; this component owns the interaction and the
 * "shown" + "ask_me_less" events.
 */
export function PostWearSheet({
  open,
  items,
  onDone,
  onDismiss,
  onAskMeLess,
  saving = false,
}: {
  open: boolean;
  items: PostWearItem[];
  onDone: (dispositions: Record<string, Disposition>) => void;
  onDismiss: () => void;
  onAskMeLess: (dispositions: Record<string, Disposition>) => void;
  saving?: boolean;
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

  // One "shown" event per open, with counts only (no item identity).
  useEffect(() => {
    if (!open) return;
    const washSuggested = Object.values(defaults).filter((d) => d === "wash").length;
    track("postwear_sheet_shown", { item_count: items.length, wash_suggested_count: washSuggested });
  }, [open, items.length, defaults]);

  if (!open) return null;

  const setAll = (d: Disposition) => setChoice(Object.fromEntries(items.map((it) => [it.id, d])));
  const washCount = Object.values(choice).filter((d) => d === "wash").length;

  return (
    <Sheet
      open={open}
      onClose={onDismiss}
      title="Where does this go tonight?"
      subtitle="Set it once and today's wash stays accurate. You can always change it later."
      footer={
        <div className="space-y-2 pb-1">
          <Button size="full" disabled={saving} onClick={() => onDone(choice)}>
            {saving ? "Saving…" : washCount === 0 ? "All back in the wardrobe" : "Done"}
          </Button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              track("ask_me_less_activated", { source: "postwear_sheet" });
              onAskMeLess(choice);
            }}
            className="w-full py-1.5 text-center text-xs text-graphite transition-colors hover:text-charcoal disabled:opacity-50"
          >
            Ask me less
          </button>
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
                onClick={() => setChoice((c) => ({ ...c, [it.id]: "wardrobe" }))}
                icon={<Icon.Hanger className="h-3.5 w-3.5" />}
                label="Wardrobe"
              />
              <DispChip
                active={choice[it.id] === "wash"}
                onClick={() => setChoice((c) => ({ ...c, [it.id]: "wash" }))}
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
