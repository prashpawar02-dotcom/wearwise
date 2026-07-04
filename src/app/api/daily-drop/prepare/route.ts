import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prepareDailyDrop } from "@/lib/daily-drop";

export const runtime = "nodejs";

/**
 * Manual Daily Outfit Drop prepare endpoint — FOR TESTING in private beta.
 *
 * POST only. Prepares/caches today's recommendation for the CURRENT signed-in
 * user by calling prepareDailyDrop(user.id). It runs as that user (their
 * session; RLS applies), so a user can only ever prepare their own drop.
 *
 * NOT here (by design, this pass): no cron secret, no service-role key, no
 * notification sending, no admin access. This is a safe manual trigger only.
 *
 * Optional JSON body: { force?: boolean } to re-prepare an existing day.
 */
export async function POST(req: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });
  }

  // Only `force` (strict boolean true) is honoured. Any other field in the body
  // is ignored — the user is ALWAYS taken from the session, never from the body,
  // so a client can never prepare a drop for someone else.
  let force = false;
  try {
    const body = await req.json();
    force = body?.force === true;
  } catch {
    // no/invalid body — treat as force:false
  }

  const result = await prepareDailyDrop(user.id, { force });

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
