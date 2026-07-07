import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getFlags } from "@/lib/flags";
import { notifyUser } from "@/lib/notify";
import { cronUnauthorized, inQuietHours, localNow } from "@/lib/cron";
import { userLocalDate } from "@/lib/daily-drop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LOG = "[cron:streak-risk]";

/**
 * Streak-risk nudge (Module D) — loss-framing retention (plan §4.2).
 * Runs in the evening. Notifies users who have a streak ≥ 3 but have NOT
 * checked in today. Counts against the ≤2 contextual/week discipline
 * budget (enforced via app_events counting).
 */
async function run(req: Request): Promise<NextResponse> {
  const unauthorized = cronUnauthorized(req);
  if (unauthorized) return unauthorized;

  const flags = await getFlags();
  if (!flags["notifications.enabled"]) return NextResponse.json({ skipped: "notifications_disabled" });

  const admin = createAdminClient();
  const { data: streaks, error } = await admin
    .from("streaks")
    .select("user_id, current_count, last_active_date")
    .gte("current_count", 3);
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });

  const { data: subsData } = await admin
    .from("push_subscriptions")
    .select("user_id, fcm_token, timezone")
    .eq("enabled", true);
  const tokensByUser = new Map<string, { tokens: string[]; tz: string }>();
  for (const s of subsData ?? []) {
    const u = tokensByUser.get(s.user_id) ?? { tokens: [] as string[], tz: (s.timezone ?? "Asia/Kolkata") as string };
    u.tokens.push(s.fcm_token);
    tokensByUser.set(s.user_id, u);
  }

  const now = new Date();
  const summary = { checked: (streaks ?? []).length, sent: 0, skipped: 0 };
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  for (const st of streaks ?? []) {
    const sub = tokensByUser.get(st.user_id);
    if (!sub) { summary.skipped++; continue; }

    const snap = localNow(sub.tz, now);
    // Evening window 19:00–21:00 local, outside quiet hours.
    if (!snap || snap.minutes < 19 * 60 || snap.minutes >= 21 * 60 || inQuietHours(snap.minutes)) {
      summary.skipped++;
      continue;
    }

    const today = userLocalDate(sub.tz, now);
    if (st.last_active_date === today) { summary.skipped++; continue; } // already active today

    // Discipline: ≤2 contextual notifications per week per user.
    const { count: contextualThisWeek } = await admin
      .from("app_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", st.user_id)
      .eq("name", "notification_sent")
      .neq("props->>kind", "morning")
      .gte("created_at", weekAgo);
    if ((contextualThisWeek ?? 0) >= 2) { summary.skipped++; continue; }

    // Dedupe today.
    const { data: already } = await admin
      .from("app_events")
      .select("id")
      .eq("user_id", st.user_id)
      .eq("name", "notification_sent")
      .contains("props", { kind: "streak_risk" })
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(1);
    if (already && already.length > 0) { summary.skipped++; continue; }

    const { data: userData } = await admin.auth.admin.getUserById(st.user_id);
    const channel = await notifyUser({
      userId: st.user_id,
      email: userData?.user?.email ?? null,
      fcmTokens: sub.tokens,
      kind: "streak_risk",
      title: `Don't break your ${st.current_count}-day streak 🔥`,
      body: "Your outfit is still waiting — one tap keeps the streak alive.",
      url: "/dashboard",
    });
    if (channel !== "none") summary.sent++;
    else summary.skipped++;
  }

  console.log(`${LOG} checked=${summary.checked} sent=${summary.sent} skipped=${summary.skipped}`);
  return NextResponse.json(summary);
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
