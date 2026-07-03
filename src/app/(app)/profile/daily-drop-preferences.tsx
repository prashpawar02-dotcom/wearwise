"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * Daily Outfit Drop preferences — PERSISTED to the authenticated user's own
 * profile row (migration 0008). RLS ("profiles_update_own") guarantees a user
 * can only update their own row, so no server action is needed.
 *
 * IMPORTANT — this saves PREFERENCES ONLY. Nothing reads these columns to send
 * a notification or prepare a drop yet. The banner keeps that honest: choices
 * are saved, but delivery is not live. Only preference fields are written;
 * wardrobe data is never involved.
 */
const TIME_OPTIONS = ["06:30", "07:00", "07:30", "08:00", "08:30", "09:00"];

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri (0=Sun..6=Sat)

type DaysMode = "every" | "weekdays";

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Normalise a Postgres time ('07:30' or '07:30:00') to an 'HH:MM' option. */
function toHHMM(value: string | null | undefined): string {
  const hhmm = (value ?? "07:30").slice(0, 5);
  return TIME_OPTIONS.includes(hhmm) ? hhmm : "07:30";
}

/** Decide the days toggle from a stored day array (7 days => every, else weekdays). */
function toDaysMode(days: number[] | null | undefined): DaysMode {
  return (days?.length ?? 7) >= 7 ? "every" : "weekdays";
}

/** Best-effort IANA timezone from the browser (e.g. 'Asia/Kolkata'); null if unavailable. */
function resolveBrowserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export interface DailyDropPrefsInput {
  enabled: boolean;
  time: string | null;
  days: number[] | null;
  quietGems: boolean;
  weatherAdvice: boolean;
}

export function DailyDropPreferences({ initial }: { initial: DailyDropPrefsInput }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [time, setTime] = useState(toHHMM(initial.time));
  const [daysMode, setDaysMode] = useState<DaysMode>(toDaysMode(initial.days));
  const [quietGems, setQuietGems] = useState(initial.quietGems);
  const [weatherAdvice, setWeatherAdvice] = useState(initial.weatherAdvice);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  // Resolved after mount to avoid an SSR/client hydration mismatch (the server
  // has no browser timezone). Null until the browser reports one.
  const [detectedTz, setDetectedTz] = useState<string | null>(null);

  useEffect(() => {
    setDetectedTz(resolveBrowserTimezone());
  }, []);

  function touched() {
    if (status !== "idle") setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus("error"); setError("Please sign in again."); return; }

    // Capture the browser's timezone silently so a future local-time drop
    // fires at the right moment. Refreshed on every save (authoritative for
    // where the user is now); falls back to null if the browser can't resolve.
    const timezone = resolveBrowserTimezone();

    const { error: upErr } = await supabase
      .from("profiles")
      .update({
        daily_drop_enabled: enabled,
        daily_drop_time: time,
        daily_drop_days: daysMode === "every" ? EVERY_DAY : WEEKDAYS,
        show_quiet_gems: quietGems,
        weather_advice_enabled: weatherAdvice,
        ...(timezone ? { timezone } : {}),
      })
      .eq("id", user.id);

    if (upErr) { setStatus("error"); setError("Couldn't save your preferences. Please try again."); return; }
    setStatus("saved");
  }

  return (
    <section className="rounded-ww-lg border border-hairline bg-bone p-4 shadow-ww-sm">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-champagne/15">
          <Icon.Sparkle className="h-4 w-4 text-champagne" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg leading-tight text-charcoal">Daily Outfit Drop</h2>
          <p className="text-sm text-graphite">Get one smart outfit prepared for your morning.</p>
        </div>
        {/* Master opt-in */}
        <Toggle on={enabled} onChange={(v) => { setEnabled(v); touched(); }} label="Enable Daily Outfit Drop" />
      </div>

      {/* Honest status banner — preferences save, but delivery is not live yet */}
      <div className="mt-3 flex items-start gap-2 rounded-ww-sm border border-champagne/30 bg-champagne/[0.1] p-2.5 text-xs text-[#8a6a3e]">
        <Icon.Sparkle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Your preferences are saved. Morning delivery isn&apos;t live yet — we&apos;ll use these when it turns on.</span>
      </div>

      {/* Settings */}
      <div className={cn("mt-3 divide-y divide-stone transition-opacity", !enabled && "opacity-60")}>
        <SettingRow label="Send my outfit at">
          <select
            value={time}
            onChange={(e) => { setTime(e.target.value); touched(); }}
            aria-label="Send my outfit at"
            className="h-11 rounded-ww-sm border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>{formatTime(t)}</option>
            ))}
          </select>
        </SettingRow>

        <SettingRow label="Days">
          <div className="flex rounded-full border border-hairline p-0.5">
            {(["every", "weekdays"] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={daysMode === d}
                onClick={() => { setDaysMode(d); touched(); }}
                className={cn(
                  "min-h-[36px] rounded-full px-3 text-xs font-medium transition-colors",
                  daysMode === d ? "bg-charcoal text-bone" : "text-graphite"
                )}
              >
                {d === "every" ? "Every day" : "Weekdays"}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="Include quiet gems" hint="Resurface pieces you haven't worn in a while">
          <Toggle on={quietGems} onChange={(v) => { setQuietGems(v); touched(); }} label="Include quiet gems" />
        </SettingRow>

        <SettingRow label="Include weather advice" hint="Uses your saved city">
          <Toggle on={weatherAdvice} onChange={(v) => { setWeatherAdvice(v); touched(); }} label="Include weather advice" />
        </SettingRow>
      </div>

      {/* Timezone — detected from the browser, saved silently on save */}
      <p className="mt-3 text-[11px] leading-relaxed text-mist">
        {detectedTz ? (
          <>Timezone: <span className="text-graphite">{detectedTz}</span> · Used to prepare your outfit at the right local time.</>
        ) : (
          <>Timezone will be set when available from your browser.</>
        )}
      </p>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      {status === "saved" && (
        <p className="mt-3 flex items-center gap-1.5 rounded-ww-sm border border-sage/30 bg-sage/10 p-2 text-xs text-[#5d7351]">
          <Icon.Check className="h-3.5 w-3.5 shrink-0" /> Preferences saved.
        </p>
      )}

      <Button onClick={save} size="full" className="mt-3" disabled={status === "saving"}>
        {status === "saving" ? "Saving…" : "Save preferences"}
      </Button>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-graphite">
        <Icon.Lock className="h-3 w-3 shrink-0" /> Notifications stay private. Wardrobe photos are never public.
      </p>
    </section>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm text-charcoal">{label}</p>
        {hint && <p className="text-[11px] text-mist">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on ? "bg-sage" : "bg-mist/40"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0.5 h-6 w-6 rounded-full bg-bone shadow-ww-sm transition-all",
          on ? "left-[22px]" : "left-0.5"
        )}
      />
    </button>
  );
}
