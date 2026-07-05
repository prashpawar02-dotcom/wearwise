"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

/**
 * Manual Daily Outfit Drop prepare — PRIVATE BETA TESTING ONLY.
 *
 * Calls the existing authenticated POST /api/daily-drop/prepare with an empty
 * body. The route always derives the user from the session (never from the
 * client), never uses force in normal use, and returns IDs only. On a prepared/
 * exists/failed-with-row result we refresh so the dashboard re-reads and shows
 * the right card/fallback; otherwise we show a calm message (never a raw error).
 *
 * `compact` renders a small retry button for use inside the failed fallback.
 */
type PrepareResponse = {
  status?: string;
  reason?: string | null;
  failReason?: string | null;
  warning?: string | null;
  recommendationId?: string | null;
};

const MSG_DISABLED = "Turn on Daily Outfit Drop in You to prepare today's outfit.";
const MSG_WARDROBE = "Add a few clothes or mark items available to prepare better outfits.";
const MSG_GENERIC = "We couldn't prepare today's outfit just now. Please try again in a moment.";
const TIP_TIMEZONE = "Tip: save your Daily Drop preferences in You to improve timing.";

// Fail reasons that mean "your wardrobe needs a little more to work with".
const WARDROBE_REASONS = new Set([
  "no_wardrobe",
  "too_few_wearable_items",
  "no_footwear_available",
  "outfit_roles_incomplete",
]);

export function PrepareDropButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tip, setTip] = useState<string | null>(null);

  async function prepare() {
    setLoading(true);
    setMessage(null);
    setTip(null);
    track("daily_drop_prepare_clicked", { source: "dashboard_beta_button" });
    try {
      const res = await fetch("/api/daily-drop/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}", // never send force in normal UI
      });
      const data: PrepareResponse = await res.json().catch(() => ({}));
      const status = data.status;
      const fail = data.failReason ?? data.reason ?? null;
      // Non-sensitive outcome only: status + reason/warning codes.
      track("daily_drop_prepare_result", { status: status ?? "unknown", fail_reason: fail, warning: data.warning ?? null });

      // Prepared / already exists, or a failure that WROTE a row (too few items,
      // no wardrobe): let the dashboard re-read and render the card or the
      // honest failed fallback.
      if (status === "prepared" || status === "exists" || (status === "failed" && data.recommendationId)) {
        router.refresh();
        return;
      }

      if (status === "disabled") {
        setMessage(MSG_DISABLED);
      } else if (fail && WARDROBE_REASONS.has(fail)) {
        setMessage(MSG_WARDROBE);
      } else {
        setMessage(MSG_GENERIC);
      }
      if (data.warning === "timezone_missing_or_invalid_default_used") setTip(TIP_TIMEZONE);
    } catch {
      setMessage(MSG_GENERIC);
    } finally {
      setLoading(false);
    }
  }

  if (compact) {
    return (
      <div className="mt-3">
        <Button onClick={prepare} variant="secondary" size="full" disabled={loading}>
          {loading ? "Preparing…" : "Try preparing again"}
        </Button>
        {message && <p className="mt-2 text-xs text-graphite">{message}</p>}
        {tip && <p className="mt-1 text-xs text-mist">{tip}</p>}
      </div>
    );
  }

  return (
    <Card className="mt-5 p-5">
      <p className="ww-eyebrow text-plum">Today&apos;s Drop</p>
      <p className="mt-1 text-sm text-graphite">Prepare one outfit from the clothes you already own.</p>
      <Button onClick={prepare} size="full" className="mt-3" disabled={loading}>
        {loading ? "Preparing…" : "Prepare today's outfit"}
      </Button>
      <p className="mt-2 text-xs text-mist">For private beta testing. Morning delivery is coming later.</p>
      {message && <p className="mt-2 text-xs text-graphite">{message}</p>}
      {tip && <p className="mt-1 text-xs text-mist">{tip}</p>}
    </Card>
  );
}
