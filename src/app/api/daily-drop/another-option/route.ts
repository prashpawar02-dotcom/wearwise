import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWeatherContext } from "@/lib/weather";
import { alternativeOutfitItems, preferLayerFor, ANOTHER_OPTION_REASONING } from "@/lib/daily-drop";
import { getFlags } from "@/lib/flags";
import { rateLimit } from "@/lib/rate-limit";
import { isUuid, parseJsonBody } from "@/lib/validate";
import { logAppEvent } from "@/lib/events";
import { capMessage, capState } from "@/lib/swap-caps";
import { buildSwapContext, explainForItems, capSummary, sessionOrdinal } from "@/lib/swap-server";
import type { DailyRecommendation, Profile, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * "Another Option" — a full-outfit alternate for today's Daily Drop (Phase 3).
 * CACHE FIRST (Module B): serve pre-computed alternatives before recomputing.
 * CAP (Phase 3): 2 options/drop free; first 3 sessions cap-exempt. Enforced
 * server-side. Not Pro-gated anymore; Pro line omitted from cap message.
 */
function orderedOutfit(ids: string[], all: WardrobeItem[]): WardrobeItem[] {
  const byId = new Map(all.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((i): i is WardrobeItem => Boolean(i));
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`another:${user.id}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ status: "error", reason: "rate_limited" }, { status: 429 });

  const flags = await getFlags();
  if (!flags["swaps.enabled"]) {
    return NextResponse.json({ status: "disabled", message: "Options are taking a short break — back soon." });
  }

  const body = await parseJsonBody(req);
  const recommendationId = body?.recommendationId;
  if (!isUuid(recommendationId)) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }

  const { data: recData } = await supabase
    .from("daily_recommendations").select("*")
    .eq("id", recommendationId).eq("user_id", user.id).maybeSingle();
  const rec = recData as (DailyRecommendation & { alt_item_ids?: string[][]; alt_cursor?: number }) | null;
  if (!rec) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  // ---- CAP GATE: 2 options/drop, first 3 sessions exempt ----
  const ordinal = await sessionOrdinal(supabase, user.id);
  const capBefore = capState({
    swapsUsed: rec.swaps_used ?? 0, optionsUsed: rec.options_used ?? 0, sessionOrdinal: ordinal,
  });
  if (!capBefore.canOption) {
    await logAppEvent("cap_hit_option", user.id, { options_used: rec.options_used ?? 0 });
    return NextResponse.json({ status: "cap_reached", message: capMessage(), cap: capSummary(capBefore) });
  }

  const [{ data: profileData }, { data: itemData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("wardrobe_items").select("*").eq("user_id", user.id),
  ]);
  const profile = profileData as Profile | null;
  const allItems = (itemData ?? []) as WardrobeItem[];
  const ctx = await buildSwapContext(profile, rec);
  const capAfter = () => capState({
    swapsUsed: rec.swaps_used ?? 0, optionsUsed: (rec.options_used ?? 0) + 1, sessionOrdinal: ordinal,
  });

  // ---- 1) serve from the pre-computed cache (0 compute, 0 tokens) ----
  const altSets = Array.isArray(rec.alt_item_ids) ? rec.alt_item_ids : [];
  const cursor = rec.alt_cursor ?? 0;
  if (cursor < altSets.length) {
    const cached = altSets[cursor];
    if (Array.isArray(cached) && cached.length > 0) {
      const explain = explainForItems(orderedOutfit(cached, allItems), ctx);
      const reason = explain.whyThisWorks[0] ?? ANOTHER_OPTION_REASONING;
      const { error: upErr } = await supabase
        .from("daily_recommendations")
        .update({
          selected_item_ids: cached,
          alt_cursor: cursor + 1,
          options_used: (rec.options_used ?? 0) + 1,
          pre_swap_item_ids: rec.selected_item_ids ?? [],
          reasoning: reason,
          confidence: explain.confidence,
          factor_breakdown: explain.factor_breakdown,
          is_dual_pick: explain.is_dual_pick,
          updated_at: new Date().toISOString(),
        })
        .eq("id", recommendationId).eq("user_id", user.id);
      if (!upErr) {
        await logAppEvent("another_option", user.id, { cached: true, options_used: (rec.options_used ?? 0) + 1 });
        return NextResponse.json({
          status: "updated", selectedItemIds: cached, reason, whyThisWorks: explain.whyThisWorks,
          cached: true, cap: capSummary(capAfter()),
        });
      }
    }
  }

  // ---- 2) fallback: recompute deterministically ----
  let preferLayer = false;
  if (profile?.weather_advice_enabled && profile.city) {
    const weather = await getWeatherContext(profile.city);
    if (weather) preferLayer = preferLayerFor(weather.category, weather.tempC);
  }

  const items = alternativeOutfitItems(allItems, rec.selected_item_ids ?? [], preferLayer);
  if (!items) {
    return NextResponse.json({
      status: "not_enough_items",
      selectedItemIds: rec.selected_item_ids ?? [],
      reasoning: rec.reasoning,
    });
  }

  const newIds = items.map((i) => i.id);
  const explain = explainForItems(items, ctx);
  const reason = explain.whyThisWorks[0] ?? ANOTHER_OPTION_REASONING;
  const { error: upErr } = await supabase
    .from("daily_recommendations")
    .update({
      selected_item_ids: newIds,
      options_used: (rec.options_used ?? 0) + 1,
      pre_swap_item_ids: rec.selected_item_ids ?? [],
      reasoning: reason,
      confidence: explain.confidence,
      factor_breakdown: explain.factor_breakdown,
      is_dual_pick: explain.is_dual_pick,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recommendationId).eq("user_id", user.id);
  if (upErr) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });

  await logAppEvent("another_option", user.id, { cached: false, options_used: (rec.options_used ?? 0) + 1 });
  return NextResponse.json({
    status: "updated", selectedItemIds: newIds, reason, whyThisWorks: explain.whyThisWorks,
    cap: capSummary(capAfter()),
  });
}
