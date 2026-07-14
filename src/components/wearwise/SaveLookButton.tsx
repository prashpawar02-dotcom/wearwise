"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Save-to-Lookbook button (Module C). Server enforces the free cap of 5;
 * hitting it routes to the contextual paywall (a peak-want moment).
 *
 * Phase 4B: fires `save_look_tapped` at tap-time (required Today telemetry)
 * and surfaces a short, honest error line on failure — the `state !== "idle"`
 * guard below already prevents duplicate rapid submissions (a second tap
 * while "saving"/"saved" is a no-op).
 */
export function SaveLookButton({
  itemIds,
  title,
  suggestionId,
  recommendationId,
  className,
}: {
  itemIds: string[];
  title?: string | null;
  suggestionId?: string;
  recommendationId?: string;
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (state !== "idle") return;
    setState("saving");
    setError(null);
    track("save_look_tapped", { item_count: itemIds.length });
    try {
      const resp = await fetch("/api/looks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds, title: title ?? undefined, suggestionId, recommendationId }),
      });
      if (resp.status === 402) {
        track("paywall_hit", { source: "lookbook_full" });
        router.push("/upgrade?from=lookbook");
        return;
      }
      if (!resp.ok) {
        setState("idle");
        setError("Couldn't save that look. Please try again.");
        return;
      }
      const json = (await resp.json()) as { status?: string };
      if (json.status === "ok") {
        setState("saved");
        track("look_saved", { item_count: itemIds.length });
        return;
      }
      setState("idle");
      setError("Couldn't save that look. Please try again.");
    } catch {
      setState("idle");
      setError("Couldn't save that look. Please try again.");
    }
  }

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <button
        type="button"
        onClick={save}
        disabled={state !== "idle"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors",
          state === "saved" ? "border-sage/40 text-sage" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {state === "saved" ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
        {state === "saved" ? "In your Lookbook" : state === "saving" ? "Saving…" : "Save look"}
      </button>
      {error && <p className="text-center text-[11px] text-terracotta">{error}</p>}
    </div>
  );
}
