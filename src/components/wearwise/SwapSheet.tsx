"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * SwapSheet — the Phase 3 trust surface (handbook §5 P3).
 * Three separated paths over the outfit: Swap one thing (lock-and-replace
 * candidates -> [Keep it] [Try another] [Put back]), Change the mood (mood
 * chips), and New mood (full re-theme). Server-validated + cap-gated (3 swaps/
 * day, 2 options/drop; first 3 sessions exempt). Put back restores the exact
 * pre-swap outfit. Cap + no-candidate states are specific; a "Not for me" path
 * records feedback (always free) with an immediate ack.
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
type View = "menu" | "candidates" | "result" | "cap" | "feedback" | "ack";
type Kind = "swap" | "mood" | "option";

const MOODS: [string, string][] = [
  ["more_formal", "More formal"],
  ["more_casual", "More casual"],
  ["more_comfortable", "More comfortable"],
  ["more_modest", "More modest"],
  ["weather_safer", "Weather-safer"],
];
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
  initialAction = null,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  recommendationId: string;
  items: SwapSheetItem[];
  cap: CapView | null;
  initialAction?: "option" | null;
  onChanged: () => void;
}) {
  const [view, setView] = useState<View>("menu");
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
  const [lastKind, setLastKind] = useState<Kind>("swap");
  const [, setLastMood] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setView("menu"); setBusy(false); setCap(initialCap); setSelected(null);
    setCandidates([]); setSlotName(null); setMessage(null); setReason(null);
    setWhy([]); setCapMsg(null); setAck(null); setHasUndo(false);
    if (initialAction === "option") void runOption();
    else track("swap_sheet_opened", { item_count: items.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function applyResult(data: { reason?: string; whyThisWorks?: string[]; cap?: CapView }, kind: Kind) {
    setReason(data.reason ?? null);
    setWhy(data.whyThisWorks ?? []);
    if (data.cap) setCap(data.cap);
    setHasUndo(true);
    setLastKind(kind);
    setView("result");
    onChanged();
  }

  function handleCap(kind: "swap" | "option", data: { message?: string; cap?: CapView }) {
    if (data.cap) setCap(data.cap);
    setCapMsg(data.message ?? null);
    track(kind === "swap" ? "cap_hit_swap" : "cap_hit_option", {});
    setView("cap");
  }

  async function loadCandidates(item: SwapSheetItem) {
    setBusy(true); setSelected(item); setMessage(null);
    track("swap_requested", {});
    try {
      const res = await fetch(
        `/api/daily-drop/swap-candidates?recommendationId=${encodeURIComponent(recommendationId)}&replaceItemId=${encodeURIComponent(item.id)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (data.cap) setCap(data.cap);
      setSlotName(data.slotLabel ?? null);
      if (data.status === "ok") { setCandidates(data.candidates ?? []); setMessage(null); }
      else { setCandidates([]); setMessage(data.message ?? "No clean replacement for this piece right now."); }
      setView("candidates");
    } catch {
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
      if (data.status === "updated") applyResult(data, "swap");
      else if (data.status === "cap_reached") handleCap("swap", data);
      else if (data.status === "stale") { setMessage(data.message ?? "That option just changed — here are fresh matches."); if (selected) void loadCandidates(selected); }
      else setMessage("We couldn't swap that piece. Please try again.");
    } catch {
      setMessage("We couldn't swap that piece. Please try again.");
    } finally { setBusy(false); }
  }

  async function applyMood(mood: string) {
    setBusy(true); setLastMood(mood);
    try {
      const res = await fetch("/api/daily-drop/mood-swap", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId, mood }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === "updated") applyResult(data, "mood");
      else if (data.status === "cap_reached") handleCap("swap", data);
      else { setMessage(data.message ?? "Nothing clean changes that without breaking the look."); setSlotName(null); setView("candidates"); }
    } catch {
      setMessage("We couldn't adjust the mood just now. Please try again.");
      setView("candidates");
    } finally { setBusy(false); }
  }

  async function runOption() {
    setBusy(true);
    track("another_option", {});
    try {
      const res = await fetch("/api/daily-drop/another-option", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === "updated") applyResult(data, "option");
      else if (data.status === "cap_reached") handleCap("option", data);
      else if (data.status === "not_enough_items") { setMessage("Add a few more available clothes to create another strong option."); setSlotName(null); setView("candidates"); }
      else setMessage("We couldn't create another option right now. Please try again.");
    } catch {
      setMessage("We couldn't create another option right now. Please try again.");
    } finally { setBusy(false); }
  }

  async function putBack() {
    setBusy(true);
    try {
      await fetch("/api/daily-drop/put-back", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId }),
      });
      setHasUndo(false);
      onChanged();
      setView("menu");
    } finally { setBusy(false); }
  }

  function tryAnother() {
    if (lastKind === "swap") setView("candidates");
    else void runOption();
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

  const title =
    view === "candidates" ? (slotName ? `Swap the ${slotName.toLowerCase()}` : "Swap one thing")
    : view === "result" ? "Here's the change"
    : view === "cap" ? "You're at today's free limit"
    : view === "feedback" || view === "ack" ? "Tell me what's off"
    : "Adjust today's outfit";

  const subtitle = view === "menu" ? "Keep what you like — change only what you ask." : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
      {view === "menu" && (
        <div className="space-y-4">
          <section>
            <p className="ww-eyebrow mb-2 text-plum">Swap one thing</p>
            <div className="flex flex-wrap gap-2">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  disabled={busy}
                  onClick={() => { track("swap_slot_selected", { slot: it.slot ?? "item" }); void loadCandidates(it); }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-bone px-3 py-1.5 text-[13px] font-medium text-charcoal transition-colors hover:border-hairline-strong disabled:opacity-50"
                >
                  <Icon.Shuffle className="h-3.5 w-3.5 text-plum" />
                  {it.slot ?? it.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="ww-eyebrow mb-2 text-plum">Change the mood</p>
            <div className="flex flex-wrap gap-2">
              {MOODS.map(([value, label]) => (
                <MoodChip key={value} label={label} disabled={busy} onClick={() => applyMood(value)} />
              ))}
            </div>
          </section>

          <section className="rounded-ww-md border border-plum/25 bg-plum/[0.05] p-3">
            <p className="text-sm font-medium text-charcoal">New mood</p>
            <p className="mt-0.5 text-xs text-graphite">Restyle the whole look from scratch.</p>
            <Button size="full" variant="secondary" className="mt-2.5" disabled={busy} onClick={() => runOption()}>
              <Icon.Sparkle className="h-3.5 w-3.5" /> Show a fresh look
            </Button>
          </section>

          {cap && !cap.sessionExempt && (
            <p className="text-center text-[11px] text-mist">
              {cap.swapRemaining ?? 0} swap{cap.swapRemaining === 1 ? "" : "s"} · {cap.optionRemaining ?? 0} option{cap.optionRemaining === 1 ? "" : "s"} left today
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => setView("feedback")}
            className="w-full py-1 text-center text-xs text-graphite transition-colors hover:text-charcoal disabled:opacity-50"
          >
            Not for me
          </button>
        </div>
      )}

      {view === "candidates" && (
        <div>
          <BackRow onClick={() => setView("menu")} />
          {busy ? (
            <p className="mt-3 text-sm text-graphite">Finding the best matches…</p>
          ) : candidates.length > 0 ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => applySwap(c.id)}
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
            <Button size="sm" disabled={busy} onClick={() => { onChanged(); onClose(); }}>Keep it</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={tryAnother}>Try another</Button>
            <Button size="sm" variant="secondary" disabled={busy || !hasUndo} onClick={putBack}>Put back</Button>
          </div>
        </div>
      )}

      {view === "cap" && (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-charcoal">{capMsg}</p>
          <div>
            <p className="ww-eyebrow mb-2 text-plum">Tell me what&apos;s off</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map(([value, label]) => (
                <MoodChip key={value} label={label} disabled={busy} onClick={() => submitFeedback(value)} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            {hasUndo && <Button size="sm" variant="secondary" disabled={busy} onClick={putBack}>Put back</Button>}
            <Button size="sm" variant="secondary" disabled={busy} onClick={onClose}>Close</Button>
          </div>
        </div>
      )}

      {view === "feedback" && (
        <div className="space-y-3">
          <BackRow onClick={() => setView("menu")} />
          <p className="text-sm text-graphite">A quick tap helps tomorrow&apos;s pick get sharper. Optional.</p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map(([value, label]) => (
              <MoodChip key={value} label={label} disabled={busy} onClick={() => submitFeedback(value)} />
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => submitFeedback(null)}
            className="w-full py-1 text-center text-xs text-graphite transition-colors hover:text-charcoal disabled:opacity-50"
          >
            Just not for me
          </button>
        </div>
      )}

      {view === "ack" && (
        <div className="space-y-4 py-2 text-center">
          <p className="text-sm text-charcoal">{ack}</p>
          <Button size="full" variant="secondary" onClick={onClose}>Done</Button>
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

function MoodChip({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
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
