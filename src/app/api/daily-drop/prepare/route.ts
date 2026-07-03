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

  // Optional force flag; tolerate an empty/absent body.
  let force = false;
  try {
    const body = await req.json();
    force = Boolean(body?.force);
  } catch {
    // no body — fine
  }

  const result = await prepareDailyDrop(user.id, { force });

  // Never leak wardrobe image data — prepareDailyDrop already returns IDs only.
  return NextResponse.json(result, { status: 200 });
}
