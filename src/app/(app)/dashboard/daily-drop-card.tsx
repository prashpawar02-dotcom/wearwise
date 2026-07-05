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
 * never fetches or constructs image paths itself. The "Wear this" action marks
 * the recommendation worn and stamps last_worn_at on the chosen items (both
 * owner-scoped writes governed by existing RLS).
 */
export interface DailyDropItemView {
  id: string;
  label: string;
  sub: string | null;
  image: string | null;
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

export function DailyDropCard({ drop }: { drop: DailyDropView }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [worn, setWorn] = useState(drop.status === "worn");

  // Fire once when a prepared drop is shown. Non-sensitive: status + counts only.
  useEffect(() => {
    track("daily_drop_viewed", {
      status: drop.status === "failed" ? "failed" : "prepared",
      item_count: drop.items.length,
      weather_available: Boolean(drop.weatherSummary),
    });
  }, [drop.id, drop.status, drop.items.length, drop.weatherSummary]);

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

  const thumbs = drop.items.map((i) => i.image).filter((u): u is string => Boolean(u));

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

      {/* Item list */}
      <ul className="space-y-1.5">
        {drop.items.map((it) => (
          <li key={it.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-charcoal">{it.label}</span>
            {it.sub && <span className="shrink-0 text-xs text-graphite">{it.sub}</span>}
          </li>
        ))}
      </ul>

      {/* Weather line (honest — only present when weather was available) */}
      {drop.weatherSummary && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-graphite">
          <Icon.Sun className="h-3.5 w-3.5 shrink-0 text-champagne" /> {drop.weatherSummary}
        </p>
      )}

      {/* Why it works */}
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

      <Button onClick={wearThis} size="full" className="mt-4" disabled={saving || worn} variant={worn ? "secondary" : "default"}>
        {worn ? (<><Icon.Check className="h-4 w-4" /> Worn today</>) : saving ? "Saving…" : "Wear this"}
      </Button>
    </Card>
  );
}
