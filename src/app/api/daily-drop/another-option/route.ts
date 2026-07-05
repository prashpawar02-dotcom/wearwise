import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWeatherContext } from "@/lib/weather";
import { alternativeOutfitItems, preferLayerFor, ANOTHER_OPTION_REASONING } from "@/lib/daily-drop";
import type { DailyRecommendation, Profile, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Regenerate a second deterministic outfit for today's Daily Drop.
 *
 * POST { recommendationId }
 * → { status: "updated" | "not_enough_items" | "error", selectedItemIds, reasoning }
 *
 * Session-authenticated (user from session). Builds an alternative that shares no
 * item with the current selection, respecting availability + roles + recency. It
 * mutates the SAME daily_recommendations row (no duplicate per user/date) and
 * stores item IDs only. RLS enforces owner scope; no service role.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  let body: { recommendationId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  const { recommendationId } = body;
  if (!recommendationId) return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });

  const { data: recData } = await supabase
    .from("daily_recommendations")
    .select("*")
    .eq("id", recommendationId)
    .eq("user_id", user.id)
    .maybeSingle();
  const rec = recData as DailyRecommendation | null;
  if (!rec) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  const [{ data: profileData }, { data: itemData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("wardrobe_items").select("*").eq("user_id", user.id),
  ]);
  const profile = profileData as Profile | null;
  const allItems = (itemData ?? []) as WardrobeItem[];

  // Optional weather-driven layer preference (never blocks).
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
