import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { isTimeHHMM, parseJsonBody, str } from "@/lib/validate";
import { logAppEvent } from "@/lib/events";

export const runtime = "nodejs";

/**
 * Register an FCM web-push token (Module D).
 * POST { fcmToken, reminderTime?, timezone? } — owner-scoped upsert via RLS.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`push:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ status: "error", reason: "rate_limited" }, { status: 429 });

  const body = await parseJsonBody(req);
  const fcmToken = str(body?.fcmToken, 512);
  if (!fcmToken || fcmToken.length < 20) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  const reminderTime = isTimeHHMM(body?.reminderTime) ? (body?.reminderTime as string) : "07:30";
  const timezone = str(body?.timezone, 64) ?? "Asia/Kolkata";

  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: user.id, fcm_token: fcmToken, reminder_time: reminderTime, timezone, enabled: true },
    { onConflict: "user_id,fcm_token" }
  );
  if (error) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });

  await logAppEvent("push_registered", user.id, {});
  return NextResponse.json({ status: "ok" });
}

/** Disable push for this user (all tokens). */
export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("push_subscriptions")
    .update({ enabled: false })
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
