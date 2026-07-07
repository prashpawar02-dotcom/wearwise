import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";
import { rateLimit } from "@/lib/rate-limit";
import { isUuid, parseJsonBody, str, uuidArray } from "@/lib/validate";
import { logAppEvent } from "@/lib/events";

export const runtime = "nodejs";

/**
 * Lookbook (Module C).
 * POST { itemIds, title?, suggestionId?, recommendationId? } → save a look.
 * Free cap of 5 enforced HERE (and again by a DB trigger as defense-in-depth).
 * The 6th save returns upgrade_required — the contextual paywall moment.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`looks:${user.id}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ status: "error", reason: "rate_limited" }, { status: 429 });

  const body = await parseJsonBody(req);
  const itemIds = uuidArray(body?.itemIds, 10);
  if (!itemIds) return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  const title = str(body?.title, 80);
  const suggestionId = isUuid(body?.suggestionId) ? (body?.suggestionId as string) : null;
  const recommendationId = isUuid(body?.recommendationId) ? (body?.recommendationId as string) : null;

  // ---- entitlement gate: Free = 5 saved looks ----
  const ent = await getEntitlements(user.id);
  const { count } = await supabase
    .from("saved_looks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= ent.limits.maxSavedLooks) {
    return NextResponse.json({ status: "upgrade_required", reason: "lookbook_full" }, { status: 402 });
  }

  // Only the user's OWN wardrobe items may be referenced.
  const { count: owned } = await supabase
    .from("wardrobe_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("id", itemIds);
  if ((owned ?? 0) !== itemIds.length) {
    return NextResponse.json({ status: "error", reason: "bad_items" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("saved_looks")
    .insert({
      user_id: user.id,
      item_ids: itemIds,
      title,
      suggestion_id: suggestionId,
      recommendation_id: recommendationId,
    })
    .select("id")
    .single();
  if (error || !data) {
    // DB trigger may have fired (cap raced) — treat as the paywall moment.
    if (error?.message?.includes("lookbook_limit_reached")) {
      return NextResponse.json({ status: "upgrade_required", reason: "lookbook_full" }, { status: 402 });
    }
    return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });
  }

  await logAppEvent("look_saved", user.id, { item_count: itemIds.length });
  return NextResponse.json({ status: "ok", id: data.id, saved: (count ?? 0) + 1 });
}
