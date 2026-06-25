"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OCCASIONS, type Occasion } from "@/lib/types";
import { cn } from "@/lib/utils";

export function OccasionForm({ itemCount }: { itemCount: number }) {
  const router = useRouter();
  const [occasion, setOccasion] = useState<Occasion | "">("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const lowWardrobe = itemCount < 10;

  async function submit() {
    if (!occasion) { setError("Please choose an occasion."); return; }
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data, error } = await supabase
      .from("outfit_requests")
      .insert({ user_id: user.id, occasion, notes: notes || null, status: "pending" })
      .select("id")
      .single();

    if (error) { setError(error.message); setSaving(false); return; }
    router.push(`/outfits/${data.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {lowWardrobe && (
        <div className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm">
          Tip: add at least 10 items for richer ideas. You have {itemCount}.
        </div>
      )}

      <div className="space-y-2">
        <Label>Occasion</Label>
        <div className="grid grid-cols-2 gap-2.5">
          {OCCASIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setOccasion(o.value)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                occasion === o.value ? "border-plum bg-plum/10" : "border-border bg-card"
              )}
            >
              <span className="block font-medium">{o.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Anything specific? (optional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. outdoor event, warm weather, prefer something traditional"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={submit} size="full" disabled={saving}>
        {saving ? "Sending…" : "Request outfit ideas"}
      </Button>
    </div>
  );
}
