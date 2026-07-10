import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signWardrobePaths } from "@/lib/images";
import { capState } from "@/lib/swap-caps";
import { buildSwapContext, capSummary, sessionOrdinal } from "@/lib/swap-server";
import { lockAndReplaceCandidates, slotLabel } from "@/lib/engine/swap";
import type { DailyRecommendation, Profile, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Lock-and-replace candidates for ONE item in today's Daily Drop (Phase 3).
 *
 * GET ?recommendationId=&replaceItemId=
 *  -> { status: "ok" | "complete" | "no_candidate", slot, slotLabel, candidates,
 *      message, cap }
 *
 * Top-5 valid replacements (all OTHER slots locked, all hard filters passed,
 * ranked by outfit_score), each with a one-line reason drawn 1:1 from a real
 * scoring factor of the resulting outfit. Short-lived SIGNED image URLs only.
 */
function orderedOutfit(ids: string[], all: WardrobeItem[]): WardrobeItem[] {
  const byId = new Map(all.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((i): i is WardrobeItem => Boolean(i));
}

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
    .from("daily_recommendations").select("*")
    .eq("id", recommendationId).eq("user_id", user.id).maybeSingle();
  const rec = recData as DailyRecommendation | null;
  if (!rec) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  const selectedIds = rec.selected_item_ids ?? [];
  if (!selectedIds.includes(replaceItemId)) {
    return NextResponse.json({ status: "error", reason: "not_in_outfit" }, { status: 400 });
  }

  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const { data: itemData } = await supabase.from("wardrobe_items").select("*").eq("user_id", user.id);
  const profile = profileData as Profile | null;
  const allItems = (itemData ?? []) as WardrobeItem[];
  const replaceItem = allItems.find((i) => i.id === replaceItemId);
  if (!replaceItem) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  const ordinal = await sessionOrdinal(supabase, user.id);
  const cap = capSummary(capState({
    swapsUsed: rec.swaps_used ?? 0, optionsUsed: rec.options_used ?? 0, sessionOrdinal: ordinal,
  }));

  const outfit = orderedOutfit(selectedIds, allItems);
  const ctx = await buildSwapContext(profile, rec);
  const result = lockAndReplaceCandidates(allItems, outfit, replaceItem, ctx, 5);

  if (result.status !== "ok") {
    return NextResponse.json({
      status: result.status,
      slot: result.slot,
      slotLabel: result.slot ? slotLabel(result.slot) : null,
      candidates: [],
      message: result.message,
      cap,
    });
  }

  const byId = new Map(allItems.map((i) => [i.id, i]));
  const cands = result.candidates
    .map((c) => ({ c, item: byId.get(c.id) }))
    .filter((x): x is { c: typeof result.candidates[number]; item: WardrobeItem } => Boolean(x.item));
  const urls = await signWardrobePaths(cands.map((x) => x.item.image_path));

  return NextResponse.json({
    status: "ok",
    slot: result.slot,
    slotLabel: result.slot ? slotLabel(result.slot) : null,
    message: null,
    cap,
    candidates: cands.map(({ c, item }) => ({
      id: c.id,
      label: item.user_facing_name ?? item.category ?? "Item",
      sub: [item.category, item.color].filter(Boolean).join(" · ") || null,
      image: urls[item.image_path] ?? null,
      reason: c.reason,
    })),
  });
}
