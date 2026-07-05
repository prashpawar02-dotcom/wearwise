"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

const AGE_RANGES = ["22-25", "26-30", "31-35", "36-40"];
const STYLES = ["Minimal", "Traditional", "Bold", "Elegant", "Trendy", "Comfort-first"];

export function OnboardingForm({
  initial,
}: {
  initial: { full_name: string; age_range: string; city: string; style_preferences: string[] };
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.full_name);
  const [ageRange, setAgeRange] = useState(initial.age_range);
  const [city, setCity] = useState(initial.city);
  const [styles, setStyles] = useState<string[]>(initial.style_preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleStyle(s: string) {
    setStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        age_range: ageRange || null,
        city: city || null,
        style_preferences: styles,
        onboarded: true,
      })
      .eq("id", user.id);

    if (error) {
      setError("We couldn't save your details. Please try again in a moment.");
      setSaving(false);
    } else {
      // Non-sensitive: whether a city was given + how many style tags (no values).
      track("onboarding_completed", {
        city_present: Boolean(city.trim()),
        style_preferences_count: styles.length,
      });
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="First name" />
      </div>

      <div className="space-y-2">
        <Label>Age range</Label>
        <div className="grid grid-cols-4 gap-2">
          {AGE_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setAgeRange(r)}
              className={cn(
                "rounded-lg border px-2 py-2.5 text-sm transition-colors",
                ageRange === r ? "border-plum bg-plum/10 text-plum" : "border-border bg-card"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="city">City</Label>
        <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Pune" />
      </div>

      <div className="space-y-2">
        <Label>Your style (pick any)</Label>
        <div className="flex flex-wrap gap-2">
          {STYLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStyle(s)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                styles.includes(s) ? "border-rose bg-rose/15 text-plum" : "border-border bg-card"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" size="full" disabled={saving}>
        {saving ? "Saving…" : "Save & continue"}
      </Button>
    </form>
  );
}
