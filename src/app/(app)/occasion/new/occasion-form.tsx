"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Icon, type IconProps } from "@/components/ui/Icon";
import type { Occasion } from "@/lib/types";
import type { WeatherContext } from "@/lib/weather";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

// Minimum wardrobe items before outfit generation is useful (matches the
// generate-drafts API). Kept local to avoid importing server-side helpers.
const MIN_ITEMS = 5;

interface WardrobeReady {
  tops: boolean;
  bottoms: boolean;
  shoes: boolean;
}

type IconCmp = (props: IconProps) => React.JSX.Element;

/**
 * Broad, culture-aware occasion list. Each maps to an existing DB `occasion`
 * enum value (no migration); a more specific `tag` is carried into the request
 * notes so the stylist/AI sees the precise intent (e.g. Interview vs. Work).
 */
interface StyleOccasion {
  key: string;
  label: string;
  desc: string;
  occasion: Occasion;
  icon: IconCmp;
  tag?: string;
}

const STYLE_OCCASIONS: StyleOccasion[] = [
  { key: "work", label: "Work", desc: "Polished, comfortable, repeat-safe.", occasion: "work", icon: Icon.Briefcase },
  { key: "casual", label: "Casual", desc: "Easy pieces for a normal day.", occasion: "casual", icon: Icon.Coffee },
  { key: "college", label: "College", desc: "Comfortable, expressive, easy.", occasion: "college", icon: Icon.GraduationCap },
  { key: "date", label: "Date", desc: "Confident, relaxed, intentional.", occasion: "dinner_date", icon: Icon.Wine, tag: "Date" },
  { key: "dinner", label: "Dinner", desc: "Sharper, warmer, considered.", occasion: "dinner_date", icon: Icon.Wine, tag: "Dinner" },
  { key: "travel", label: "Travel", desc: "Comfortable, practical, repeatable.", occasion: "travel", icon: Icon.Plane },
  { key: "interview", label: "Interview", desc: "Trustworthy, quietly sharp.", occasion: "work", icon: Icon.Briefcase, tag: "Interview" },
  { key: "gym", label: "Gym", desc: "Active, breathable, easy.", occasion: "casual", icon: Icon.Dumbbell, tag: "Gym" },
  { key: "wedding_guest", label: "Wedding guest", desc: "Occasion-ready without overthinking.", occasion: "family_function", icon: Icon.Sparkle, tag: "Wedding guest" },
  { key: "family_function", label: "Family function", desc: "Respectful, comfortable, put together.", occasion: "family_function", icon: Icon.Sparkle },
  { key: "festival", label: "Festival", desc: "Traditional, festive, weather-aware.", occasion: "festive", icon: Icon.Sparkle, tag: "Festival" },
  { key: "formal_event", label: "Formal event", desc: "Dressier. A clear step up.", occasion: "party", icon: Icon.Sparkle, tag: "Formal event" },
];

