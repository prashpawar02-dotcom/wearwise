import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWeatherContext } from "@/lib/weather";
import { alternativeOutfitItems, preferLayerFor, ANOTHER_OPTION_REASONING } from "@/lib/daily-drop";
import { getEntitlements } from "@/lib/entitlements";
import { getFlags } from "@/lib/flags";
import { rateLimit } from "@/lib/rate-limit";
import { isUuid, parseJsonBody } from "@/lib/validate";
import type { DailyRecommendation, Profile, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * "Another option" for today's Daily Drop (Modules A/B/E).
 *
 * CACHE FIRST (Module B): the nightly prepare stores up to 2 pre-computed
 * alternatives in alt_item_ids; we serve those before ever recomputing.
 * Recomputation is still deterministic — this endpoint uses ZERO LLM tokens.
 *
 * GATED (Module E): Free users get 1 drop/day with no swaps or options —
 * enforced HERE, server-side, not just in the UI.
 */
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

  const ent = await getEntitlements(user.id);
  if (!ent.limits.unlimitedSwaps) {
    return NextResponse.json({ status: "upgrade_required", reason: "swaps_locked" }, { status: 402 });
  }

  const body = await parseJsonBody(req);
  const recommendationId = body?.recommendationId;
  if (!isUuid(recommendationId)) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }

  const { data: recData } = await supabase
    .from("daily_recommendations")
    .select("*")
    .eq("id", recommendationId)
    .eq("user_id", user.id)
    .maybeSingle();
  const rec = recData as (DailyRecommendation & { alt_item_ids?: string[][]; alt_cursor?: number }) | null;
  if (!rec) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  // ---- 1) serve from the pre-computed cache (0 compute, 0 tokens) ----
  const altSets = Array.isArray(rec.alt_item_ids) ? rec.alt_item_ids : [];
  const cursor = rec.alt_cursor ?? 0;
  if (cursor < altSets.length) {
    const cached = altSets[cursor];
    if (Array.isArray(cached) && cached.length > 0) {
      const { error: upErr } = await supabase
        .from("daily_recommendations")
        .update({
          selected_item_ids: cached,
          alt_cursor: cursor + 1,
          reasoning: ANOTHER_OPTION_REASONING,
          updated_at: new Date().toISOString(),
        })
        .eq("id", recommendationId)
        .eq("user_id", user.id);
      if (!upErr) {
        return NextResponse.json({ status: "updated", selectedItemIds: cached, reasoning: ANOTHER_OPTION_REASONING, cached: true });
      }
    }
  }

  // ---- 2) fallback: recompute deterministically ----
  const [{ data: profileData }, { data: itemData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("wardrobe_items").select("*").eq("user_id", user.id),
  ]);
  const profile = profileData as Profile | null;
  const allItems = (itemData ?? []) as WardrobeItem[];

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
  const { error: upErr } = await supabase
    .from("daily_recommendations")
    .update({ selected_item_ids: newIds, reasoning: ANOTHER_OPTION_REASONING, updated_at: new Date().toISOString() })
    .eq("id", recommendationId)
    .eq("user_id", user.id);
  if (upErr) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });

  return NextResponse.json({ status: "updated", selectedItemIds: newIds, reasoning: ANOTHER_OPTION_REASONING });
}
