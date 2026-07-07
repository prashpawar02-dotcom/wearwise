"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Save-to-Lookbook button (Module C). Server enforces the free cap of 5;
 * hitting it routes to the contextual paywall (a peak-want moment).
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

  async function save() {
    if (state !== "idle") return;
    setState("saving");
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
      const json = (await resp.json()) as { status?: string };
      if (json.status === "ok") {
        setState("saved");
        track("look_saved", { item_count: itemIds.length });
        return;
      }
      setState("idle");
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      onClick={save}
      disabled={state !== "idle"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors",
        state === "saved" ? "border-sage/40 text-sage" : "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {state === "saved" ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
      {state === "saved" ? "In your Lookbook" : state === "saving" ? "Saving…" : "Save look"}
    </button>
  );
}
