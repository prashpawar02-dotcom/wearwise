import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getFlags } from "@/lib/flags";
import { notifyUser } from "@/lib/notify";
import { cronUnauthorized, inQuietHours, localNow, timeToMinutes } from "@/lib/cron";
import { userLocalDate } from "@/lib/daily-drop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const WINDOW_MINUTES = 30; // matches a */30 cron schedule
const LOG = "[cron:notify-morning]";

/**
 * Morning "your outfit is ready" notification (Module D).
 * The ONE primary daily notification. Sends only when:
 *  - notifications.enabled flag is on
 *  - user has an enabled push subscription
 *  - their local time is inside [reminder_time, +30min) and not quiet hours
 *  - a prepared drop EXISTS for their local date (never notify into emptiness)
 *  - nothing was already sent today (app_events dedupe)
 */
async function run(req: Request): Promise<NextResponse> {
  const unauthorized = cronUnauthorized(req);
  if (unauthorized) return unauthorized;

  const flags = await getFlags();
  if (!flags["notifications.enabled"]) {
    return NextResponse.json({ skipped: "notifications_disabled" });
  }

  const admin = createAdminClient();
  const { data: subsData, error } = await admin
    .from("push_subscriptions")
    .select("user_id, fcm_token, reminder_time, timezone")
    .eq("enabled", true);
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });

  // Group tokens per user.
  const byUser = new Map<string, { tokens: string[]; reminder: string | null; tz: string }>();
  for (const s of subsData ?? []) {
    const u = byUser.get(s.user_id) ?? { tokens: [] as string[], reminder: (s.reminder_time ?? null) as string | null, tz: (s.timezone ?? "Asia/Kolkata") as string };
    u.tokens.push(s.fcm_token);
    byUser.set(s.user_id, u);
  }

  const now = new Date();
  const summary = { checked: byUser.size, sent: 0, skipped: 0, failed: 0 };

  for (const [userId, sub] of byUser) {
    const snap = localNow(sub.tz, now);
    const pref = timeToMinutes(sub.reminder) ?? 450; // default 07:30
    const inWindow = snap && snap.minutes >= pref && snap.minutes < pref + WINDOW_MINUTES && !inQuietHours(snap.minutes);
    if (!inWindow) { summary.skipped++; continue; }

    const localDate = userLocalDate(sub.tz, now);

    // Dedupe: at most ONE morning notification per user per local date.
    const { data: already } = await admin
      .from("app_events")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "notification_sent")
      .contains("props", { kind: "morning" })
      .gte("created_at", `${localDate}T00:00:00Z`)
      .limit(1);
    if (already && already.length > 0) { summary.skipped++; continue; }

    // Only notify when a prepared drop actually exists.
    const { data: rec } = await admin
      .from("daily_recommendations")
      .select("id, status")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .eq("status", "prepared")
      .maybeSingle();
    if (!rec) { summary.skipped++; continue; }

    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const email = userData?.user?.email ?? null;

    const channel = await notifyUser({
      userId,
      email,
      fcmTokens: sub.tokens,
      kind: "morning",
      title: "Your outfit for today is ready 👗",
      body: "One tap — today's look from your own wardrobe is waiting.",
      url: "/dashboard",
    });
    if (channel === "none") summary.failed++;
    else summary.sent++;
  }

  console.log(`${LOG} checked=${summary.checked} sent=${summary.sent} skipped=${summary.skipped} failed=${summary.failed}`);
  return NextResponse.json(summary);
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
