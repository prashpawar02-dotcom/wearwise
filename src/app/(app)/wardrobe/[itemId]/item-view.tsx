"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ItemEditor } from "./item-editor";
import { OCCASIONS, AUTOTAG_PRIVACY_COPY, type Occasion, type WardrobeItem } from "@/lib/types";
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
