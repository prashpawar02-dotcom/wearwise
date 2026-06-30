"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WouldWear = "yes" | "maybe" | "no";

// Context-aware reasons for "Would you wear this?":
//   - Maybe = the look has potential but needs adjustment (refinement signal)
//   - No    = the user wouldn't wear it (rejection signal)
//   - Yes   = positive signal; no reason dropdown is shown
const REFINE_REASONS = [
  "Needs a different bottom",
  "Needs a different top",
  "Needs better color matching",
  "Too simple, needs styling",
  "Too bold for me",
  "Not sure about the fit",
  "Better for another occasion",
  "I need accessories/footwear suggestion",
  "I like the idea but would tweak it",
  "Other",
] as const;

const REJECT_REASONS = [
  "Not my style",
  "Bad color match",
  "Wrong occasion",
  "Too casual",
  "Too formal",
  "Missing item",
  "I would not wear this combo",
  "Looks unrealistic",
  "Other",
] as const;

/**
 * Lightweight, mobile-first feedback on an APPROVED outfit suggestion.
 * Writes to public.outfit_suggestion_feedback. RLS guarantees a user can only
 * insert feedback for their own suggestion, so no extra server route is needed.
 *
 * The reason dropdown is context-aware off "Would you wear this?": Maybe shows
 * refinement options, No shows rejection options, Yes shows none. The selected
 * option is stored in the existing `reason` field and the note in `note`.
 */
export function SuggestionFeedback({
  suggestionId,
  requestId,
}: {
  suggestionId: string;
  requestId: string;
}) {
  const [open, setOpen] = useState(false);
  const [useful, setUseful] = useState<boolean | null>(null);
  const [wouldWear, setWouldWear] = useState<WouldWear | "">("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState("");

  // Reason set depends on the "would wear" answer.
  const reasonOptions =
    wouldWear === "maybe" ? REFINE_REASONS : wouldWear === "no" ? REJECT_REASONS : null;
  const reasonLabel =
    wouldWear === "maybe" ? "What would make this wearable?" : "Why would you not wear this?";
  const showReason = reasonOptions !== null;
  const showNote = wouldWear !== "";
  const notePlaceholder =
    wouldWear === "yes"
      ? "What did you like about this look?"
      : wouldWear === "maybe"
        ? "What would you change?"
        : wouldWear === "no"
          ? "Tell us what felt wrong."
          : "Anything else? (optional)";

  const canSubmit = useful !== null || wouldWear !== "";

  // Switching the "would wear" answer changes which reasons apply, so reset.
  function pickWouldWear(v: WouldWear) {
    setWouldWear(v);
    setReason("");
  }

  async function submit() {
    if (!canSubmit) return;
    setStatus("saving");
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus("error"); setError("Please sign in again."); return; }

    const { error: insErr } = await supabase.from("outfit_suggestion_feedback").insert({
      suggestion_id: suggestionId,
      request_id: requestId,
      user_id: user.id,
      useful,
      would_wear: wouldWear || null,
      reason: showReason ? (reason || null) : null,
      note: note.trim() ? note.trim().slice(0, 300) : null,
    });
    if (insErr) { setStatus("error"); setError("Couldn't save your feedback. Please try again."); return; }
    setStatus("done");
  }

  if (status === "done") {
    return (
      <div className="rounded-ww-md border border-sage/30 bg-sage/10 p-3 text-sm text-foreground">
        Thanks — your feedback helps WearWise learn your taste.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-plum underline-offset-4 hover:underline"
      >
        Rate this look
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-ww-md border border-hairline bg-bone p-3">
      <Segment label="Was this useful?">
        <Choice active={useful === true} onClick={() => setUseful(true)}>Yes</Choice>
        <Choice active={useful === false} onClick={() => setUseful(false)}>No</Choice>
      </Segment>

      <Segment label="Would you wear this?">
        <Choice active={wouldWear === "yes"} onClick={() => pickWouldWear("yes")}>Yes</Choice>
        <Choice active={wouldWear === "maybe"} onClick={() => pickWouldWear("maybe")}>Maybe</Choice>
        <Choice active={wouldWear === "no"} onClick={() => pickWouldWear("no")}>No</Choice>
      </Segment>

      {showReason && reasonOptions && (
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-graphite" htmlFor={`reason-${suggestionId}`}>
            {reasonLabel}
          </label>
          <select
            id={`reason-${suggestionId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-10 w-full rounded-ww-sm border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select…</option>
            {reasonOptions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      )}

      {showNote && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder={notePlaceholder}
          className="w-full rounded-ww-sm border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={!canSubmit || status === "saving"}>
          {status === "saving" ? "Sending…" : "Send feedback"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={status === "saving"}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Segment({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-graphite">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-charcoal bg-charcoal text-bone"
          : "border-hairline bg-card text-charcoal hover:border-hairline-strong"
      )}
    >
      {children}
    </button>
  );
}
