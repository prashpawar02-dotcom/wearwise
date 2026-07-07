"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/**
 * Fires the privacy-safe worn_history_viewed event on mount. Counts only — no
 * item names, image URLs, signed URLs, reasoning text, or email. Renders nothing.
 */
export function WornHistoryAnalytics({ count }: { count: number }) {
  useEffect(() => {
    track("worn_history_viewed", {
      worn_outfit_count: count,
      has_worn_history: count > 0,
    });
  }, [count]);
  return null;
}
