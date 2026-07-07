import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/validate";
import { logAppEvent } from "@/lib/events";

export const runtime = "nodejs";

/**
 * Account + data deletion (Module G / DPDP compliance).
 * POST { confirm: "DELETE" } — removes storage objects, then the auth user;
 * every table row cascades via `references auth.users on delete cascade`.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`delete:${user.id}`, 3, 60_000);
  if (!rl.ok) return NextResponse.json({ status: "error", reason: "rate_limited" }, { status: 429 });

  const body = await parseJsonBody(req);
  if (body?.confirm !== "DELETE") {
    return NextResponse.json({ status: "error", reason: "confirmation_required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1) wardrobe images (storage doesn't cascade)
  const { data: items } = await admin.from("wardrobe_items").select("image_path").eq("user_id", user.id);
  const paths = (items ?? []).map((i) => i.image_path).filter(Boolean);
  if (paths.length > 0) {
    for (let i = 0; i < paths.length; i += 100) {
      await admin.storage.from("wardrobe").remove(paths.slice(i, i + 100));
    }
  }

  // 2) log before the user row disappears (event keeps a null user later)
  await logAppEvent("account_deleted", user.id, { item_count: paths.length });

  // 3) delete the auth user — all rows cascade
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ status: "error", reason: "delete_failed" }, { status: 500 });

  return NextResponse.json({ status: "ok" });
}
