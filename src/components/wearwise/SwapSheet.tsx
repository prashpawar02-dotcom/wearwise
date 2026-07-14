"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * SwapSheet — SLOT-FIRST, single-item swap ONLY (Phase 3 blocker fix).
 *
 * Flow: tap "Swap one thing" -> this sheet opens on a slot picker
 * ("What do you want to swap?") showing only the slots present in today's
 * outfit. Nothing is fetched until a slot is chosen. Choosing a slot fetches
 * replacements for THAT slot only (every other item stays locked); applying one
 * changes exactly one item. Result row = Keep it / Try another / Put back.
 *
 * This sheet NEVER changes the whole outfit — "Another option" is a completely
 * separate button + handler on the card and does not open this sheet.
 */
export interface SwapSheetItem {
  id: string;
  label: string;
  image: string | null;
  category?: string | null;
  /** Canonical slot label (Top/Bottom/Shoes/Layer/Accessory); falls back to label. */
  slot?: string | null;
}
export interface CapView {
  swapRemaining: number | null;   // null = unlimited (exempt)
  optionRemaining: number | null;
  sessionExempt: boolean;
}

type Candidate = { id: string; label: string; sub: string | null; image: string | null; reason: string };
type View = "slots" | "candidates" | "result" | "cap" | "feedback" | "ack";

const REASONS: [string, string][] = [
  ["too_formal", "Too formal"],
  ["not_my_style", "Not my style"],
  ["uncomfortable", "Uncomfortable"],
  ["weather", "Weather"],
  ["repeat", "Repeat"],
];

