import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { prepareDailyDrop } from "@/lib/daily-drop";

export const runtime = "nodejs";

/**
 * Manual Daily Outfit Drop prepare endpoint — FOR TESTING in private beta.
 *
 * POST only. Prepares/caches today's recommendation for the CURRENT signed-in
 * user. The user is ALWAYS taken from the session (never from the body), so a
 * client can never prepare for someone else. Preparation itself runs with the
 * server-controlled admin client (daily_recommendations inserts are
 * server-only), but only ever for the authenticated user's own id.
 *
 * NOT here (by design, this pass): no cron secret, no notification sending, no
 * admin access to other users. Optional JSON body: { force?: boolean }.
 */
// Admin kill-switch (Module A): manual prepare honours daily_drop.enabled too.
async function dailyDropDisabled(): Promise<boolean> {
  const { getFlags } = await import("@/lib/flags");
  const flags = await getFlags();
  return !flags["daily_drop.enabled"];
}

export async function POST(req: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });
  }

  // Only `force` (strict boolean true) is honoured. Any other field is ignored;
  // the user is never taken from the body.
  let force = false;
  try {
    const body = await req.json();
    force = body?.force === true;
  } catch {
    // no/invalid body — treat as force:false
  }

  // Server-controlled write path. If the service role isn't configured, fail
  // safely with a clear (non-sensitive) error rather than silently degrading.
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { status: "error", reason: "server_not_configured" },
      { status: 500 }
    );
  }

  const result = await prepareDailyDrop(user.id, { force, supabase: admin, source: "manual" });

  // HTTP contract (locked): a profile/config/query failure is a TECHNICAL error
  // (retryable) — it must NOT be reported as a wardrobe/eligibility failure.
  if (result.status === "error") {
    return NextResponse.json(
      { status: "error", reason: "technical_error", retryable: true, localDate: result.localDate },
      { status: 500 }
    );
  }
  // A genuinely absent profile → the user needs onboarding/setup, not a retry.
  if (result.status === "setup_required") {
    return NextResponse.json(
      { status: "setup_required", reason: "profile_missing", redirect: "/onboarding", localDate: result.localDate },
      { status: 409 }
    );
  }

  // Shape an explicit, minimal response. selected_item_ids are IDs only (no
  // image paths / signed URLs ever), so nothing sensitive is exposed here.
  return NextResponse.json(
    {
      status: result.status,
      localDate: result.localDate,
      recommendationId: result.recommendation?.id ?? null,
      reason: result.reason ?? null,
      failReason: result.status === "failed" ? result.reason ?? null : null,
      warning: result.warning ?? null,
    },
    { status: 200 }
  );
}
