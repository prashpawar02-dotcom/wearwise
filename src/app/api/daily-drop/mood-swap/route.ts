import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFlags } from "@/lib/flags";
import { logAppEvent } from "@/lib/events";
import { capMessage, capState } from "@/lib/swap-caps";
import { buildSwapContext, capSummary, sessionOrdinal } from "@/lib/swap-server";
import { persistMutatedRecommendation } from "@/lib/recommendation/persist";
import { moodSwap, MOODS, type Mood } from "@/lib/engine/swap";
import type { DailyRecommendation, Profile, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Mood swap — re-theme with the FEWEST changes (1, max 2) toward a mood
 * (More formal / casual / comfortable / modest / Weather-safer). Counts against
 * the daily swap cap. Fail closed: every result passes all hard filters. When
 * nothing clean improves the mood without breaking the look, returns an honest
 * no_candidate (no cap consumed).
 *
 * POST { recommendationId, mood }
 *  → { status: "updated" | "no_candidate" | "cap_reached" | "error", ... }
 */
function orderedOutfit(ids: string[], all: WardrobeItem[]): WardrobeItem[] {
  const byId = new Map(all.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((i): i is WardrobeItem => Boolean(i));
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const flags = await getFlags();
  if (!flags["swaps.enabled"]) {
    return NextResponse.json({ status: "disabled", message: "Swaps are taking a short break — back soon." });
  }

  let body: { recommendationId?: string; mood?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  const { recommendationId, mood } = body;
  if (!recommendationId || !mood || !MOODS.includes(mood as Mood)) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }

  const { data: recData } = await supabase
    .from("daily_recommendations").select("*")
    .eq("id", recommendationId).eq("user_id", user.id).maybeSingle();
  const rec = recData as DailyRecommendation | null;
  if (!rec) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  const ordinal = await sessionOrdinal(supabase, user.id);
  const capBefore = capState({
    swapsUsed: rec.swaps_used ?? 0, optionsUsed: rec.options_used ?? 0, sessionOrdinal: ordinal,
  });
  if (!capBefore.canSwap) {
    await logAppEvent("cap_hit_swap", user.id, { swaps_used: rec.swaps_used ?? 0 });
    return NextResponse.json({ status: "cap_reached", message: capMessage(), cap: capSummary(capBefore) });
  }

  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const { data: itemData } = await supabase.from("wardrobe_items").select("*").eq("user_id", user.id);
  const profile = profileData as Profile | null;
  const allItems = (itemData ?? []) as WardrobeItem[];

  const selectedIds = rec.selected_item_ids ?? [];
  const outfit = orderedOutfit(selectedIds, allItems);
  const ctx = await buildSwapContext(supabase, profile, rec);

  const result = moodSwap(allItems, outfit, mood as Mood, ctx);
  if (result.status !== "ok") {
    // No cap consumed — the user got no new outfit.
    return NextResponse.json({ status: "no_candidate", message: result.message, mood });
  }

  const newIds = result.newItemIds;
  const newOutfit = orderedOutfit(newIds, allItems);

  // Shared authoritative persistence (locked decisions 7, 8). Mood reason wins
  // over the generic why-line.
  const { error: upErr, evaluated, reasoning } = await persistMutatedRecommendation(supabase, {
    recId: recommendationId, userId: user.id,
    selectedIds: newIds, items: newOutfit, inventory: allItems, ctx,
    reasoning: result.reason ?? undefined,
    reasoningFallback: "A cleaner take for the mood you asked for",
    extra: { pre_swap_item_ids: selectedIds, swaps_used: (rec.swaps_used ?? 0) + 1 },
  });
  if (upErr) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });

  await logAppEvent("swap_kept", user.id, { swaps_used: (rec.swaps_used ?? 0) + 1, mood_swap: true });

  const capAfter = capState({
    swapsUsed: (rec.swaps_used ?? 0) + 1, optionsUsed: rec.options_used ?? 0, sessionOrdinal: ordinal,
  });
  return NextResponse.json({
    status: "updated",
    mood,
    selectedItemIds: newIds,
    changedItemIds: [...result.removedItemIds, ...result.addedItemIds],
    reason: reasoning,
    whyThisWorks: evaluated.whyThisWorks,
    cap: capSummary(capAfter),
  });
}