export function SwapSheet({
  open,
  onClose,
  recommendationId,
  items,
  cap: initialCap,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  recommendationId: string;
  items: SwapSheetItem[];
  cap: CapView | null;
  /** Called after an applied change so the parent can refresh the outfit. */
  onChanged: () => void;
}) {
  const [view, setView] = useState<View>("slots");
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState<CapView | null>(initialCap);
  const [selected, setSelected] = useState<SwapSheetItem | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [slotName, setSlotName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [why, setWhy] = useState<string[]>([]);
  const [capMsg, setCapMsg] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [hasUndo, setHasUndo] = useState(false);

  // Fresh slot picker each time the sheet opens. NEVER auto-fetches candidates
  // and NEVER triggers another-option — this sheet is single-item swap only.
  // No telemetry here: the canonical "opened" event (swap_opened) is fired
  // once, at intent time, by DailyDropCard's openSwap() before this sheet
  // even mounts. This effect used to also fire its own "opened" event,
  // duplicating that same user gesture — retired (see CHANGELOG.md, Phase
  // 4B telemetry-dedup fix, for the old event name).
  useEffect(() => {
    if (!open) return;
    setView("slots"); setBusy(false); setCap(initialCap); setSelected(null);
    setCandidates([]); setSlotName(null); setMessage(null); setReason(null);
    setWhy([]); setCapMsg(null); setAck(null); setHasUndo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function applyResult(data: { reason?: string; whyThisWorks?: string[]; cap?: CapView }) {
    setReason(data.reason ?? null);
    setWhy(data.whyThisWorks ?? []);
    if (data.cap) setCap(data.cap);
    setHasUndo(true);
    setView("result");
    onChanged();
  }

  function handleCap(data: { message?: string; cap?: CapView }) {
    if (data.cap) setCap(data.cap);
    setCapMsg(data.message ?? null);
    track("cap_hit_swap", {});
    setView("cap");
  }

  // Step 1 -> 2: a slot was chosen; fetch replacements for THAT slot only.
  // Canonical event: swap_requested, carrying the selected slot — represents
  // both "the user picked a slot" and "the candidate request started" as one
  // moment. A separate slot-selection event used to fire alongside this one;
  // it was retired as a duplicate (see CHANGELOG.md, Phase 4B telemetry-dedup fix).
  async function loadCandidates(item: SwapSheetItem) {
    setBusy(true); setSelected(item); setMessage(null);
    track("swap_requested", { slot: item.slot ?? "item" });
    try {
      const res = await fetch(
        `/api/daily-drop/swap-candidates?recommendationId=${encodeURIComponent(recommendationId)}&replaceItemId=${encodeURIComponent(item.id)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (data.cap) setCap(data.cap);
      setSlotName(data.slotLabel ?? item.slot ?? null);
      if (data.status === "ok") { setCandidates(data.candidates ?? []); setMessage(null); }
      else if (data.status === "stale") { setMessage(null); onChanged(); onClose(); return; }
      else { setCandidates([]); setMessage(data.message ?? "No clean replacement for this piece right now."); }
      setView("candidates");
    } catch {
      setCandidates([]);
      setMessage("We couldn't load options just now. Please try again.");
      setView("candidates");
    } finally { setBusy(false); }
  }

  async function applySwap(candidateId: string) {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch("/api/daily-drop/swap", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId, replaceItemId: selected.id, replacementItemId: candidateId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === "updated") applyResult(data);
      else if (data.status === "cap_reached") handleCap(data);
      else if (data.status === "stale") {
        // The outfit changed under us (a piece went to the wash). Refresh + close.
        setMessage(data.message ?? "That outfit just changed — refreshing.");
        onChanged(); onClose();
      } else setMessage("We couldn't swap that piece. Please try again.");
    } catch {
      setMessage("We couldn't swap that piece. Please try again.");
    } finally { setBusy(false); }
  }

  async function putBack() {
    setBusy(true);
    try {
      await fetch("/api/daily-drop/put-back", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId }),
      });
      track("swap_reverted", {});
      setHasUndo(false);
      onChanged();
      setView("slots");
    } finally { setBusy(false); }
  }

  async function submitFeedback(r: string | null) {
    setBusy(true);
    try {
      const res = await fetch("/api/daily-drop/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId, reason: r }),
      });
      const data = await res.json().catch(() => ({}));
      track("feedback_negative", { reason: r ?? "unspecified" });
      setAck(data.ack ?? "Noted — tomorrow gets sharper.");
      setView("ack");
    } finally { setBusy(false); }
  }

  const lockedContext = selected
    ? items.filter((i) => i.id !== selected.id).map((i) => i.label)
    : [];

  const title =
    view === "candidates" ? `Swap the ${(slotName ?? "piece").toLowerCase()}`
    : view === "result" ? "Here's the change"
    : view === "cap" ? "You're at today's free limit"
    : view === "feedback" || view === "ack" ? "Tell me what's off"
    : "What do you want to swap?";

  const subtitle =
    view === "slots" ? "The rest of your outfit will stay the same." : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
      {/* ---------------- STEP 1: SLOT PICKER (only) ---------------- */}
      {view === "slots" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                disabled={busy}
                onClick={() => void loadCandidates(it)}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-bone px-3.5 py-2 text-[13px] font-medium text-charcoal transition-colors hover:border-hairline-strong disabled:opacity-50"
              >
                <Icon.Shuffle className="h-3.5 w-3.5 text-plum" />
                {it.slot ?? it.label}
              </button>
            ))}
          </div>

          {cap && !cap.sessionExempt && (
            <p className="text-center text-[11px] text-mist">
              {cap.swapRemaining ?? 0} swap{cap.swapRemaining === 1 ? "" : "s"} left today
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => setView("feedback")}
            className="w-full py-1 text-center text-xs text-graphite transition-colors hover:text-charcoal disabled:opacity-50"
          >
            Not feeling today&apos;s pick?
          </button>
        </div>
      )}

      {/* ---------------- STEP 2: CANDIDATES FOR THE CHOSEN SLOT ---------------- */}
      {view === "candidates" && (
        <div>
          <BackRow onClick={() => setView("slots")} />
          {lockedContext.length > 0 && (
            <p className="mt-2 text-xs text-graphite">
              Keeping {lockedContext.join(", ")} exactly as they are.
            </p>
          )}
          {busy ? (
            <p className="mt-3 text-sm text-graphite">Finding the best matches…</p>
          ) : candidates.length > 0 ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void applySwap(c.id)}
                  className="overflow-hidden rounded-ww-sm border border-hairline bg-stone/50 text-left transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  <div className="aspect-square bg-stone/60">
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image} alt="" className="h-full w-full object-contain p-1" />
                    ) : (
                      <div className="grid h-full place-items-center text-mist"><Icon.Hanger className="h-5 w-5" /></div>
                    )}
                  </div>
                  <p className="truncate px-1.5 pt-1 text-[11px] text-charcoal">{c.label}</p>
                  <p className="line-clamp-2 px-1.5 pb-1 text-[10px] leading-tight text-graphite">{c.reason}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-ww-md border border-hairline bg-bone p-3">
              <p className="text-sm leading-snug text-charcoal">{message ?? "No clean replacement for this piece today."}</p>
            </div>
          )}
        </div>
      )}

      {/* ---------------- STEP 3: RESULT (one slot changed) ---------------- */}
      {view === "result" && (
        <div>
          {reason && (
            <div className="rounded-ww-md border border-lavender/40 bg-lavender/[0.12] p-3">
              <p className="ww-eyebrow text-plum">Why this works</p>
              <p className="mt-0.5 text-sm leading-snug text-charcoal">{reason}</p>
              {why.length > 1 && (
                <ul className="mt-1.5 space-y-1">
                  {why.slice(1, 3).map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-graphite">
                      <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-plum/60" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => { onChanged(); onClose(); }}>Keep it</Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setView("candidates")}>Try another</Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy || !hasUndo} onClick={() => void putBack()}>Put back</Button>
          </div>
        </div>
      )}

      {/* ---------------- CAP ---------------- */}
      {view === "cap" && (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-charcoal">{capMsg}</p>
          <div>
            <p className="ww-eyebrow mb-2 text-plum">Tell me what&apos;s off</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map(([value, label]) => (
                <FeedbackChip key={value} label={label} disabled={busy} onClick={() => void submitFeedback(value)} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            {hasUndo && <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void putBack()}>Put back</Button>}
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onClose}>Close</Button>
          </div>
        </div>
      )}

      {/* ---------------- FEEDBACK ---------------- */}
      {view === "feedback" && (
        <div className="space-y-3">
          <BackRow onClick={() => setView("slots")} />
          <p className="text-sm text-graphite">A quick tap helps tomorrow&apos;s pick get sharper. Optional.</p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map(([value, label]) => (
              <FeedbackChip key={value} label={label} disabled={busy} onClick={() => void submitFeedback(value)} />
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitFeedback(null)}
            className="w-full py-1 text-center text-xs text-graphite transition-colors hover:text-charcoal disabled:opacity-50"
          >
            Just not for me
          </button>
        </div>
      )}

      {/* ---------------- ACK ---------------- */}
      {view === "ack" && (
        <div className="space-y-4 py-2 text-center">
          <p className="text-sm text-charcoal">{ack}</p>
          <Button type="button" size="full" variant="secondary" onClick={onClose}>Done</Button>
        </div>
      )}
    </Sheet>
  );
}

function BackRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs text-graphite transition-colors hover:text-charcoal"
    >
      <Icon.ArrowLeft className="h-3 w-3" /> Back
    </button>
  );
}

function FeedbackChip({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border border-hairline bg-bone px-3 py-1.5 text-[13px] font-medium text-charcoal transition-colors",
        "hover:border-hairline-strong disabled:opacity-50",
      )}
    >
      {label}
    </button>
  );
}
