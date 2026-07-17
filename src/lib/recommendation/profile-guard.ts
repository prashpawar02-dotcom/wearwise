// =====================================================================
// WearWise — profile-load classification (pure; server + test safe)
// LOCKED (Phase 4 profile hardening): a profile query that ERRORS must NEVER be
// reported as a missing profile. This helper is the single place that
// distinguishes a TECHNICAL failure (config/RLS/JWT/PostgREST/connection) from a
// genuinely absent row, so callers can return the correct HTTP contract.
// =====================================================================

export interface SupabaseErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

export type ProfileLoadStatus = "ok" | "profile_query_failed" | "setup_required";

export interface ProfileLoadClassification {
  status: ProfileLoadStatus;
  error: SupabaseErrorLike | null;
}

/**
 * Classify a Supabase `{ data, error }` profile read:
 *  - error present            → "profile_query_failed" (technical; retryable) — NEVER "no_profile"
 *  - no error but data == null → "setup_required" (a genuinely absent row)
 *  - data present             → "ok"
 * Use `.maybeSingle()` at the call site so a zero-row read does not itself
 * become a PGRST116 error.
 */
export function classifyProfileResult<T>(res: { data: T | null; error: SupabaseErrorLike | null }): ProfileLoadClassification {
  if (res.error) return { status: "profile_query_failed", error: res.error };
  if (res.data == null) return { status: "setup_required", error: null };
  return { status: "ok", error: null };
}

/** Retryable copy for a technical profile/config failure — never blames the wardrobe. */
export const PROFILE_TECHNICAL_MESSAGE =
  "Something went wrong on our side. Please try again in a moment.";
