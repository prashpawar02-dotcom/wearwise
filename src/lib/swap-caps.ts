// =====================================================================
// WearWise — Swap / Option caps (Phase 3, handbook §5 P3 "Caps (decided)")
// PURE and dependency-free: safe on the server, in routes, and in tests.
//
// Decided caps (free tier):
//   * 3 swaps / day
//   * 2 options / drop
//   * first 3 sessions are cap-EXEMPT (a session ≈ a daily-drop day; the
//     session ordinal is the 1-based count of the user's drop days incl. today)
//
// Enforcement is SERVER-SIDE (the API routes call capState() and stop when the
// cap is hit); the UI is cosmetic. The cap message is CONFIDENCE-FRAMED, never
// guilt/scarcity (handbook §3.4). The Pro line is intentionally OMITTED until
// Phase 8 — see PRO_UPSELL_LINE + capMessage({ includePro }) TODO hook.
// =====================================================================

export const SWAP_CAP_PER_DAY = 3;
export const OPTION_CAP_PER_DROP = 2;
/** Sessions 1..3 are exempt from both caps (gentle first-run experience). */
export const SESSION_EXEMPT_THRESHOLD = 3;

export type CapKind = "swap" | "option";

export interface CapInput {
  /** Swaps already used on TODAY's drop. */
  swapsUsed: number;
  /** Options already used on THIS drop. */
  optionsUsed: number;
  /** 1-based ordinal of the user's drop-day (this drop included). */
  sessionOrdinal: number;
}

export interface CapState {
  /** True while the user is inside their first SESSION_EXEMPT_THRESHOLD sessions. */
  sessionExempt: boolean;
  /** Remaining swaps today (Infinity when exempt). */
  swapRemaining: number;
  /** Remaining options on this drop (Infinity when exempt). */
  optionRemaining: number;
  /** May the user perform one more swap right now? */
  canSwap: boolean;
  /** May the user perform one more option right now? */
  canOption: boolean;
  /** A swap is blocked purely by the daily cap (not by exemption). */
  swapCapHit: boolean;
  /** An option is blocked purely by the per-drop cap. */
  optionCapHit: boolean;
}

function clampNonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Derive the full cap state for a drop. Pure — same inputs, same output.
 * Exemption short-circuits both caps and reports Infinity remaining.
 */
export function capState(input: CapInput): CapState {
  const swapsUsed = clampNonNeg(input.swapsUsed);
  const optionsUsed = clampNonNeg(input.optionsUsed);
  const sessionOrdinal = clampNonNeg(input.sessionOrdinal);
  const sessionExempt = sessionOrdinal > 0 && sessionOrdinal <= SESSION_EXEMPT_THRESHOLD;

  const swapRemaining = sessionExempt
    ? Number.POSITIVE_INFINITY
    : Math.max(0, SWAP_CAP_PER_DAY - swapsUsed);
  const optionRemaining = sessionExempt
    ? Number.POSITIVE_INFINITY
    : Math.max(0, OPTION_CAP_PER_DROP - optionsUsed);

  const canSwap = sessionExempt || swapRemaining > 0;
  const canOption = sessionExempt || optionRemaining > 0;

  return {
    sessionExempt,
    swapRemaining,
    optionRemaining,
    canSwap,
    canOption,
    swapCapHit: !canSwap,
    optionCapHit: !canOption,
  };
}

// ---------------------------------------------------------------------------
// Cap copy (handbook §5 P3, verbatim minus the Pro line).
// ---------------------------------------------------------------------------

/** Confidence-framed base copy shared by swap + option caps. */
const CAP_BASE =
  "These are the strongest matches from your clean wardrobe today. I rank every " +
  "valid combination — going further means lower-scored pairings, where colours " +
  "and formality start to drift. If something's off, tap \u{1F44E} and tell me why — " +
  "tomorrow's pick gets sharper.";

/**
 * Pro upsell line — DELIBERATELY UNUSED until Phase 8.
 * TODO(phase-8): append this to capMessage() by passing { includePro: true }
 * once Pro entitlement wiring lands. Do not surface before the value gate.
 */
export const PRO_UPSELL_LINE = "Pro lets you keep exploring anyway.";

/**
 * Compose the cap message. Phase 3 always omits the Pro line; the includePro
 * hook exists so Phase 8 can enable it without touching call sites' copy.
 */
export function capMessage(opts: { includePro?: boolean } = {}): string {
  return opts.includePro ? `${CAP_BASE} ${PRO_UPSELL_LINE}` : CAP_BASE;
}
