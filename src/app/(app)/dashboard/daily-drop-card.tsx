"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import { SaveLookButton } from "@/components/wearwise/SaveLookButton";
import { PostWearSheet } from "@/components/wearwise/PostWearSheet";
import { WhyThisWorks } from "@/components/wearwise/WhyThisWorks";
import { SwapSheet, type CapView } from "@/components/wearwise/SwapSheet";
import { track } from "@/lib/analytics";
import type { Disposition } from "@/lib/laundry";

/**
 * Today's Drop card — renders a prepared daily_recommendation on the dashboard.
 * Signed image URLs are passed in as props (resolved server-side); this card
 * never fetches or constructs image paths itself.
 *
 * Phase 3: "Swap one thing" and "Show another" open the SwapSheet (lock-and-
 * replace, mood swaps, full re-theme, caps, feedback, put-back). "Why this
 * works" is a collapsible chip rendered from stored scoring factors.
 */
export interface DailyDropItemView {
  id: string;
  label: string;
  sub: string | null;
  image: string | null;
  lastWornAt: string | null;
  category?: string | null;
  /** Phase 3 hotfix: canonical swap slot label (Top/Bottom/Shoes/Layer/Accessory). */
  slot?: string | null;
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
  /** Phase 3: top-3 Why-This-Works lines (1:1 with stored scoring factors). */
  whyThisWorks: string[];
  /** Phase 3: server-computed cap snapshot for the swap sheet. */
  cap: CapView | null;
  /** Phase 3: true when a swap can be undone (pre-swap snapshot exists). */
  hasUndo: boolean;
}

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

export function DailyDropCard({
  drop,
  postwearEnabled = true,
}: {
  drop: DailyDropView;
  postwearEnabled?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [worn, setWorn] = useState(drop.status === "worn");

  // Post-wear laundry sheet (Phase 2) — opens right after "Wore It".
  const [postWearOpen, setPostWearOpen] = useState(false);
  const [postWearSaving, setPostWearSaving] = useState(false);

  // Swap sheet (Phase 3)
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapInitial, setSwapInitial] = useState<"option" | null>(null);

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
    fetch("/api/streaks/checkin", { method: "POST" }).catch(() => {});

    setWorn(true);
    setSaving(false);

    if (postwearEnabled && drop.items.length > 0) {
      setPostWearOpen(true);
    } else {
      router.refresh();
    }
  }

  async function persistPostWear(dispositions: Record<string, Disposition>, opts?: { askMeLess?: boolean }) {
    setPostWearSaving(true);
    try {
      await fetch("/api/wardrobe/laundry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "postwear",
          dispositions: drop.items.map((it) => ({ itemId: it.id, to: dispositions[it.id] ?? "wardrobe" })),
        }),
      });
      const washed = Object.values(dispositions).filter((d) => d === "wash").length;
      track("postwear_sheet_completed", {
        item_count: drop.items.length,
        washed_count: washed,
        wardrobe_count: drop.items.length - washed,
        via: opts?.askMeLess ? "ask_me_less" : "done",
      });
      if (washed > 0) track("laundry_marked", { item_count: washed, source: "postwear" });
      if (opts?.askMeLess) {
        await fetch("/api/wardrobe/laundry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ask_me_less" }),
        });
      }
    } catch {
      // Non-blocking: the outfit is already logged worn.
    } finally {
      setPostWearSaving(false);
      setPostWearOpen(false);
      router.refresh();
    }
  }

  function dismissPostWear() {
    track("postwear_sheet_dismissed", { item_count: drop.items.length });
    setPostWearOpen(false);
    router.refresh();
  }

  function openSwap() {
    setSwapInitial(null);
    setSwapOpen(true);
    track("daily_drop_swap_started", { selected_item_count: drop.items.length });
  }
  function openAnother() {
    setSwapInitial("option");
    setSwapOpen(true);
    track("daily_drop_another_option_clicked", { selected_item_count: drop.items.length });
  }

  const thumbs = drop.items.map((i) => i.image).filter((u): u is string => Boolean(u));
  const busy = saving;

  return (
    <>
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

      {/* Why This Works — collapsible, rendered 1:1 from stored scoring factors */}
      <WhyThisWorks lines={drop.whyThisWorks} source="today" />

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
          <Icon.Shuffle className="h-3.5 w-3.5" /> Swap one thing
        </Button>
        <Button variant="secondary" size="sm" onClick={openAnother} disabled={busy || worn}>
          <Icon.Sparkle className="h-3.5 w-3.5" /> Show another
        </Button>
      </div>

      {/* Investment vault (Module C): save today's look to the Lookbook */}
      <div className="mt-2 flex justify-center">
        <SaveLookButton itemIds={drop.itemIds} title="Today's drop" recommendationId={drop.id} />
      </div>
    </Card>

    <SwapSheet
      open={swapOpen}
      onClose={() => setSwapOpen(false)}
      recommendationId={drop.id}
      items={drop.items.map((it) => ({ id: it.id, label: it.label, image: it.image, category: it.category ?? null, slot: it.slot ?? null }))}
      cap={drop.cap}
      initialAction={swapInitial}
      onChanged={() => router.refresh()}
    />

    <PostWearSheet
      open={postWearOpen}
      saving={postWearSaving}
      items={drop.items.map((it) => ({ id: it.id, label: it.label, image: it.image, category: it.category ?? null }))}
      onDone={(d) => persistPostWear(d)}
      onAskMeLess={(d) => persistPostWear(d, { askMeLess: true })}
      onDismiss={dismissPostWear}
    />
    </>
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
