"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function WornTodayButton({ suggestionId, itemIds }: { suggestionId: string; itemIds: string[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

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

    setDone(true);
    setSaving(false);
    router.refresh();
  }

  return (
    <Button onClick={save} disabled={saving || done} className="flex-1" variant={done ? "secondary" : "default"}>
      {done ? (<><Check className="h-4 w-4" /> Worn today</>) : saving ? "Saving…" : "Wear this today"}
    </Button>
  );
}
