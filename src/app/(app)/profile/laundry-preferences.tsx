"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/Icon";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Laundry preferences (Phase 2, You tab). Lets the user turn the post-wear
 * "where does this go?" sheet back on after they've silenced it with "Ask me
 * less" — and turn it off deliberately. Honest, reversible, no dark patterns.
 */
export function LaundryPreferences({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);

  async function setPref(next: boolean) {
    if (next === enabled || busy) return;
    setBusy(true);
    setEnabled(next); // optimistic
    try {
      const res = await fetch("/api/wardrobe/laundry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_postwear_enabled", enabled: next }),
      });
      if (!res.ok) {
        setEnabled(!next); // revert
      } else {
        track("postwear_pref_changed", { enabled: next });
        router.refresh();
      }
    } catch {
      setEnabled(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ww-eyebrow text-plum">Post-wear check</p>
          <p className="mt-1 text-sm text-graphite">
            After you wear an outfit, WearWise can ask where each piece goes — so it always knows what&apos;s clean.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Post-wear laundry check"
          disabled={busy}
          onClick={() => setPref(!enabled)}
          className={cn(
            "relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
            enabled ? "bg-sage" : "bg-stone"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 grid h-6 w-6 place-items-center rounded-full bg-bone shadow-ww-sm transition-transform",
              enabled ? "translate-x-[22px]" : "translate-x-0.5"
            )}
          >
            {enabled && <Icon.Check className="h-3 w-3 text-sage" />}
          </span>
        </button>
      </div>
      {!enabled && (
        <p className="mt-2 text-xs text-mist">
          It&apos;s off for now. You can still mark items in the wash anytime from your Wardrobe.
        </p>
      )}
    </Card>
  );
}
