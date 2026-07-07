"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const MILESTONES = [3, 7, 14, 30, 100];

/**
 * Streak flame (Module C) — lives top-right on Today. Renders the server-
 * loaded count immediately, then checks in once per mount (idempotent server
 * API). Milestone check-ins show a small celebration card.
 */
export function StreakFlame({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [milestone, setMilestone] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/streaks/checkin", { method: "POST" });
        if (!resp.ok) return;
        const json = (await resp.json()) as { current?: number; milestone?: number | null; status?: string };
        if (cancelled) return;
        if (typeof json.current === "number") setCount(json.current);
        if (json.milestone && MILESTONES.includes(json.milestone)) {
          setMilestone(json.milestone);
          track("streak_milestone", { days: json.milestone });
        }
      } catch {
        // streaks must never break Today
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1",
          count > 0 ? "text-terracotta" : "text-muted-foreground"
        )}
        title={count > 0 ? `${count}-day streak` : "Start your streak — open your outfit daily"}
      >
        <Flame className="h-4 w-4" strokeWidth={2.2} fill={count > 0 ? "currentColor" : "none"} />
        <span className="text-sm font-semibold tabular-nums">{count}</span>
      </div>

      {milestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={() => setMilestone(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-card p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <Flame className="mx-auto h-10 w-10 text-terracotta" fill="currentColor" />
            <p className="mt-3 font-serif text-2xl font-semibold">{milestone}-day streak!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {milestone} days of dressing without the stress. Keep it going.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 rounded-full border border-border py-2 text-sm"
                onClick={() => setMilestone(null)}
              >
                Nice
              </button>
              <button
                className="flex-1 rounded-full bg-plum py-2 text-sm text-white"
                onClick={async () => {
                  const text = `${milestone}-day streak on WearWise — I haven't stressed about what to wear in ${milestone} days 👗`;
                  try {
                    if (navigator.share) await navigator.share({ text });
                    else await navigator.clipboard.writeText(text);
                    track("share_created", { source: "streak_milestone", days: milestone });
                  } catch { /* user cancelled */ }
                  setMilestone(null);
                }}
              >
                Share
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
