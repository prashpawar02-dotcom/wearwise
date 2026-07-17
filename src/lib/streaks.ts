// =====================================================================
// WearWise — streak engine (Module C). SERVER-ONLY: all writes go through
// the service-role client (streaks has NO client write policy), so a hostile
// client can never fake a streak. Idempotent per local date. The transition
// math lives in the pure `streaks-core` module (unit-tested); this file only
// does I/O and surfaces a distinct technical error when the admin query fails
// (e.g. a service-role key that doesn't match the target instance).
// =====================================================================
import { createAdminClient } from "@/lib/supabase-admin";
import { getEntitlements } from "@/lib/entitlements";
import { userLocalDate } from "@/lib/time/timezone";
import { logAppEvent } from "@/lib/events";
import { computeStreakTransition, STREAK_MILESTONES, type StreakState } from "@/lib/streaks-core";

export { STREAK_MILESTONES };
export type { StreakState };

export interface CheckinResult {
  status: "incremented" | "already_counted" | "reset" | "frozen" | "error";
  current: number;
  longest: number;
  /** Milestone hit on THIS check-in (3/7/14/30/100) or null. */
  milestone: number | null;
}

const ERROR_RESULT: CheckinResult = { status: "error", current: 0, longest: 0, milestone: null };

/**
 * Record today's activity (opened the drop / logged an outfit). Idempotent:
 * a same-day repeat returns already_counted with no increment; two concurrent
 * calls converge to the same value (see streaks-core). A failed admin read/write
 * returns status:"error" (surfaced by the route as a technical 500), NEVER a
 * silent success.
 */
export async function checkinStreak(userId: string, timezone: string | null): Promise<CheckinResult> {
  try {
    const admin = createAdminClient();
    const today = userLocalDate(timezone);

    const { data, error: readError } = await admin.from("streaks").select("*").eq("user_id", userId).maybeSingle();
    if (readError) {
      console.error("[checkinStreak] streaks read failed", {
        userId, code: readError.code, message: readError.message, details: readError.details, hint: readError.hint,
      });
      return ERROR_RESULT;
    }
    const row = data as StreakState | null;

    const ent = await getEntitlements(userId);
    const t = computeStreakTransition({
      row,
      today,
      pro: ent.effectivePro,
      freezesPerMonth: ent.limits.streakFreezesPerMonth,
      nowISO: new Date().toISOString(),
    });

    // Idempotent same-day repeat → no write.
    if (!t.write) {
      return { status: "already_counted", current: t.current, longest: t.longest, milestone: null };
    }

    const { error: writeError } = await admin.from("streaks").upsert({
      user_id: userId,
      current_count: t.current,
      longest_count: t.longest,
      last_active_date: today,
      freezes_remaining: t.freezesRemaining,
      freezes_reset_at: t.freezesResetAt,
      updated_at: new Date().toISOString(),
    });
    if (writeError) {
      console.error("[checkinStreak] streaks write failed", {
        userId, code: writeError.code, message: writeError.message, details: writeError.details, hint: writeError.hint,
      });
      return ERROR_RESULT;
    }

    await logAppEvent("streak_checkin", userId, { status: t.status, current: t.current, milestone: t.milestone });
    return { status: t.status, current: t.current, longest: t.longest, milestone: t.milestone };
  } catch {
    return ERROR_RESULT;
  }
}
