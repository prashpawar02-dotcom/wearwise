// =====================================================================
// WearWise — canonical occasion resolution (Phase 4 hotfix, locked decision 3)
// Single source of truth for "which occasion profile does this recommendation
// run under?" Used by Today generation, regeneration, and every swap surface so
// they all reason under the SAME authoritative occasion profile.
// =====================================================================
import { DEFAULT_OCCASION_PROFILES } from "@/lib/engine/config";
import type { EngineOccasion } from "@/lib/engine/types";

/** True when a string is a supported engine occasion. */
export function isEngineOccasion(v: string | null | undefined): v is EngineOccasion {
  return !!v && Object.prototype.hasOwnProperty.call(DEFAULT_OCCASION_PROFILES, (v ?? "").toLowerCase());
}

/**
 * Locked decision 3:
 *  1. profile.default_occasion when present and supported;
 *  2. else, if the stored occasion_context is "traditional" → "ethnic";
 *  3. else the current daily fallback → "casual".
 * Never silently widens the casual formality profile.
 */
export function resolveEngineOccasion(
  defaultOccasion: string | null | undefined,
  occasionContext?: string | null,
): EngineOccasion {
  const d = (defaultOccasion ?? "").trim().toLowerCase();
  if (isEngineOccasion(d)) return d as EngineOccasion;
  if (occasionContext === "traditional") return "ethnic";
  return "casual";
}

/** Stored occasion_context label for a resolved engine occasion. */
export function contextForOccasion(occasion: EngineOccasion): string {
  return occasion === "ethnic" || occasion === "festive" || occasion === "wedding_guest" || occasion === "family_function"
    ? "traditional"
    : "daily";
}
