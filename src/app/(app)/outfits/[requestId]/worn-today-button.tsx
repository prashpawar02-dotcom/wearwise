"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { PostWearSheet, type PostWearItem } from "@/components/wearwise/PostWearSheet";
import { track } from "@/lib/analytics";
import type { Disposition } from "@/lib/laundry";

export function WornTodayButton({
  suggestionId,
  itemIds,
  items = [],
}: {
  suggestionId: string;
  itemIds: string[];
  items?: PostWearItem[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSaving, setSheetSaving] = useState(false);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    await supabase.from("worn_history").insert({
      user_id: user.id,
      suggestion_id: suggestionId,
      item_ids: itemIds,
    });
    // Update "last worn" on each item.
    await supabase
      .from("wardrobe_items")
      .update({ last_worn_at: new Date().toISOString().slice(0, 10) })
      .in("id", itemIds);

    track("outfit_worn", { source: "occasion", item_count: itemIds.length });
    setDone(true);
    setSaving(false);

    // Post-wear laundry sheet (Phase 2) — quietly resolve where each piece goes.
    if (items.length > 0) setSheetOpen(true);
    else router.refresh();
  }

  async function persistPostWear(dispositions: Record<string, Disposition>, opts?: { askMeLess?: boolean }) {
    setSheetSaving(true);
    try {
      await fetch("/api/wardrobe/laundry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "postwear",
          dispositions: items.map((it) => ({ itemId: it.id, to: dispositions[it.id] ?? "wardrobe" })),
        }),
      });
      const washed = Object.values(dispositions).filter((d) => d === "wash").length;
      track("postwear_sheet_completed", {
        item_count: items.length,
        washed_count: washed,
        wardrobe_count: items.length - washed,
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
      // Non-blocking — the outfit is already logged worn.
    } finally {
      setSheetSaving(false);
      setSheetOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button onClick={save} disabled={saving || done} className="flex-1" variant={done ? "secondary" : "default"}>
        {done ? (<><Check className="h-4 w-4" /> Worn today</>) : saving ? "Saving…" : "Wear this today"}
      </Button>

      <PostWearSheet
        open={sheetOpen}
        saving={sheetSaving}
        items={items}
        onDone={(d) => persistPostWear(d)}
        onAskMeLess={(d) => persistPostWear(d, { askMeLess: true })}
        onDismiss={() => {
          track("postwear_sheet_dismissed", { item_count: items.length });
          setSheetOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
