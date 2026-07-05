import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { garmentRole, SWAP_REASONING } from "@/lib/daily-drop";
import { isWearableItem } from "@/lib/wardrobe";
import type { DailyRecommendation, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Swap one item in today's Daily Drop.
 *
 * POST { recommendationId, replaceItemId, replacementItemId }
 * → { status: "updated" | "error", selectedItemIds, reasoning }
 *
 * Session-authenticated (user from session, never the body). Validates that the
 * recommendation is the user's own, the replaced item is in the outfit, and the
 * replacement is the user's own, wearable, same-role, and not already selected.
 * Updates only item IDs + reasoning — never stores image URLs. RLS enforces
 * owner-only read/update; no service role.
 */
function usable(item: WardrobeItem): boolean {
  return item.ai_tag_status !== "analyzing" && item.ai_tag_status !== "failed";
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  let body: { recommendationId?: string; replaceItemId?: string; replacementItemId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  const { recommendationId, replaceItemId, replacementItemId } = body;
  if (!recommendationId || !replaceItemId || !replacementItemId) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }

  const { data: recData } = await supabase
    .from("daily_recommendations")
    .select("*")
    .eq("id", recommendationId)
    .eq("user_id", user.id)
    .maybeSingle();
  const rec = recData as DailyRecommendation | null;
  if (!rec) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  const selectedIds = rec.selected_item_ids ?? [];
  if (!selectedIds.includes(replaceItemId)) {
    return NextResponse.json({ status: "error", reason: "not_in_outfit" }, { status: 400 });
  }
  if (selectedIds.includes(replacementItemId)) {
    return NextResponse.json({ status: "error", reason: "already_in_outfit" }, { status: 400 });
  }

  const { data: itemData } = await supabase.from("wardrobe_items").select("*").eq("user_id", user.id);
  const allItems = (itemData ?? []) as WardrobeItem[];
  const replaceItem = allItems.find((i) => i.id === replaceItemId);
  const replacement = allItems.find((i) => i.id === replacementItemId);
  if (!replaceItem || !replacement) {
    return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });
  }
  if (!isWearableItem(replacement) || !usable(replacement)) {
    return NextResponse.json({ status: "error", reason: "replacement_unavailable" }, { status: 400 });
  }
  if (garmentRole(replacement) !== garmentRole(replaceItem)) {
    return NextResponse.json({ status: "error", reason: "role_mismatch" }, { status: 400 });
  }

  const newIds = selectedIds.map((id) => (id === replaceItemId ? replacementItemId : id));

  const { error: upErr } = await supabase
    .from("daily_recommendations")
    .update({ selected_item_ids: newIds, reasoning: SWAP_REASONING, updated_at: new Date().toISOString() })
    .eq("id", recommendationId)
    .eq("user_id", user.id);
  if (upErr) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });

  return NextResponse.json({ status: "updated", selectedItemIds: newIds, reasoning: SWAP_REASONING });
}