export function OccasionForm({
  itemCount,
  wearableCount,
  ready,
  weather,
}: {
  itemCount: number;
  wearableCount: number;
  ready: WardrobeReady;
  weather: WeatherContext | null;
}) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ---- Too few clothes: guide the user to add some first ----
  if (itemCount < MIN_ITEMS) {
    return (
      <div className="rounded-ww-lg border border-hairline bg-bone p-6 text-center shadow-ww-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-lavender/20">
          <Icon.Hanger className="h-7 w-7 text-plum" />
        </div>
        <h2 className="ww-display mt-4 text-2xl text-charcoal">Add a few clothes first</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-graphite">
          WearWise needs at least a few tops, bottoms and shoes to create better outfits.
          You have {itemCount} {itemCount === 1 ? "item" : "items"} so far.
        </p>
        <Button asChild className="mt-6" size="lg">
          <Link href="/wardrobe/upload"><Icon.Plus className="h-4 w-4" /> Add clothes</Link>
        </Button>
      </div>
    );
  }

  async function submitWith(occ: Occasion, tag: string | null) {
    setSaving(true);
    setError("");
    // Occasion enum only — never the free-text note.
    track("style_me_started", { occasion: occ });
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const composedNotes = [tag, notes.trim() || null].filter(Boolean).join(" — ") || null;
    const { data, error: insErr } = await supabase
      .from("outfit_requests")
      .insert({ user_id: user.id, occasion: occ, notes: composedNotes, status: "pending" })
      .select("id")
      .single();

    if (insErr || !data) {
      track("outfit_request_failed", { reason: "insert_failed" });
      setError("We couldn't start your outfit request. Please try again in a moment.");
      setSaving(false);
      return;
    }
    track("outfit_request_created", {
      occasion: occ,
      wearable_item_count: wearableCount,
      weather_available: Boolean(weather),
    });

    // Human-less generation (Module A): kick off auto-generation now so
    // validated looks are ready when the outfits page loads. The server
    // enforces flags + entitlements; a locked occasion routes to /upgrade.
    try {
      const resp = await fetch(`/api/outfit-requests/${data.id}/generate`, { method: "POST" });
      const gen = (await resp.json()) as { status?: string };
      if (resp.status === 402 || gen.status === "upgrade_required") {
        track("paywall_hit", { source: "occasion_locked", occasion: occ });
        router.push("/upgrade?from=occasion");
        return;
      }
      track("outfits_generation_result", { status: gen.status ?? "unknown", occasion: occ });
    } catch {
      // Non-fatal: the outfits page shows the "being prepared" state.
    }

    router.push(`/outfits/${data.id}`);
    router.refresh();
  }

  function submitSelected() {
    const sel = STYLE_OCCASIONS.find((o) => o.key === selectedKey);
    if (!sel) { setError("Please choose what you're dressing for."); return; }
    void submitWith(sel.occasion, sel.tag ?? null);
  }

  function submitDefault() {
    // Honest, calm default: work on weekdays, casual on weekends.
    const day = new Date().getDay();
    const weekend = day === 0 || day === 6;
    void submitWith(weekend ? "casual" : "work", null);
  }

  const readyList = [ready.tops && "tops", ready.bottoms && "bottoms", ready.shoes && "shoes"].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      {/* Honest note when in-wash/unavailable items leave too few usable pieces */}
      {wearableCount < MIN_ITEMS && (
        <div className="flex items-start gap-2 rounded-ww-md border border-champagne/30 bg-champagne/[0.12] p-3 text-sm text-[#8a6a3e]">
          <Icon.Sparkle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>A few items are unavailable. Mark clothes available or add more items to get better outfits.</span>
        </div>
      )}

      {/* Occasion cards */}
      <div className="space-y-3">
        <Label>What are you dressing for?</Label>
        <div className="grid grid-cols-2 gap-3">
          {STYLE_OCCASIONS.map((o) => {
            const selected = selectedKey === o.key;
            const OIcon = o.icon;
            return (
              <button
                key={o.key}
                type="button"
                aria-pressed={selected}
                onClick={() => { setSelectedKey(o.key); setError(""); }}
                className={cn(
                  "relative min-h-[120px] rounded-ww-md border p-4 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  selected
                    ? "border-charcoal bg-charcoal text-bone"
                    : "border-hairline bg-bone text-charcoal hover:border-hairline-strong"
                )}
              >
                <span
                  className={cn(
                    "mb-3 grid h-9 w-9 place-items-center rounded-ww-sm",
                    selected ? "bg-bone/10 text-bone" : "bg-ivory text-plum"
                  )}
                >
                  <OIcon className="h-[18px] w-[18px]" />
                </span>
                <span className="block text-[15px] font-medium">{o.label}</span>
                <span className={cn("mt-1 block text-xs leading-snug", selected ? "text-bone/60" : "text-graphite")}>
                  {o.desc}
                </span>
                {selected && (
                  <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-champagne">
                    <Icon.Check className="h-3 w-3 text-charcoal" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional detail */}
      <div className="space-y-2">
        <Label htmlFor="notes">Anything specific? (optional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. outdoor event, prefer something traditional, need to be comfortable"
        />
      </div>

      {/* Context strip — real weather when available, honest fallback otherwise */}
      <div className="space-y-1.5 rounded-ww-md border border-hairline bg-bone p-3 text-sm">
        {weather ? (
          <p className="text-charcoal">
            <span className="font-medium">Today: {weather.tempC}° · {weather.summary}</span>{" "}
            <span className="text-graphite">— {weather.advice}</span>
          </p>
        ) : (
          <p className="text-graphite">Using your wardrobe and selected occasion.</p>
        )}
        {readyList.length > 0 && (
          <p className="text-graphite">
            Wardrobe ready: <span className="text-charcoal">{readyList.join(", ")}</span>.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* CTAs */}
      <div className="space-y-2">
        <Button onClick={submitSelected} size="full" disabled={saving}>
          {saving ? "Finding your outfit…" : (<>Find my outfit <Icon.ArrowRight className="h-4 w-4" /></>)}
        </Button>
        <Button onClick={submitDefault} variant="secondary" size="full" disabled={saving}>
          Use today&apos;s default
        </Button>
      </div>
    </div>
  );
}
