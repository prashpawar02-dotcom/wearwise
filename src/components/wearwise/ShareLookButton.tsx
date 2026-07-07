"use client";

import { useState } from "react";
import { Share2, Link as LinkIcon } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * "Can't decide? Ask a friend" (Module F). Creates a signed public vote
 * link and hands it to the native share sheet (or clipboard fallback).
 */
export function ShareLookButton({ suggestionIds, className }: { suggestionIds: string[]; className?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "copied">("idle");

  async function share() {
    if (state === "busy") return;
    setState("busy");
    try {
      const resp = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionIds }),
      });
      const json = (await resp.json()) as { status: string; url?: string };
      if (json.status !== "ok" || !json.url) { setState("idle"); return; }
      track("share_created", { source: "outfit_card", option_count: suggestionIds.length });
      const text = "Which look should I wear? Vote in one tap 👗";
      if (navigator.share) {
        await navigator.share({ text, url: json.url });
        setState("idle");
      } else {
        await navigator.clipboard.writeText(json.url);
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      }
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      onClick={share}
      disabled={state === "busy"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      {state === "copied" ? <LinkIcon className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
      {state === "copied" ? "Link copied" : state === "busy" ? "Creating…" : "Ask a friend"}
    </button>
  );
}
