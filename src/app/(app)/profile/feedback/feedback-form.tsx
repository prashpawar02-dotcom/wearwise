"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

const TYPES = [
  { value: "confusing", label: "Confusing" },
  { value: "bug", label: "Bug" },
  { value: "missing_feature", label: "Missing feature" },
  { value: "praise", label: "Praise" },
  { value: "other", label: "Other" },
] as const;

const CONTEXTS = [
  { value: "today", label: "Today" },
  { value: "wardrobe", label: "Wardrobe" },
  { value: "style_me", label: "Style Me" },
  { value: "daily_drop", label: "Daily Drop" },
  { value: "profile", label: "Profile" },
  { value: "admin", label: "Admin" },
  { value: "other", label: "Other" },
] as const;

const MIN_LEN = 10;
const MAX_LEN = 1000;

type TypeValue = (typeof TYPES)[number]["value"];

/** Coarse bucket so analytics never sees the message text. */
function lengthBucket(n: number): string {
  if (n < 50) return "short";
  if (n < 200) return "medium";
  return "long";
}

export function FeedbackForm({ initialContext }: { initialContext: string }) {
  const [type, setType] = useState<TypeValue>("confusing");
  const [message, setMessage] = useState("");
  const [context, setContext] = useState(initialContext);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [startedTracked, setStartedTracked] = useState(false);

  const trimmed = message.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_LEN;
  const canSubmit = trimmed.length >= MIN_LEN && trimmed.length <= MAX_LEN && status !== "saving";

  function markStarted() {
    if (!startedTracked) {
      track("feedback_started", { context });
      setStartedTracked(true);
    }
  }

  async function submit() {
    if (!canSubmit) return;
    setStatus("saving");
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus("error"); setError("Please sign in again."); return; }

    const { error: insErr } = await supabase.from("beta_feedback").insert({
      user_id: user.id,
      type,
      message: trimmed.slice(0, MAX_LEN),
      context: context || null,
    });

    if (insErr) {
      // Never expose raw DB errors; keep the message text out of analytics.
      track("feedback_failed", { type, context, message_length_bucket: lengthBucket(trimmed.length) });
      setStatus("error");
      setError("We couldn't send your feedback. Please try again.");
      return;
    }

    track("feedback_submitted", { type, context, message_length_bucket: lengthBucket(trimmed.length) });
    setStatus("done");
  }

  // ---- Success state ----
  if (status === "done") {
    return (
      <div className="rounded-ww-lg border border-sage/30 bg-sage/10 p-6 text-center shadow-ww-sm">
        <span aria-hidden="true" className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-bone">
          <Icon.Check className="h-5 w-5 text-sage" />
        </span>
        <h2 className="mt-4 font-serif text-lg text-charcoal">Thanks — this helps improve WearWise for beta users.</h2>
        <Button asChild size="full" className="mt-5">
          <Link href="/profile">Back to Profile</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Type */}
      <div className="space-y-2">
        <Label>What kind of feedback?</Label>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={type === t.value}
              onClick={() => { setType(t.value); markStarted(); }}
              className={cn(
                "min-h-[40px] rounded-full border px-4 text-sm font-medium transition-colors",
                type === t.value ? "border-charcoal bg-charcoal text-bone" : "border-hairline text-graphite hover:bg-stone/40"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      <div className="space-y-2">
        <Label htmlFor="fb-message">Your message</Label>
        <textarea
          id="fb-message"
          value={message}
          onChange={(e) => { setMessage(e.target.value.slice(0, MAX_LEN)); markStarted(); }}
          rows={5}
          maxLength={MAX_LEN}
          placeholder="What happened? What did you expect?"
          className="w-full rounded-ww-sm border border-input bg-card p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center justify-between text-[11px] text-mist">
          <span className={cn(tooShort && "text-destructive")}>
            {tooShort ? `At least ${MIN_LEN} characters` : " "}
          </span>
          <span>{trimmed.length}/{MAX_LEN}</span>
        </div>
      </div>

      {/* Context */}
      <div className="space-y-2">
        <Label htmlFor="fb-context">Which part of the app? (optional)</Label>
        <select
          id="fb-context"
          value={context}
          onChange={(e) => { setContext(e.target.value); markStarted(); }}
          className="h-11 w-full rounded-ww-sm border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {CONTEXTS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={submit} size="full" disabled={!canSubmit}>
        {status === "saving" ? "Sending…" : "Share feedback"}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-graphite">
        <Icon.Lock className="h-3 w-3 shrink-0" /> Private to the WearWise team. No screenshots or wardrobe photos are sent.
      </p>
    </div>
  );
}
