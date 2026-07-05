"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

/**
 * Daily Outfit Drop preferences — PERSISTED to the authenticated user's own
 * profile row (migration 0008). RLS ("profiles_update_own") guarantees a user
 * can only update their own row, so no server action is needed.
 *
 * IMPORTANT — this saves PREFERENCES ONLY. Nothing reads these columns to send
 * a notification yet. The banner keeps that honest. Only preference fields are
 * written; wardrobe data is never involved.
 *
 * Drop time uses preset chips + a WearWise-controlled custom picker (hour /
 * minute / AM-PM) rather than a native <input type="time">, which rendered
 * inconsistently (seconds, locale AM/PM) and produced values our HH:MM
 * validation rejected. The custom controls always emit a clean 24-hour HH:MM.
 */
const TIME_PRESETS = ["06:30", "07:00", "07:30", "08:00", "08:30", "09:00"];

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri (0=Sun..6=Sat)

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 0..59

type DaysMode = "every" | "weekdays";
type Meridiem = "AM" | "PM";

const HHMM = /^\d{2}:\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${period}`;
}

/**
 * Normalise a Postgres time ('07:30' or '07:30:00') to a 24-hour 'HH:MM'.
 * Preserves ANY valid time (including custom values outside the presets); only
 * falls back to a default when the stored value is missing/malformed.
 */
function toHHMM(value: string | null | undefined): string {
  const hhmm = (value ?? "").slice(0, 5);
  return HHMM.test(hhmm) ? hhmm : "07:30";
}

/** 12-hour parts -> 24-hour 'HH:MM' (12 AM -> 00, 12 PM -> 12). */
function to24(hour12: number, minute: number, meridiem: Meridiem): string {
  let h = hour12 % 12; // 12 -> 0
  if (meridiem === "PM") h += 12; // PM -> 12..23
  return `${pad2(h)}:${pad2(minute)}`;
}

/** 24-hour 'HH:MM' -> 12-hour parts for the custom dropdowns. */
function from24(hhmm: string): { hour12: number; minute: number; meridiem: Meridiem } {
  const [H, M] = hhmm.split(":").map(Number);
  const hour = Number.isNaN(H) ? 7 : H;
  const minute = Number.isNaN(M) ? 30 : M;
  const meridiem: Meridiem = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return { hour12, minute, meridiem };
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
  const router = useRouter();
  const initialTime = toHHMM(initial.time);
  const initParts = from24(initialTime);

  const [enabled, setEnabled] = useState(initial.enabled);
  const [time, setTime] = useState(initialTime); // source of truth, 24h HH:MM
  // If the saved time isn't one of the presets, start in Custom mode showing it.
  const [isCustom, setIsCustom] = useState(!TIME_PRESETS.includes(initialTime));
  const [hour12, setHour12] = useState(initParts.hour12);
  const [minute, setMinute] = useState(initParts.minute);
  const [meridiem, setMeridiem] = useState<Meridiem>(initParts.meridiem);
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

  function selectPreset(t: string) {
    setTime(t);
    setIsCustom(false);
    const p = from24(t);
    setHour12(p.hour12);
    setMinute(p.minute);
    setMeridiem(p.meridiem);
    touched();
  }

  function enterCustom() {
    // Seed the dropdowns from the currently selected time.
    const p = from24(time);
    setHour12(p.hour12);
    setMinute(p.minute);
    setMeridiem(p.meridiem);
    setIsCustom(true);
    touched();
  }

  function updateCustom(next: Partial<{ hour12: number; minute: number; meridiem: Meridiem }>) {
    const h = next.hour12 ?? hour12;
    const m = next.minute ?? minute;
    const mer = next.meridiem ?? meridiem;
    setHour12(h);
    setMinute(m);
    setMeridiem(mer);
    setTime(to24(h, m, mer));
    touched();
  }

  async function save() {
    const validTime = HHMM.test(time);
    // A drop time is required when Daily Drop is on; when off it may stay as-is.
    if (enabled && !validTime) {
      setStatus("error");
      setError("Please choose a valid drop time.");
      return;
    }

    setStatus("saving");
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus("error"); setError("Please sign in again."); return; }

    // Capture the browser's timezone silently so a future local-time drop fires
    // at the right moment. Refreshed on every save; null-safe.
    const timezone = resolveBrowserTimezone();

    // Update the user's OWN row and read it back to CONFIRM the write. We only
    // report success when the DB returns the updated row.
    const { data: saved, error: upErr } = await supabase
      .from("profiles")
      .update({
        daily_drop_enabled: enabled,
        daily_drop_days: daysMode === "every" ? EVERY_DAY : WEEKDAYS,
        show_quiet_gems: quietGems,
        weather_advice_enabled: weatherAdvice,
        // Only write the time when it's valid; otherwise preserve the stored value.
        ...(validTime ? { daily_drop_time: time } : {}),
        ...(timezone ? { timezone } : {}),
      })
      .eq("id", user.id)
      .select("daily_drop_enabled, daily_drop_time, daily_drop_days, show_quiet_gems, weather_advice_enabled")
      .single();

    const row = saved as {
      daily_drop_enabled: boolean;
      daily_drop_time: string | null;
      daily_drop_days: number[] | null;
      show_quiet_gems: boolean;
      weather_advice_enabled: boolean;
    } | null;

    if (upErr || !row) {
      setStatus("error");
      setError("We couldn't save your Daily Drop preferences. Please try again.");
      return;
    }

    // Rehydrate local state from the authoritative saved row so what the user
    // sees matches the database exactly (custom time included).
    const savedTime = toHHMM(row.daily_drop_time);
    const parts = from24(savedTime);
    setEnabled(Boolean(row.daily_drop_enabled));
    setTime(savedTime);
    setIsCustom(!TIME_PRESETS.includes(savedTime));
    setHour12(parts.hour12);
    setMinute(parts.minute);
    setMeridiem(parts.meridiem);
    setDaysMode(toDaysMode(row.daily_drop_days));
    setQuietGems(Boolean(row.show_quiet_gems));
    setWeatherAdvice(Boolean(row.weather_advice_enabled));

    if (process.env.NODE_ENV !== "production") {
      // Dev-only sanity check (no secrets, no user id).
      console.log("[daily-drop] saved", { enabled: row.daily_drop_enabled, time: row.daily_drop_time });
    }

    // Non-sensitive preference snapshot (booleans + mode only).
    track("daily_drop_preferences_saved", {
      enabled: Boolean(row.daily_drop_enabled),
      days_mode: (row.daily_drop_days?.length ?? 7) >= 7 ? "every_day" : "weekdays",
      weather_advice_enabled: Boolean(row.weather_advice_enabled),
      quiet_gems_enabled: Boolean(row.show_quiet_gems),
      custom_time: !TIME_PRESETS.includes(toHHMM(row.daily_drop_time)),
    });

    setStatus("saved");
    // Keep server-rendered profile props in sync for the next navigation.
    router.refresh();
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
      <div className={cn("mt-3 transition-opacity", !enabled && "opacity-60")}>
        {/* Drop time — presets + custom hour/minute/AM-PM */}
        <div className="border-b border-stone py-3">
          <p className="text-sm text-charcoal">Drop time</p>
          <p className="text-[11px] text-mist">Choose when WearWise should prepare your outfit.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TIME_PRESETS.map((t) => (
              <TimeChip key={t} active={!isCustom && time === t} onClick={() => selectPreset(t)}>
                {formatTime(t)}
              </TimeChip>
            ))}
            <TimeChip active={isCustom} onClick={enterCustom}>Custom</TimeChip>
          </div>

          {isCustom && (
            <>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <select
                  value={hour12}
                  onChange={(e) => updateCustom({ hour12: Number(e.target.value) })}
                  aria-label="Hour"
                  className="h-11 rounded-ww-sm border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {HOURS.map((h) => <option key={h} value={h}>{pad2(h)}</option>)}
                </select>
                <span aria-hidden="true" className="text-graphite">:</span>
                <select
                  value={minute}
                  onChange={(e) => updateCustom({ minute: Number(e.target.value) })}
                  aria-label="Minute"
                  className="h-11 rounded-ww-sm border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {MINUTES.map((m) => <option key={m} value={m}>{pad2(m)}</option>)}
                </select>
                <div className="flex rounded-full border border-hairline p-0.5">
                  {(["AM", "PM"] as const).map((mer) => (
                    <button
                      key={mer}
                      type="button"
                      aria-pressed={meridiem === mer}
                      onClick={() => updateCustom({ meridiem: mer })}
                      className={cn(
                        "min-h-[36px] rounded-full px-3.5 text-xs font-medium transition-colors",
                        meridiem === mer ? "bg-charcoal text-bone" : "text-graphite"
                      )}
                    >
                      {mer}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-mist">Custom time is useful while we test scheduled preparation.</p>
            </>
          )}
        </div>

        <div className="divide-y divide-stone">
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
      </div>

      {/* Timezone — detected from the browser, saved silently on save */}
      <p className="mt-3 text-[11px] leading-relaxed text-mist">
        {detectedTz ? (
          <>Timezone: <span className="text-graphite">{detectedTz}</span> &middot; Used to prepare your outfit at the right local time.</>
        ) : (
          <>Timezone will be set when available from your browser.</>
        )}
      </p>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      {status === "saved" && (
        <p className="mt-3 flex items-center gap-1.5 rounded-ww-sm border border-sage/30 bg-sage/10 p-2 text-xs text-[#5d7351]">
          <Icon.Check className="h-3.5 w-3.5 shrink-0" /> Daily Outfit Drop preferences saved.
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

function TimeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-[36px] rounded-full border px-3 text-xs font-medium transition-colors",
        active ? "border-charcoal bg-charcoal text-bone" : "border-hairline text-graphite hover:bg-stone/40"
      )}
    >
      {children}
    </button>
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
