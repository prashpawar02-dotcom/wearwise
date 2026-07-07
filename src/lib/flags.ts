// =====================================================================
// WearWise — feature flags (Admin Control Panel backing store).
// SERVER-ONLY: reads via the service-role client (RLS hides flags from
// non-admin sessions). Cached in-module for FLAG_TTL_MS so hot paths pay
// ~zero DB cost. Fail-safe: if the table is unreachable, DEFAULTS apply,
// so a flags outage can never take the product down.
// =====================================================================
import { createAdminClient } from "@/lib/supabase-admin";

export type GenerationMode = "auto" | "human";

export interface Flags {
  "daily_drop.mode": GenerationMode;
  "daily_drop.enabled": boolean;
  "occasions.mode": GenerationMode;
  "occasions.enabled": boolean;
  "manual_analysis.mode": GenerationMode;
  "manual_analysis.enabled": boolean;
  "swaps.enabled": boolean;
  "share_vote.enabled": boolean;
  "notifications.enabled": boolean;
  "referral.enabled": boolean;
  "billing.enabled": boolean;
  /** Master switch: rules-only, every live LLM call paused. */
  eco_mode: boolean;
  /** Global LLM spend ceiling per day (INR, estimated). */
  "ai.daily_budget": number;
  /** Per-user live LLM call ceiling per day. */
  "ai.per_user_daily_cap": number;
}

export const FLAG_DEFAULTS: Flags = {
  "daily_drop.mode": "auto",
  "daily_drop.enabled": true,
  "occasions.mode": "auto",
  "occasions.enabled": true,
  "manual_analysis.mode": "auto",
  "manual_analysis.enabled": true,
  "swaps.enabled": true,
  "share_vote.enabled": true,
  "notifications.enabled": true,
  "referral.enabled": true,
  "billing.enabled": true,
  eco_mode: false,
  "ai.daily_budget": 200,
  "ai.per_user_daily_cap": 10,
};

export const FLAG_KEYS = Object.keys(FLAG_DEFAULTS) as (keyof Flags)[];

const FLAG_TTL_MS = 30_000;

let cache: { flags: Flags; at: number } | null = null;

/** Read all flags (cached ~30s). Unknown/missing keys fall back to defaults. */
export async function getFlags(): Promise<Flags> {
  if (cache && Date.now() - cache.at < FLAG_TTL_MS) return cache.flags;
  const flags: Flags = { ...FLAG_DEFAULTS };
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("feature_flags").select("key, value");
    for (const row of data ?? []) {
      const k = row.key as keyof Flags;
      if (k in FLAG_DEFAULTS && typeof row.value === typeof FLAG_DEFAULTS[k]) {
        (flags as unknown as Record<string, unknown>)[k] = row.value;
      }
    }
  } catch {
    // fall back to defaults — flags must never crash a request
  }
  cache = { flags, at: Date.now() };
  return flags;
}

/** Force the next getFlags() to re-read (used after an admin write). */
export function invalidateFlags(): void {
  cache = null;
}

/** Service-role write; caller MUST have verified is_admin first. */
export async function setFlag(key: keyof Flags, value: Flags[keyof Flags], updatedBy: string): Promise<boolean> {
  if (!(key in FLAG_DEFAULTS)) return false;
  if (typeof value !== typeof FLAG_DEFAULTS[key]) return false;
  const admin = createAdminClient();
  const { error } = await admin.from("feature_flags").upsert({
    key,
    value,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (!error) invalidateFlags();
  return !error;
}
