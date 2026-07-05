"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

/**
 * Today's Drop card — renders a prepared daily_recommendation on the dashboard.
 * Signed image URLs are passed in as props (resolved server-side); this card
 * never fetches or constructs image paths itself. "Wear this" marks the drop
 * worn; "Swap one item" and "Another option" call server routes that mutate the
 * SAME recommendation row (item IDs only — never image URLs), then refresh.
 */
export interface DailyDropItemView {
  id: string;
  label: string;
  sub: string | null;
  image: string | null;
  lastWornAt: string | null;
}

export interface DailyDropView {
  id: string;
  status: string;
  occasionContext: string | null;
  weatherSummary: string | null;
  reasoning: string | null;
  dailyInsight: string | null;
  itemIds: string[];
  items: DailyDropItemView[];
}

type Candidate = { id: string; label: string; sub: string | null; image: string | null };
type RepeatStatus = "no_history" | "repeat_safe" | "one_recent" | "multiple_recent";

const RECENT_DAYS = 7;

function daysSince(d: string | null): number | null {
  if (!d) return null;
  const ms = Date.now() - Date.parse(d);
  return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000);
}
function wornRecently(d: string | null): boolean {
  const n = daysSince(d);
  return n !== null && n <= RECENT_DAYS;
}
function itemDetailText(d: string | null): string {
  if (!d) return "No wear history yet";
  return wornRecently(d) ? "Worn recently" : "Not worn recently";
}

const REPEAT_COPY: Record<RepeatStatus, string> = {
  no_history: "Fresh pick: no recent wear history yet",
  repeat_safe: "Repeat-safe: none of these were worn in the last 7 days",
  one_recent: "One repeat: one piece was worn recently",
  multiple_recent: "Repeat warning: a few pieces were worn recently",
};

