"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Flags, GenerationMode } from "@/lib/flags";

/** Feature groups: generation features get the Auto/Human/Off tri-state. */
const GENERATION_FEATURES: { label: string; modeKey: keyof Flags; enabledKey: keyof Flags }[] = [
  { label: "Daily Drop", modeKey: "daily_drop.mode", enabledKey: "daily_drop.enabled" },
  { label: "Occasions", modeKey: "occasions.mode", enabledKey: "occasions.enabled" },
  { label: "Manual Analysis", modeKey: "manual_analysis.mode", enabledKey: "manual_analysis.enabled" },
];

const SWITCH_FEATURES: { label: string; key: keyof Flags }[] = [
  { label: "Swaps & another option", key: "swaps.enabled" },
  { label: "Share / friend vote", key: "share_vote.enabled" },
  { label: "Notifications", key: "notifications.enabled" },
  { label: "Referral", key: "referral.enabled" },
  { label: "Billing / upgrades", key: "billing.enabled" },
];

const NUMBER_FLAGS: { label: string; key: keyof Flags; suffix: string }[] = [
  { label: "Global AI budget / day", key: "ai.daily_budget", suffix: "₹" },
  { label: "Per-user AI calls / day", key: "ai.per_user_daily_cap", suffix: "calls" },
];

export function ControlsBoard({ initial }: { initial: Flags }) {
  const [flags, setFlags] = useState<Flags>(initial);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function save(key: keyof Flags, value: Flags[keyof Flags]) {
    setBusyKey(key);
    setError("");
    const prev = flags;
    setFlags({ ...flags, [key]: value });
    try {
      const resp = await fetch("/api/admin/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const json = (await resp.json()) as { status: string; flags?: Flags };
      if (json.status !== "ok") throw new Error();
      if (json.flags) setFlags(json.flags);
    } catch {
      setFlags(prev);
      setError("Couldn't save that change — try again.");
    } finally {
      setBusyKey(null);
    }
  }

  /** Tri-state for a generation feature: off | human | auto. */
  function triState(modeKey: keyof Flags, enabledKey: keyof Flags): "off" | "human" | "auto" {
    if (!flags[enabledKey]) return "off";
    return (flags[modeKey] as GenerationMode) === "human" ? "human" : "auto";
  }

  async function setTriState(modeKey: keyof Flags, enabledKey: keyof Flags, next: "off" | "human" | "auto") {
    if (next === "off") {
      await save(enabledKey, false);
      return;
    }
    if (!flags[enabledKey]) await save(enabledKey, true);
    await save(modeKey, next);
  }

  const stateStyles: Record<string, string> = {
    auto: "bg-sage/20 text-sage border-sage/40",
    human: "bg-amber-100 text-amber-700 border-amber-300",
    off: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="mt-5 space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Eco mode master switch */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Eco mode</p>
            <p className="text-xs text-muted-foreground">Rules-engine only — every live AI call paused.</p>
          </div>
          <button
            disabled={busyKey === "eco_mode"}
            onClick={() => save("eco_mode", !flags.eco_mode)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              flags.eco_mode ? "border-sage/40 bg-sage/20 text-sage" : "border-border bg-muted text-muted-foreground"
            )}
          >
            {flags.eco_mode ? "ON" : "OFF"}
          </button>
        </div>
      </section>

      {/* Generation features: Auto / Human / Off */}
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Generation features</p>
        <div className="space-y-3">
          {GENERATION_FEATURES.map((f) => {
            const state = triState(f.modeKey, f.enabledKey);
            return (
              <div key={f.label} className="flex items-center justify-between gap-3">
                <span className="text-sm">{f.label}</span>
                <div className="flex overflow-hidden rounded-full border border-border">
                  {(["auto", "human", "off"] as const).map((s) => (
                    <button
                      key={s}
                      disabled={busyKey === f.modeKey || busyKey === f.enabledKey}
                      onClick={() => setTriState(f.modeKey, f.enabledKey, s)}
                      className={cn(
                        "px-3 py-1 text-xs font-medium capitalize transition-colors",
                        state === s ? stateStyles[s] : "bg-card text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* On/off kill-switches */}
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Kill-switches</p>
        <div className="space-y-3">
          {SWITCH_FEATURES.map((f) => {
            const on = Boolean(flags[f.key]);
            return (
              <div key={f.key} className="flex items-center justify-between">
                <span className="text-sm">{f.label}</span>
                <button
                  disabled={busyKey === f.key}
                  onClick={() => save(f.key, !on)}
                  className={cn(
                    "rounded-full border px-4 py-1 text-xs font-medium",
                    on ? stateStyles.auto : stateStyles.off
                  )}
                >
                  {on ? "ON" : "OFF"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cost guardrails */}
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">AI cost guardrails</p>
        <div className="space-y-3">
          {NUMBER_FLAGS.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3">
              <span className="text-sm">{f.label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  defaultValue={Number(flags[f.key])}
                  onBlur={(e) => {
                    const v = Math.max(0, Math.trunc(Number(e.target.value) || 0));
                    if (v !== Number(flags[f.key])) void save(f.key, v);
                  }}
                  className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm"
                />
                <span className="text-xs text-muted-foreground">{f.suffix}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
