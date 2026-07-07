import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getFlags } from "@/lib/flags";
import { notifyUser } from "@/lib/notify";
import { cronUnauthorized } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LOG = "[cron:weekly-recap]";

/**
 * Sunday weekly recap (Module D / plan §4.3): outfits worn this week +
 * "minutes saved" value reinforcement. Scheduled Sunday evening IST via
 * vercel.json; one send per user per week (app_events dedupe).
 */
async function run(req: Request): Promise<NextResponse> {
  const unauthorized = cronUnauthorized(req);
  if (unauthorized) return unauthorized;

  const flags = await getFlags();
  if (!flags["notifications.enabled"]) return NextResponse.json({ skipped: "notifications_disabled" });

  const admin = createAdminClient();
  const { data: subsData, error } = await admin
    .from("push_subscriptions")
    .select("user_id, fcm_token")
    .eq("enabled", true);
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });

  const tokensByUser = new Map<string, string[]>();
  for (const s of subsData ?? []) {
    tokensByUser.set(s.user_id, [...(tokensByUser.get(s.user_id) ?? []), s.fcm_token]);
  }

  const weekAgoDate = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const weekAgoIso = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const summary = { checked: tokensByUser.size, sent: 0, skipped: 0 };

  for (const [userId, tokens] of tokensByUser) {
    // Dedupe: one recap per week.
    const { data: already } = await admin
      .from("app_events")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "notification_sent")
      .contains("props", { kind: "weekly_recap" })
      .gte("created_at", weekAgoIso)
      .limit(1);
    if (already && already.length > 0) { summary.skipped++; continue; }

    const { count: wornCount } = await admin
      .from("worn_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("worn_on", weekAgoDate);

    if (!wornCount || wornCount === 0) { summary.skipped++; continue; } // nothing to celebrate — don't spam

    const minutesSaved = wornCount * 7; // honest heuristic: ~7 min decision time per outfit
    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const channel = await notifyUser({
      userId,
      email: userData?.user?.email ?? null,
      fcmTokens: tokens,
      kind: "weekly_recap",
      title: `Your week in outfits ✨`,
      body: `${wornCount} outfit${wornCount === 1 ? "" : "s"} worn — about ${minutesSaved} minutes of decision time saved.`,
      url: "/plan",
    });
    if (channel !== "none") summary.sent++;
    else summary.skipped++;
  }

  console.log(`${LOG} checked=${summary.checked} sent=${summary.sent} skipped=${summary.skipped}`);
  return NextResponse.json(summary);
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
