import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signWardrobePaths } from "@/lib/images";
import { swapCandidates, garmentRole } from "@/lib/daily-drop";
import type { DailyRecommendation, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Replacement candidates for one item in today's Daily Drop.
 *
 * GET ?recommendationId=&replaceItemId= — returns up to 5 same-role, available
 * candidates with SHORT-LIVED SIGNED image URLs (generated here, never stored).
 * Session-authenticated; the user is taken from the session (never the query),
 * and RLS scopes both the recommendation and the wardrobe to the owner.
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const recommendationId = url.searchParams.get("recommendationId") ?? "";
  const replaceItemId = url.searchParams.get("replaceItemId") ?? "";
  if (!recommendationId || !replaceItemId) {
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

  const { data: itemData } = await supabase.from("wardrobe_items").select("*").eq("user_id", user.id);
  const allItems = (itemData ?? []) as WardrobeItem[];
  const replaceItem = allItems.find((i) => i.id === replaceItemId);
  if (!replaceItem) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  const candidates = swapCandidates(allItems, selectedIds, replaceItem, 5);
  const urls = await signWardrobePaths(candidates.map((c) => c.image_path));

  return NextResponse.json({
    status: "ok",
    role: garmentRole(replaceItem),
    candidates: candidates.map((c) => ({
      id: c.id,
      label: c.user_facing_name ?? c.category ?? "Item",
      sub: [c.category, c.color].filter(Boolean).join(" · ") || null,
      image: urls[c.image_path] ?? null,
    })),
  });
}
