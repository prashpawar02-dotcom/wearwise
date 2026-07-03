"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";

/**
 * Weather city — persisted to the authenticated user's own profile row
 * (profiles.city). RLS ("profiles_update_own") guarantees a user can only
 * update their own row, so no server action is needed. City is optional;
 * clearing it is allowed (stored as null → weather shows "unavailable").
 * Only the city is ever used for weather — wardrobe data is never involved.
 */
const MAX_LEN = 80;

export function WeatherCityCard({ initialCity }: { initialCity: string | null }) {
  const [city, setCity] = useState(initialCity ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function save() {
    setStatus("saving");
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus("error"); setError("Please sign in again."); return; }

    const trimmed = city.trim().slice(0, MAX_LEN);
    const { error: upErr } = await supabase
      .from("profiles")
      .update({ city: trimmed || null })
      .eq("id", user.id);

    if (upErr) { setStatus("error"); setError("Couldn't save your city. Please try again."); return; }
    setCity(trimmed);
    setStatus("saved");
  }

  return (
    <section className="rounded-ww-lg border border-hairline bg-bone p-4 shadow-ww-sm">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-plum/[0.08]">
          <Icon.Sun className="h-4 w-4 text-plum" />
        </span>
        <div>
          <h2 className="font-serif text-lg leading-tight text-charcoal">Weather city</h2>
          <p className="text-sm text-graphite">WearWise uses your city to make outfit advice more practical.</p>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="weather-city" className="text-sm font-medium text-foreground/80">City</label>
        <input
          id="weather-city"
          type="text"
          inputMode="text"
          maxLength={MAX_LEN}
          value={city}
          onChange={(e) => {
            setCity(e.target.value.replace(/[\r\n]+/g, ""));
            if (status !== "idle") setStatus("idle");
          }}
          placeholder="e.g. Pune"
          aria-label="Weather city"
          className="mt-1.5 h-11 w-full rounded-ww-sm border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {status === "saved" && (
        <p className="mt-2 flex items-center gap-1.5 rounded-ww-sm border border-sage/30 bg-sage/10 p-2 text-xs text-[#5d7351]">
          <Icon.Check className="h-3.5 w-3.5 shrink-0" /> City updated. Weather advice will use this city.
        </p>
      )}

      <Button onClick={save} size="full" className="mt-3" disabled={status === "saving"}>
        {status === "saving" ? "Saving…" : "Save city"}
      </Button>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-graphite">
        <Icon.Lock className="h-3 w-3 shrink-0" /> Only your city is used for weather. Your wardrobe stays private.
      </p>
    </section>
  );
}