export function DailyDropCard({ drop }: { drop: DailyDropView }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [worn, setWorn] = useState(drop.status === "worn");

  // Action state (swap + another option)
  const [panelOpen, setPanelOpen] = useState(false);
  const [swapItemId, setSwapItemId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candidateRole, setCandidateRole] = useState<string | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // ---- Trust signals (derived from the selected items' wear history) ----
  const withHistory = drop.items.filter((i) => i.lastWornAt);
  const recentCount = drop.items.filter((i) => wornRecently(i.lastWornAt)).length;
  const repeatStatus: RepeatStatus =
    withHistory.length === 0
      ? "no_history"
      : recentCount === 0
        ? "repeat_safe"
        : recentCount === 1
          ? "one_recent"
          : "multiple_recent";
  const layerHint = Boolean(drop.weatherSummary && drop.reasoning && /layer/i.test(drop.reasoning));
  const weatherLine = drop.weatherSummary
    ? layerHint
      ? "Layer suggested for cooler weather"
      : "Works for your city weather"
    : "Weather unavailable";

  // Fire once when a prepared drop is shown. Non-sensitive: status + counts only.
  useEffect(() => {
    track("daily_drop_viewed", {
      status: drop.status === "failed" ? "failed" : "prepared",
      item_count: drop.items.length,
      weather_available: Boolean(drop.weatherSummary),
    });
    track("daily_drop_trust_signals_viewed", {
      repeat_status: repeatStatus,
      selected_item_count: drop.items.length,
      has_weather_summary: Boolean(drop.weatherSummary),
      has_daily_insight: Boolean(drop.dailyInsight),
    });
  }, [drop.id, drop.status, drop.items.length, drop.weatherSummary, drop.dailyInsight, repeatStatus]);

  async function wearThis() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    await supabase
      .from("daily_recommendations")
      .update({ status: "worn", worn_at: nowIso, updated_at: nowIso })
      .eq("id", drop.id);

    if (drop.itemIds.length) {
      await supabase.from("wardrobe_items").update({ last_worn_at: today }).in("id", drop.itemIds);
    }

    track("daily_drop_worn", { item_count: drop.itemIds.length });

    setWorn(true);
    setSaving(false);
    router.refresh();
  }

  function openSwap() {
    setPanelOpen(true);
    setSwapItemId(null);
    setCandidates(null);
    setActionMsg(null);
    track("daily_drop_swap_started", { selected_item_count: drop.items.length });
  }

  function closeSwap() {
    setPanelOpen(false);
    setSwapItemId(null);
    setCandidates(null);
  }

  async function chooseReplace(itemId: string) {
    setSwapItemId(itemId);
    setCandidates(null);
    setLoadingCandidates(true);
    try {
      const res = await fetch(
        `/api/daily-drop/swap-candidates?recommendationId=${encodeURIComponent(drop.id)}&replaceItemId=${encodeURIComponent(itemId)}`
      );
      const data = await res.json().catch(() => ({}));
      if (data.status === "ok") {
        setCandidates(data.candidates ?? []);
        setCandidateRole(data.role ?? null);
      } else {
        setCandidates([]);
      }
    } catch {
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function applySwap(replaceItemId: string, replacementItemId: string) {
    setUpdating(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/daily-drop/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: drop.id, replaceItemId, replacementItemId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === "updated") {
        track("daily_drop_swap_completed", {
          status: "updated",
          replaced_role: candidateRole,
          candidate_count: candidates?.length ?? 0,
          selected_item_count: data.selectedItemIds?.length ?? drop.items.length,
        });
        closeSwap();
        router.refresh();
        return;
      }
      track("daily_drop_swap_failed", { reason_code: data.reason ?? "error" });
      setActionMsg("We couldn't swap that piece. Please try again.");
    } catch {
      track("daily_drop_swap_failed", { reason_code: "network" });
      setActionMsg("We couldn't swap that piece. Please try again.");
    } finally {
      setUpdating(false);
    }
  }

  async function anotherOption() {
    setUpdating(true);
    setActionMsg(null);
    setPanelOpen(false);
    track("daily_drop_another_option_clicked", { selected_item_count: drop.items.length });
    try {
      const res = await fetch("/api/daily-drop/another-option", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: drop.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === "updated") {
        track("daily_drop_another_option_result", { status: "updated", selected_item_count: data.selectedItemIds?.length ?? 0 });
        router.refresh();
        return;
      }
      if (data.status === "not_enough_items") {
        track("daily_drop_another_option_result", { status: "not_enough_items", selected_item_count: drop.items.length });
        setActionMsg("Add a few more available clothes to create another strong option.");
      } else {
        track("daily_drop_another_option_result", { status: "error", selected_item_count: drop.items.length });
        setActionMsg("We couldn't create another option right now. Please try again.");
      }
    } catch {
      track("daily_drop_another_option_result", { status: "error", selected_item_count: drop.items.length });
      setActionMsg("We couldn't create another option right now. Please try again.");
    } finally {
      setUpdating(false);
    }
  }

  const thumbs = drop.items.map((i) => i.image).filter((u): u is string => Boolean(u));
  const busy = saving || updating;

  return (
    <Card variant="stack" className="mt-5 overflow-hidden p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ww-eyebrow text-plum">Today&apos;s Drop</p>
          <h2 className="mt-1 font-serif text-[1.35rem] leading-tight tracking-tight text-charcoal">
            Today&apos;s outfit is ready.
          </h2>
        </div>
        <Chip tone="filled" size="sm">{drop.occasionContext ?? "Daily"}</Chip>
      </div>

      {/* Private signed thumbnails, or a calm placeholder */}
      <div className="mb-4 h-40 overflow-hidden rounded-ww-md border border-hairline bg-gradient-to-b from-bone to-stone">
        {thumbs.length > 0 ? (
          <div className="flex h-full gap-1">
            {thumbs.slice(0, 4).map((src, i) => (
              <div key={i} className="h-full flex-1 overflow-hidden bg-stone">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-full place-items-center text-mist">
            <Icon.Hanger className="h-7 w-7" />
          </div>
        )}
      </div>

      {/* Item list — each with a subtle wear-history detail */}
      <ul className="space-y-1.5">
        {drop.items.map((it) => (
          <li key={it.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="text-charcoal">{it.label}</span>
              <span className="block text-[11px] text-mist">{itemDetailText(it.lastWornAt)}</span>
            </span>
            {it.sub && <span className="shrink-0 text-xs text-graphite">{it.sub}</span>}
          </li>
        ))}
      </ul>

      {/* Why-line: weather · freshness · wardrobe (calm, no certainty claims) */}
      <div className="mt-3 space-y-1.5 rounded-ww-md border border-hairline bg-bone p-3">
        <WhyLine icon={<Icon.Sun className="h-3.5 w-3.5 text-champagne" />} text={weatherLine} />
        <WhyLine
          icon={<Icon.Check className={`h-3.5 w-3.5 ${repeatStatus === "multiple_recent" ? "text-terracotta" : "text-sage"}`} />}
          text={REPEAT_COPY[repeatStatus]}
        />
        <WhyLine icon={<Icon.Hanger className="h-3.5 w-3.5 text-plum" />} text="Uses available clothes only" />
      </div>

      {/* Why it works (stylist reasoning) */}
      {drop.reasoning && (
        <div className="mt-3 rounded-ww-md border border-lavender/40 bg-lavender/[0.12] p-3">
          <p className="ww-eyebrow text-plum">Why this works</p>
          <p className="mt-0.5 text-sm leading-snug text-charcoal">{drop.reasoning}</p>
        </div>
      )}

      {/* Calm daily insight */}
      {drop.dailyInsight && (
        <p className="mt-2 text-xs leading-relaxed text-graphite">{drop.dailyInsight}</p>
      )}

      {/* Primary CTA */}
      <Button onClick={wearThis} size="full" className="mt-4" disabled={busy || worn} variant={worn ? "secondary" : "default"}>
        {worn ? (<><Icon.Check className="h-4 w-4" /> Worn today</>) : saving ? "Saving…" : "Wear this"}
      </Button>

      {/* Secondary actions */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={openSwap} disabled={busy || worn}>
          <Icon.Shuffle className="h-3.5 w-3.5" /> Swap one item
        </Button>
        <Button variant="secondary" size="sm" onClick={anotherOption} disabled={busy || worn}>
          <Icon.Sparkle className="h-3.5 w-3.5" /> Another option
        </Button>
      </div>

      {actionMsg && <p className="mt-2 text-xs text-graphite">{actionMsg}</p>}

      {/* Swap panel */}
      {panelOpen && (
        <div className="mt-3 rounded-ww-md border border-hairline bg-ivory/60 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-charcoal">Swap one piece</p>
            <button type="button" onClick={closeSwap} aria-label="Close swap panel" className="text-mist hover:text-charcoal">
              <Icon.Close className="h-4 w-4" />
            </button>
          </div>

          {!swapItemId ? (
            <>
              <p className="mt-1 text-xs text-graphite">Choose the piece to replace.</p>
              <div className="mt-2 space-y-1.5">
                {drop.items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => chooseReplace(it.id)}
                    disabled={updating}
                    className="flex w-full items-center justify-between rounded-ww-sm border border-hairline bg-bone px-3 py-2 text-left text-sm text-charcoal transition-colors hover:bg-stone/40 disabled:opacity-50"
                  >
                    <span className="truncate">{it.label}</span>
                    <Icon.ArrowRight className="h-3.5 w-3.5 shrink-0 text-mist" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setSwapItemId(null); setCandidates(null); }}
                className="mt-1 inline-flex items-center gap-1 text-xs text-graphite hover:text-charcoal"
              >
                <Icon.ArrowLeft className="h-3 w-3" /> Back
              </button>
              {loadingCandidates ? (
                <p className="mt-2 text-xs text-graphite">Finding options…</p>
              ) : candidates && candidates.length > 0 ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => applySwap(swapItemId, c.id)}
                      disabled={updating}
                      className="overflow-hidden rounded-ww-sm border border-hairline bg-stone/50 text-left transition-transform active:scale-[0.98] disabled:opacity-50"
                    >
                      <div className="aspect-square bg-stone/60">
                        {c.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.image} alt="" className="h-full w-full object-contain p-1" />
                        ) : (
                          <div className="grid h-full place-items-center text-mist"><Icon.Hanger className="h-5 w-5" /></div>
                        )}
                      </div>
                      <p className="truncate px-1.5 py-1 text-[11px] text-charcoal">{c.label}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-graphite">
                  No available replacement for this piece. Add more clothes or mark items available.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function WhyLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <p className="flex items-center gap-2 text-xs text-charcoal">
      <span aria-hidden="true" className="shrink-0">{icon}</span>
      {text}
    </p>
  );
}
