// =====================================================================
// WearWise — streak engine (Module C). SERVER-ONLY: all writes go through
// the service-role client (streaks has NO client write policy), so a
// hostile client can never fake a streak. Idempotent per local date.
// =====================================================================
import { createAdminClient } from "@/lib/supabase-admin";
import { getEntitlements } from "@/lib/entitlements";
import { userLocalDate } from "@/lib/daily-drop";
import { logAppEvent } from "@/lib/events";

export const STREAK_MILESTONES = [3, 7, 14, 30, 100] as const;

export interface StreakRow {
  user_id: string;
  current_count: number;
  longest_count: number;
  last_active_date: string | null;
  freezes_remaining: number;
  freezes_reset_at: string | null;
}

export interface CheckinResult {
  status: "incremented" | "already_counted" | "reset" | "frozen" | "error";
  current: number;
  longest: number;
  /** Milestone hit on THIS check-in (3/7/14/30/100) or null. */
  milestone: number | null;
}

function prevDateISO(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Record today's activity (opened the drop / logged an outfit).
 * - same day again  → already_counted (idempotent)
 * - yesterday active → +1
 * - 1-day gap + Pro freeze available → consume a freeze, +1 ("frozen")
 * - longer gap → reset to 1
 */
export async function checkinStreak(userId: string, timezone: string | null): Promise<CheckinResult> {
  try {
    const admin = createAdminClient();
    const today = userLocalDate(timezone);

    const { data } = await admin.from("streaks").select("*").eq("user_id", userId).maybeSingle();
    const row = data as StreakRow | null;

    // Monthly freeze refill for Pro users (2/month), tracked by freezes_reset_at.
    const ent = await getEntitlements(userId);
    const monthStart = `${today.slice(0, 7)}-01`;
    let freezes = row?.freezes_remaining ?? 0;
    let freezesResetAt = row?.freezes_reset_at ?? null;
    if (ent.effectivePro && (!freezesResetAt || freezesResetAt.slice(0, 10) < monthStart)) {
      freezes = ent.limits.streakFreezesPerMonth;
      freezesResetAt = new Date().toISOString();
    }

    let status: CheckinResult["status"];
    let current: number;

    if (!row || !row.last_active_date) {
      status = "incremented";
      current = 1;
    } else if (row.last_active_date === today) {
      return {
        status: "already_counted",
        current: row.current_count,
        longest: row.longest_count,
        milestone: null,
      };
    } else if (row.last_active_date === prevDateISO(today)) {
      status = "incremented";
      current = row.current_count + 1;
    } else if (ent.effectivePro && freezes > 0 && row.last_active_date === prevDateISO(prevDateISO(today))) {
      // Exactly one missed day covered by a freeze.
      freezes -= 1;
      status = "frozen";
      current = row.current_count + 1;
    } else {
      status = "reset";
      current = 1;
    }

    const longest = Math.max(current, row?.longest_count ?? 0);
    const { error } = await admin.from("streaks").upsert({
      user_id: userId,
      current_count: current,
      longest_count: longest,
      last_active_date: today,
      freezes_remaining: freezes,
      freezes_reset_at: freezesResetAt,
      updated_at: new Date().toISOString(),
    });
    if (error) return { status: "error", current: 0, longest: 0, milestone: null };

    const milestone = (STREAK_MILESTONES as readonly number[]).includes(current) && status !== "reset" ? current : null;
    await logAppEvent("streak_checkin", userId, { status, current, milestone });
    return { status, current, longest, milestone };
  } catch {
    return { status: "error", current: 0, longest: 0, milestone: null };
  }
}
