// =====================================================================
// WearWise — Quiet-Gem cooldown state machine (Phase 5, Module B)
//
// PURE logic for the "skip a gem twice → rest it 90 days" contract
// (handbook §5 Phase 5.6). Persistence lives in three explicit, owner-scoped
// columns on wardrobe_items (migration 0029): gem_skip_count,
// gem_cooldown_until, gem_rested_notified. This module never re-implements the
// engine and does no I/O.
//
// AUTHORITY (accurate): wardrobe_items RLS enforces OWNER-ISOLATION, but an
// authenticated owner technically retains table-level UPDATE on its own rows —
// the DB does NOT enforce "server-only" writes on these columns. The OFFICIAL
// APPLICATION FLOW is server-controlled: the Module F server action
// authenticates the user, verifies ownership + that the item was the
// qualifying gem + that a replacement was actually kept, then persists exactly
// what `applyGemRemoval` returns and emits telemetry only after success.
//
// "gem_rested_notified" is per COOLDOWN CYCLE, not lifetime: it is cleared when
// the cooldown expires (resolveGemState), so a later legitimate rest can notify
// again. It never permanently blocks future rest messaging.
//
// REJECTION CONTRACT (only an item-specific removal counts — NOT Another
// Option, NOT app close, NOT skipping Wore It, NOT notification inactivity):
//   • 1st explicit removal → count = 1, no cooldown.
//   • 2nd explicit removal → count = 2, cooldown_until = now + 90d, rest
//     message shown ONCE (justRested = true → emit gem_rested).
//   • while cooling → further removals are no-ops.
//   • on expiry (now ≥ cooldown_until) → state resets so the cycle restarts.
// =====================================================================

import { GEM_COOLDOWN_DAYS } from "@/lib/wardrobe/insights";

const DAY_MS = 86_400_000;

/** Explicit item-specific removals required before a gem is rested. */
export const GEM_SKIP_THRESHOLD = 2;

export interface GemCooldownState {
  gem_skip_count: number;
  gem_cooldown_until: string | null;
  gem_rested_notified: boolean;
}

export const INITIAL_GEM_STATE: GemCooldownState = {
  gem_skip_count: 0,
  gem_cooldown_until: null,
  gem_rested_notified: false,
};

/** Still resting? Boundary is exclusive: at exactly cooldown_until it has EXPIRED. */
export function isGemCoolingDown(s: GemCooldownState, now: Date): boolean {
  if (!s.gem_cooldown_until) return false;
  const t = Date.parse(s.gem_cooldown_until);
  return !Number.isNaN(t) && t > now.getTime();
}

/** Lazily reset an expired cooldown so the two-removal cycle restarts cleanly. */
export function resolveGemState(s: GemCooldownState, now: Date): GemCooldownState {
  if (s.gem_cooldown_until && !isGemCoolingDown(s, now)) return { ...INITIAL_GEM_STATE };
  return s;
}

export interface GemRemovalResult {
  next: GemCooldownState;
  /** True exactly once — on the transition into rest. Gate `gem_rested` on this. */
  justRested: boolean;
}

/** Apply ONE explicit, item-specific gem removal. Server-authoritative + deterministic. */
export function applyGemRemoval(
  cur: GemCooldownState,
  now: Date,
  cooldownDays: number = GEM_COOLDOWN_DAYS,
): GemRemovalResult {
  const base = resolveGemState(cur, now); // expire an old cooldown first
  if (isGemCoolingDown(base, now)) return { next: base, justRested: false }; // already resting → no-op

  const count = base.gem_skip_count + 1;
  if (count >= GEM_SKIP_THRESHOLD && !base.gem_rested_notified) {
    const until = new Date(now.getTime() + cooldownDays * DAY_MS).toISOString();
    return {
      next: { gem_skip_count: count, gem_cooldown_until: until, gem_rested_notified: true },
      justRested: true,
    };
  }
  return { next: { ...base, gem_skip_count: count }, justRested: false };
}
