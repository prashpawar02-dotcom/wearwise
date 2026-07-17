// =====================================================================
// WearWise — streak transition logic (PURE; server + test safe)
// Extracted from streaks.ts so the idempotency/concurrency behaviour can be
// unit-tested without any DB or next/headers import. The transition is a pure
// function of (stored row, today, entitlements): the next value is derived from
// the row's OWN columns, so two concurrent check-ins that read the same row
// compute the SAME result and converge — they never double-increment.
// =====================================================================

export const STREAK_MILESTONES = [3, 7, 14, 30, 100] as const;

export interface StreakState {
  current_count: number;
  longest_count: number;
  last_active_date: string | null;
  freezes_remaining: number;
  freezes_reset_at: string | null;
}

export type StreakStatus = "incremented" | "already_counted" | "reset" | "frozen";

export interface StreakTransition {
  status: StreakStatus;
  current: number;
  longest: number;
  freezesRemaining: number;
  freezesResetAt: string | null;
  milestone: number | null;
  /** false only for already_counted (idempotent no-op — no write required). */
  write: boolean;
}

export interface StreakTransitionInput {
  row: StreakState | null;
  today: string;          // 'YYYY-MM-DD' in the user's local zone
  pro: boolean;
  freezesPerMonth: number;
  nowISO: string;
}

/** The calendar date before `dateISO` (UTC-noon anchored to avoid DST edges). */
export function prevDateISO(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function milestoneFor(current: number, status: StreakStatus): number | null {
  return (STREAK_MILESTONES as readonly number[]).includes(current) && status !== "reset" ? current : null;
}

/**
 * Compute the next streak state. Idempotent per local date: a same-day repeat
 * returns already_counted with write:false and no increment.
 */
export function computeStreakTransition(inp: StreakTransitionInput): StreakTransition {
  const { row, today, pro, freezesPerMonth, nowISO } = inp;

  // Monthly freeze refill for Pro users (tracked by freezes_reset_at).
  const monthStart = `${today.slice(0, 7)}-01`;
  let freezes = row?.freezes_remaining ?? 0;
  let freezesResetAt = row?.freezes_reset_at ?? null;
  if (pro && (!freezesResetAt || freezesResetAt.slice(0, 10) < monthStart)) {
    freezes = freezesPerMonth;
    freezesResetAt = nowISO;
  }

  if (!row || !row.last_active_date) {
    const current = 1;
    return {
      status: "incremented", current,
      longest: Math.max(current, row?.longest_count ?? 0),
      freezesRemaining: freezes, freezesResetAt,
      milestone: milestoneFor(current, "incremented"), write: true,
    };
  }

  // SAME DAY → idempotent no-op (never a second increment).
  if (row.last_active_date === today) {
    return {
      status: "already_counted", current: row.current_count, longest: row.longest_count,
      freezesRemaining: freezes, freezesResetAt, milestone: null, write: false,
    };
  }

  let status: StreakStatus;
  let current: number;
  if (row.last_active_date === prevDateISO(today)) {
    status = "incremented"; current = row.current_count + 1;
  } else if (pro && freezes > 0 && row.last_active_date === prevDateISO(prevDateISO(today))) {
    freezes -= 1; status = "frozen"; current = row.current_count + 1;
  } else {
    status = "reset"; current = 1;
  }

  return {
    status, current,
    longest: Math.max(current, row.longest_count ?? 0),
    freezesRemaining: freezes, freezesResetAt,
    milestone: milestoneFor(current, status), write: true,
  };
}
