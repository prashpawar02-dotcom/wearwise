import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAppEvent } from "@/lib/events";
import { buildSwapContext, explainForItems } from "@/lib/swap-server";
import type { DailyRecommendation, Profile, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Put back — restore the EXACT pre-swap outfit (undo). Reads the snapshot taken
 * by the last swap/mood-swap (pre_swap_item_ids), restores it, and clears the
 * snapshot. Reverting does NOT refund the swap cap (a revert is free but the
 * swap still counted — this prevents swap/undo cap-gaming).
 *
 * POST { recommendationId }
 *  → { status: "restored" | "nothing_to_undo" | "error", selectedItemIds, reason }
 */
function orderedOutfit(ids: string[], all: WardrobeItem[]): WardrobeItem[] {
  const byId = new Map(all.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((i): i is WardrobeItem => Boolean(i));
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  let body: { recommendationId?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  if (!body.recommendationId) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }

  const { data: recData } = await supabase
    .from("daily_recommendations").select("*")
    .eq("id", body.recommendationId).eq("user_id", user.id).maybeSingle();
  const rec = recData as DailyRecommendation | null;
  if (!rec) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  const snapshot = rec.pre_swap_item_ids;
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    return NextResponse.json({ status: "nothing_to_undo" });
  }

  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const { data: itemData } = await supabase.from("wardrobe_items").select("*").eq("user_id", user.id);
  const profile = profileData as Profile | null;
  const allItems = (itemData ?? []) as WardrobeItem[];

  const restored = orderedOutfit(snapshot, allItems);
  const ctx = await buildSwapContext(profile, rec);
  const explain = explainForItems(restored, ctx);
  const reason = explain.whyThisWorks[0] ?? "Back to the look you liked";

  const { error: upErr } = await supabase
    .from("daily_recommendations")
    .update({
      selected_item_ids: snapshot,
      pre_swap_item_ids: null,          // nothing left to undo
      reasoning: reason,
      confidence: explain.confidence,
      factor_breakdown: explain.factor_breakdown,
      is_dual_pick: explain.is_dual_pick,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.recommendationId).eq("user_id", user.id);
  if (upErr) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });

  await logAppEvent("swap_reverted", user.id, {});

  return NextResponse.json({ status: "restored", selectedItemIds: snapshot, reason, whyThisWorks: explain.whyThisWorks });
}
