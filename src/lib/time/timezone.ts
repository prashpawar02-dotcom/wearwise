// =====================================================================
// WearWise — timezone resolution (pure; server + test safe)
// Extracted from daily-drop.ts so it can be unit-tested without the
// next/headers import chain. Normalizes legacy IANA alias names (e.g. the
// backward link "Asia/Calcutta" → "Asia/Kolkata") BEFORE validating, so a
// perfectly valid stored zone never triggers a false fallback warning. We
// NEVER persist the normalized value here — this is read-time resolution only.
// =====================================================================

/** Launch-market default when no valid saved zone exists. */
export const DEFAULT_TZ = "Asia/Kolkata";

/** Legacy tz link names → canonical zone (read-time only, never written back). */
const TZ_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
};

/** Map a legacy alias to its canonical zone; pass through everything else. */
export function normalizeTimeZone(tz: string | null | undefined): string | null | undefined {
  if (!tz) return tz;
  return TZ_ALIASES[tz] ?? tz;
}

/** True if `tz` is a zone the runtime's Intl understands. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a usable timezone. A valid (or legacy-alias) saved zone is used as-is
 * (canonicalized); otherwise we fall back to DEFAULT_TZ and flag `usedFallback`
 * so callers can surface an honest warning. Never guesses from city.
 */
export function resolveTimezone(tz: string | null | undefined): { timeZone: string; usedFallback: boolean } {
  const norm = normalizeTimeZone(tz);
  if (norm && isValidTimeZone(norm)) return { timeZone: norm, usedFallback: false };
  return { timeZone: DEFAULT_TZ, usedFallback: true };
}

/** The user's LOCAL calendar date ('YYYY-MM-DD') for a timezone. */
export function localDateISO(timezone: string | null | undefined, now: Date = new Date()): string {
  const { timeZone } = resolveTimezone(timezone);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Public alias of localDateISO (kept for existing import sites). */
export function userLocalDate(timezone: string | null | undefined, now: Date = new Date()): string {
  return localDateISO(timezone, now);
}
