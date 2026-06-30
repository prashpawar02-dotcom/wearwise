"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Icon, type IconProps } from "@/components/ui/Icon";
import { OCCASIONS, type Occasion } from "@/lib/types";
import { cn } from "@/lib/utils";

const OCCASION_ICON: Record<Occasion, (props: IconProps) => React.JSX.Element> = {
  work: Icon.Briefcase,
  casual: Icon.Coffee,
  dinner_date: Icon.Wine,
  family_function: Icon.Sparkle,
  travel: Icon.Plane,
  ethnic: Icon.Sparkle,
  festive: Icon.Sparkle,
  party: Icon.Sparkle,
  college: Icon.GraduationCap,
};

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
        <div className="flex items-start gap-2 rounded-ww-md border border-champagne/30 bg-champagne/[0.12] p-3 text-sm text-[#8a6a3e]">
          <Icon.Sparkle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Tip: add at least 10 items for richer ideas. You have {itemCount}.</span>
        </div>
      )}

      <div className="space-y-3">
        <Label>Occasion</Label>
        <div className="grid grid-cols-2 gap-2.5">
          {OCCASIONS.map((o) => {
            const selected = occasion === o.value;
            const OIcon = OCCASION_ICON[o.value] ?? Icon.Sparkle;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setOccasion(o.value)}
                className={cn(
                  "relative min-h-[112px] rounded-ww-md border p-3.5 text-left transition-colors",
                  selected
                    ? "border-charcoal bg-charcoal text-bone"
                    : "border-hairline bg-bone text-charcoal hover:border-hairline-strong"
                )}
              >
                <span
                  className={cn(
                    "mb-3.5 grid h-8 w-8 place-items-center rounded-ww-xs",
                    selected ? "bg-bone/10 text-bone" : "bg-ivory text-plum"
                  )}
                >
                  <OIcon className="h-4 w-4" />
                </span>
                <span className="block text-sm font-medium">{o.label}</span>
                <span className={cn("mt-0.5 block text-[11px] leading-snug", selected ? "text-bone/60" : "text-graphite")}>
                  {o.hint}
                </span>
                {selected && (
                  <span className="absolute right-3 top-3 grid h-[18px] w-[18px] place-items-center rounded-full bg-champagne">
                    <Icon.Check className="h-2.5 w-2.5 text-charcoal" />
                  </span>
                )}
              </button>
            );
          })}
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
        {saving ? "Sending…" : (
          <>Find my outfit <Icon.ArrowRight className="h-4 w-4" /></>
        )}
      </Button>
    </div>
  );
}
