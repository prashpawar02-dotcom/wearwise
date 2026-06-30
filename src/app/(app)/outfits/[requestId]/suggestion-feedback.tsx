"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Optional structured reasons, shown only when the response is negative/unsure.
const REASONS = [
  "Bad color match",
  "Not my style",
  "Missing item",
  "Too casual",
  "Too formal",
  "I would not wear this combo",
  "Other",
] as const;

type WouldWear = "yes" | "maybe" | "no";

/**
 * Lightweight, mobile-first feedback on an APPROVED outfit suggestion.
 * Writes to public.outfit_suggestion_feedback. RLS guarantees a user can only
 * insert feedback for their own suggestion, so no extra server route is needed.
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

  const negative = useful === false || wouldWear === "maybe" || wouldWear === "no";
  const canSubmit = useful !== null || wouldWear !== "";

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
      reason: negative ? (reason || null) : null,
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
        <Choice active={wouldWear === "yes"} onClick={() => setWouldWear("yes")}>Yes</Choice>
        <Choice active={wouldWear === "maybe"} onClick={() => setWouldWear("maybe")}>Maybe</Choice>
        <Choice active={wouldWear === "no"} onClick={() => setWouldWear("no")}>No</Choice>
      </Segment>

      {negative && (
        <div className="space-y-2">
          <label className="block text-xs text-graphite" htmlFor={`reason-${suggestionId}`}>
            What was off? (optional)
          </label>
          <select
            id={`reason-${suggestionId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-10 w-full rounded-ww-sm border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select a reason…</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Anything else? (optional)"
            className="w-full rounded-ww-sm border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
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
