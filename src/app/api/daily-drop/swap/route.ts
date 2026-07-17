import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isWearableItem } from "@/lib/wardrobe";
import { getFlags } from "@/lib/flags";
import { logAppEvent } from "@/lib/events";
import { capMessage, capState } from "@/lib/swap-caps";
import { buildSwapContext, capSummary, sessionOrdinal } from "@/lib/swap-server";
import { persistMutatedRecommendation } from "@/lib/recommendation/persist";
import { lockAndReplaceCandidates } from "@/lib/engine/swap";
import { validateOutfitCurrent } from "@/lib/outfit-validity";
import type { DailyRecommendation, Profile, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Swap ONE item in today's Daily Drop — lock-and-replace (Phase 3).
 *
 * POST { recommendationId, replaceItemId, replacementItemId }
 *  -> { status: "updated" | "cap_reached" | "error", selectedItemIds, reason,
 *      whyThisWorks, cap }
 *
 * Contract: every OTHER slot + occasion + formality window + colour theme stays
 * locked; the replacement must pass ALL hard filters against the locked items
 * (fail closed). Swaps are FREE with a cap (3/day, first 3 sessions exempt),
 * enforced HERE server-side. The exact pre-swap outfit is snapshotted for undo.
 */
function usable(item: WardrobeItem): boolean {
  return item.ai_tag_status !== "analyzing" && item.ai_tag_status !== "failed";
}
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

  let body: { recommendationId?: string; replaceItemId?: string; replacementItemId?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  const { recommendationId, replaceItemId, replacementItemId } = body;
  if (!recommendationId || !replaceItemId || !replacementItemId) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }

  const { data: recData } = await supabase
    .from("daily_recommendations").select("*")
    .eq("id", recommendationId).eq("user_id", user.id).maybeSingle();
  const rec = recData as DailyRecommendation | null;
  if (!rec) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  const selectedIds = rec.selected_item_ids ?? [];
  if (!selectedIds.includes(replaceItemId)) {
    return NextResponse.json({ status: "error", reason: "not_in_outfit" }, { status: 400 });
  }
  if (selectedIds.includes(replacementItemId)) {
    return NextResponse.json({ status: "error", reason: "already_in_outfit" }, { status: 400 });
  }

  // ---- CAP GATE (server-authoritative) ----
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

  const replaceItem = allItems.find((i) => i.id === replaceItemId);
  const replacement = allItems.find((i) => i.id === replacementItemId);
  if (!replaceItem || !replacement) {
    return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });
  }
  if (!isWearableItem(replacement) || !usable(replacement)) {
    return NextResponse.json({ status: "error", reason: "replacement_unavailable" }, { status: 400 });
  }

  // ---- LOCK-AND-REPLACE LEGALITY (fail closed) ----
  const ctx = await buildSwapContext(supabase, profile, rec);
  const precomputed = rec.swap_candidates?.[replaceItemId];
  let valid = Array.isArray(precomputed) && precomputed.includes(replacementItemId);
  if (!valid) {
    const outfit = orderedOutfit(selectedIds, allItems);
    const res = lockAndReplaceCandidates(allItems, outfit, replaceItem, ctx, 25);
    valid = res.status === "ok" && res.candidates.some((c) => c.id === replacementItemId);
  }
  if (!valid) {
    return NextResponse.json({ status: "error", reason: "invalid_replacement" }, { status: 400 });
  }

  // ---- APPLY: snapshot for undo, swap the one item, re-explain, count the swap ----
  const newIds = selectedIds.map((id) => (id === replaceItemId ? replacementItemId : id));
  const newOutfit = orderedOutfit(newIds, allItems);
  // Apply-time revalidation (concurrency/cache safety): even a precomputed
  // candidate must be re-checked NOW. Reject if any item in the resulting outfit
  // (locked pieces included) is no longer available, or the combination fails a
  // hard filter. The client refreshes candidates on "stale".
  const freshness = await validateOutfitCurrent(supabase, user.id, newIds, { ctx });
  if (!freshness.valid) {
    await logAppEvent("stale_outfit_blocked", user.id, {
      surface: "swap_apply", reason: freshness.invalid[0]?.reason ?? "stale",
    });
    return NextResponse.json({
      status: "stale",
      reason: "availability_changed",
      message: "That option just changed — here are fresh matches.",
      cap: capSummary(capBefore),
    });
  }
  // Persist through the shared authoritative contract (locked decisions 7, 8):
  // selected_item_ids + matching completeness/reason/confidence/fingerprint.
  const { error: upErr, evaluated, reasoning } = await persistMutatedRecommendation(supabase, {
    recId: recommendationId, userId: user.id,
    selectedIds: newIds, items: newOutfit, inventory: allItems, ctx,
    reasoningFallback: "Keeps the look balanced for today",
    extra: { pre_swap_item_ids: selectedIds, swaps_used: (rec.swaps_used ?? 0) + 1 },
  });
  if (upErr) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });

  await logAppEvent("swap_kept", user.id, { swaps_used: (rec.swaps_used ?? 0) + 1 });

  const capAfter = capState({
    swapsUsed: (rec.swaps_used ?? 0) + 1, optionsUsed: rec.options_used ?? 0, sessionOrdinal: ordinal,
  });
  return NextResponse.json({
    status: "updated",
    selectedItemIds: newIds,
    reason: reasoning,
    whyThisWorks: evaluated.whyThisWorks,
    cap: capSummary(capAfter),
  });
}
