import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFlags } from "@/lib/flags";
import { rateLimit } from "@/lib/rate-limit";
import { isUuid, parseJsonBody } from "@/lib/validate";
import { logAppEvent } from "@/lib/events";
import { capMessage, capState } from "@/lib/swap-caps";
import { buildSwapContext, capSummary, sessionOrdinal } from "@/lib/swap-server";
import { persistMutatedRecommendation } from "@/lib/recommendation/persist";
import { recommendOutfits } from "@/lib/engine/recommend";
import { validateOutfitCurrent } from "@/lib/outfit-validity";
import type { DailyRecommendation, Profile, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * "Another Option" — a full-outfit alternate for today's Daily Drop.
 *
 * LOCKED DECISION 9: alternates exclude ONLY the exact current combination —
 * never blacklist every worn item. Alternates are whole valid outfits from the
 * authoritative engine (recommendOutfits), so they may legitimately REUSE the
 * current footwear / bottom. Complete outfits are always preferred over partial.
 *
 * CACHE FIRST (Module B): serve the pre-computed engine backups before recompute.
 * CAP: 2 options/drop free; first 3 sessions cap-exempt (server-enforced).
 */
const ANOTHER_OPTION_REASONING =
  "Another take from your available wardrobe, favouring pieces you haven't worn recently.";

function orderedOutfit(ids: string[], all: WardrobeItem[]): WardrobeItem[] {
  const byId = new Map(all.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((i): i is WardrobeItem => Boolean(i));
}

/** Order-independent signature of an outfit (the EXACT combination). */
function comboSig(ids: string[]): string {
  return [...ids].filter(Boolean).sort().join("|");
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
  const ctx = await buildSwapContext(supabase, profile, rec);
  const currentIds = rec.selected_item_ids ?? [];
  const capAfter = () => capState({
    swapsUsed: rec.swaps_used ?? 0, optionsUsed: (rec.options_used ?? 0) + 1, sessionOrdinal: ordinal,
  });

  // Exclude ONLY the exact current combination (locked decision 9) plus any
  // alternates already shown this drop, so repeated taps keep advancing.
  const altSets = Array.isArray(rec.alt_item_ids) ? rec.alt_item_ids : [];
  const cursor = rec.alt_cursor ?? 0;
  const shown = new Set<string>([comboSig(currentIds), ...altSets.slice(0, cursor).map(comboSig)]);

  // ---- 1) serve from the pre-computed cache (0 compute) ----
  if (cursor < altSets.length) {
    const cached = altSets[cursor];
    const cachedValid = cached && cached.length > 0
      ? await validateOutfitCurrent(supabase, user.id, cached, { ctx })
      : { valid: false };
    if (Array.isArray(cached) && cached.length > 0 && cachedValid.valid && !shown.has(comboSig(cached))) {
      const { error, evaluated, reasoning } = await persistMutatedRecommendation(supabase, {
        recId: recommendationId, userId: user.id,
        selectedIds: cached, items: orderedOutfit(cached, allItems), inventory: allItems, ctx,
        reasoningFallback: ANOTHER_OPTION_REASONING,
        extra: {
          alt_cursor: cursor + 1,
          options_used: (rec.options_used ?? 0) + 1,
          pre_swap_item_ids: currentIds,
        },
      });
      if (!error) {
        await logAppEvent("another_option", user.id, { cached: true, options_used: (rec.options_used ?? 0) + 1 });
        return NextResponse.json({
          status: "updated", selectedItemIds: cached, reason: reasoning, whyThisWorks: evaluated.whyThisWorks,
          cached: true, cap: capSummary(capAfter()),
        });
      }
    }
  }

  // ---- 2) fallback: recompute deterministically via the authoritative engine.
  // Complete outfits are preferred (engine ranks them first); we pick the first
  // whole outfit whose EXACT combination differs from the current one (and any
  // already shown). Footwear/bottom may be reused — we never blacklist items.
  const result = recommendOutfits(allItems, ctx, 8);
  const pool = result.hero ? [result.hero, ...result.backups] : [];
  const pick = pool.find((o) => !shown.has(comboSig(o.itemIds)));
  if (!pick) {
    return NextResponse.json({
      status: "not_enough_items",
      selectedItemIds: currentIds,
      reasoning: rec.reasoning,
    });
  }

  const newIds = pick.itemIds;
  const { error, evaluated, reasoning } = await persistMutatedRecommendation(supabase, {
    recId: recommendationId, userId: user.id,
    selectedIds: newIds, items: pick.items, inventory: allItems, ctx,
    reasoningFallback: ANOTHER_OPTION_REASONING,
    extra: {
      options_used: (rec.options_used ?? 0) + 1,
      pre_swap_item_ids: currentIds,
    },
  });
  if (error) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });

  await logAppEvent("another_option", user.id, { cached: false, options_used: (rec.options_used ?? 0) + 1 });
  return NextResponse.json({
    status: "updated", selectedItemIds: newIds, reason: reasoning, whyThisWorks: evaluated.whyThisWorks,
    cap: capSummary(capAfter()),
  });
}
