"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ItemEditor } from "./item-editor";
import { OCCASIONS, AUTOTAG_PRIVACY_COPY, type AvailabilityStatus, type Occasion, type WardrobeItem } from "@/lib/types";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Sparkles, AlertCircle, Check, Pencil } from "lucide-react";

const occasionLabel = (v: string) => OCCASIONS.find((o) => o.value === v)?.label ?? v;

export function ItemView({ item: initial, imageUrl }: { item: WardrobeItem; imageUrl?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [item, setItem] = useState<WardrobeItem>(initial);
  const [phase, setPhase] = useState<"analyzing" | "ready">(
    initial.ai_tag_status === "analyzing" ? "analyzing" : "ready"
  );
  const [mode, setMode] = useState<"card" | "edit">(
    initial.ai_tag_status === "failed" ? "edit" : "card"
  );
  const [confirming, setConfirming] = useState(false);
  const ran = useRef(false);

  // On first load of an "analyzing" item, run server-side auto-tagging.
  useEffect(() => {
    if (item.ai_tag_status !== "analyzing" || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        await fetch(`/api/wardrobe/${item.id}/autotag`, { method: "POST" });
      } catch {
        // ignore — we re-read the row below and fall back to manual if needed
      }
      const { data } = await supabase
        .from("wardrobe_items").select("*").eq("id", item.id).single();
      if (data) {
        const fresh = data as WardrobeItem;
        setItem(fresh);
        setMode(fresh.ai_tag_status === "failed" ? "edit" : "card");
        track("wardrobe_item_tagged", {
          status:
            fresh.ai_tag_status === "failed"
              ? "failed"
              : fresh.ai_tag_status === "needs_review"
                ? "needs_review"
                : "success",
        });
      }
      setPhase("ready");
    })();
  }, [item.id, item.ai_tag_status, supabase]);

  const imageAlt = item.user_facing_name ?? item.category ?? "Wardrobe item";
  const image = (
    <div className="mx-auto aspect-[3/4] w-2/3 overflow-hidden rounded-xl border border-border bg-muted">
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={imageAlt} className="h-full w-full object-cover" />
      )}
    </div>
  );

  // ---- Analyzing ----
  if (phase === "analyzing") {
    return (
      <div className="space-y-6">
        {image}
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2 text-plum">
            <Sparkles className="h-5 w-5 animate-pulse" />
            <span className="font-medium">Identifying your item…</span>
          </div>
          <p className="mt-2 max-w-xs text-xs text-muted-foreground">{AUTOTAG_PRIVACY_COPY}</p>
        </div>
      </div>
    );
  }

  // ---- Edit details (manual form / fallback) ----
  if (mode === "edit") {
    return (
      <div className="space-y-5">
        {image}
        {item.ai_tag_status === "failed" && (
          <div className="flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <p className="text-xs text-muted-foreground">
              We couldn&apos;t auto-identify this one. Add a few details below — it only takes a moment.
            </p>
          </div>
        )}
        <button
          onClick={() => setMode("card")}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to summary
        </button>
        <ItemEditor item={item} />
      </div>
    );
  }

  // ---- Confirmation card ----
  const needsReview = item.ai_tag_status === "needs_review";

  async function looksGood() {
    setConfirming(true);
    await supabase
      .from("wardrobe_items")
      .update({ ai_tag_status: "tagged" })
      .eq("id", item.id);
    router.push("/wardrobe");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {image}

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-serif text-xl font-semibold">
                {item.user_facing_name || item.category || "Your item"}
              </p>
              {item.style && <p className="text-sm text-muted-foreground">{item.style}</p>}
            </div>
            <Sparkles className="h-5 w-5 shrink-0 text-gold" />
          </div>

          {needsReview && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 p-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <p className="text-xs text-muted-foreground">
                We weren&apos;t fully sure on this one — please check the details below.
              </p>
            </div>
          )}

          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Category">{item.category ?? "—"}</Row>
            {item.sub_category && <Row label="Details">{item.sub_category}</Row>}
            <Row label="Colour">
              {item.color ?? "—"}
              {item.secondary_colors && item.secondary_colors.length > 0 && (
                <span className="text-muted-foreground"> + {item.secondary_colors.join(", ")}</span>
              )}
            </Row>
            <Row label="Pattern">{item.pattern ?? "—"}</Row>
            <Row label="Good for">
              {item.occasion_tags && item.occasion_tags.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {item.occasion_tags.map((o: Occasion) => (
                    <Badge key={o} tone="rose">{occasionLabel(o)}</Badge>
                  ))}
                </span>
              ) : "—"}
            </Row>
          </dl>
        </CardContent>
      </Card>

      <AvailabilityControl
        item={item}
        onChanged={(next) => {
          setItem((cur) => ({ ...cur, availability_status: next, in_wash_since: next === "in_wash" ? new Date().toISOString() : null }));
          router.refresh();
        }}
      />

      <Button onClick={looksGood} size="full" disabled={confirming}>
        <Check className="h-4 w-4" /> {confirming ? "Saving…" : "Looks good"}
      </Button>
      <button
        onClick={() => setMode("edit")}
        className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit details
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

/** One-tap availability control for the item detail (Phase 2 state machine). */
function AvailabilityControl({
  item,
  onChanged,
}: {
  item: WardrobeItem;
  onChanged: (next: AvailabilityStatus) => void;
}) {
  const [busy, setBusy] = useState<AvailabilityStatus | null>(null);
  const current = (item.availability_status ?? "available") as AvailabilityStatus;

  async function setState(next: AvailabilityStatus) {
    if (next === current) return;
    setBusy(next);
    try {
      const res = await fetch("/api/wardrobe/laundry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_state", itemId: item.id, state: next }),
      });
      if (res.ok) {
        if (next === "in_wash") track("laundry_marked", { item_count: 1, source: "item_detail" });
        else if (next === "available") track("laundry_cleaned", { item_count: 1, source: "item_detail" });
        onChanged(next);
      }
    } catch {
      // Non-blocking — the item stays in its current state.
    } finally {
      setBusy(null);
    }
  }

  const options: { key: AvailabilityStatus; label: string }[] = [
    { key: "available", label: "Ready to wear" },
    { key: "in_wash", label: "In the wash" },
    { key: "archived", label: "Archived" },
  ];

  return (
    <div className="rounded-ww-md border border-hairline bg-bone p-3">
      <p className="ww-eyebrow text-plum">Availability</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {options.map((o) => {
          const active = current === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setState(o.key)}
              disabled={busy !== null}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-2 py-2 text-[11px] font-medium transition-colors disabled:opacity-50",
                active
                  ? o.key === "available"
                    ? "border-sage/50 bg-sage/15 text-[#5d7351]"
                    : "border-plum bg-plum text-bone"
                  : "border-hairline text-graphite hover:border-hairline-strong"
              )}
            >
              {busy === o.key ? "…" : o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-mist">
        In-wash and archived pieces stay in your wardrobe but sit out of today&apos;s suggestions.
      </p>
    </div>
  );
}
