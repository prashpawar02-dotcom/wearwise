"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * Daily Outfit Drop — PREVIEW ONLY.
 * These controls have local state so the surface feels real, but nothing is
 * persisted and no notifications are sent. The banner keeps that honest. When
 * delivery is built later, this is where the saved preferences will live.
 */
const TIME_OPTIONS = ["06:30", "07:00", "07:30", "08:00", "08:30", "09:00"];

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function DailyDropPreferences() {
  const [time, setTime] = useState("07:30");
  const [days, setDays] = useState<"every" | "weekdays">("every");
  const [quietGems, setQuietGems] = useState(true);

  return (
    <section className="rounded-ww-lg border border-hairline bg-bone p-4 shadow-ww-sm">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-champagne/15">
          <Icon.Sparkle className="h-4 w-4 text-champagne" />
        </span>
        <div>
          <h2 className="font-serif text-lg leading-tight text-charcoal">Daily Outfit Drop</h2>
          <p className="text-sm text-graphite">Get one smart outfit prepared for your morning.</p>
        </div>
      </div>

      {/* Honest preview banner — never pretend notifications are live */}
      <div className="mt-3 flex items-start gap-2 rounded-ww-sm border border-champagne/30 bg-champagne/[0.1] p-2.5 text-xs text-[#8a6a3e]">
        <Icon.Sparkle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Preferences preview — notification delivery coming soon. Choices here aren&apos;t saved yet.</span>
      </div>

      {/* Settings */}
      <div className="mt-3 divide-y divide-stone">
        <SettingRow label="Send my outfit at">
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
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
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                className={cn(
                  "min-h-[36px] rounded-full px-3 text-xs font-medium transition-colors",
                  days === d ? "bg-charcoal text-bone" : "text-graphite"
                )}
              >
                {d === "every" ? "Every day" : "Weekdays"}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="Include quiet gems" hint="Resurface pieces you haven't worn in a while">
          <Toggle on={quietGems} onChange={setQuietGems} label="Include quiet gems" />
        </SettingRow>

        <SettingRow label="Include weather advice" hint="Available once weather is wired">
          <span className="rounded-full bg-stone px-2.5 py-1 text-[11px] font-medium text-graphite">Coming soon</span>
        </SettingRow>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-graphite">
        WearWise will prepare one outfit from your wardrobe before your day starts.
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-graphite">
        <Icon.Lock className="h-3 w-3" /> Notifications stay private. Wardrobe photos are never public.
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
        "relative h-7 w-12 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
