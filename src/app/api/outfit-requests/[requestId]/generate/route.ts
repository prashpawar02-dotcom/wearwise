import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { engineOutfits, type EngineOutfit } from "@/lib/outfit-engine";
import { aiOutfits } from "@/lib/ai";
import { getFlags } from "@/lib/flags";
import { getEntitlements, occasionAllowed } from "@/lib/entitlements";
import { validateOutfitByIds, type RoleClassifiableItem } from "@/lib/outfitValidation";
import { isWearableItem } from "@/lib/wardrobe";
import { MIN_ITEMS_FOR_DRAFTS } from "@/lib/outfit-drafts";
import { rateLimit } from "@/lib/rate-limit";
import { logAppEvent } from "@/lib/events";
import { isUuid } from "@/lib/validate";
import type { WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * USER-PATH outfit generation (Module A — human-less by default).
 *
 * Rules engine first (0 tokens); AI only when the engine can't fill the
 * request AND every cost guardrail allows it. Every look passes the
 * fail-closed validator before it is stored.
 *
 * occasions.mode = 'auto'  → results inserted as APPROVED (user sees them
 *                            instantly; RLS shows approved rows).
 * occasions.mode = 'human' → results inserted as DRAFT + request goes to
 *                            in_review (existing /admin/requests queue).
 * occasions.enabled = false → friendly 'feature off' message.
 *
 * Entitlements enforced server-side: occasion allowed on plan, ideas count
 * (Free 1 / Pro 3).
 */
export async function POST(_req: Request, { params }: { params: { requestId: string } }) {
  if (!isUuid(params.requestId)) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`generate:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ status: "error", reason: "rate_limited" }, { status: 429 });

  const flags = await getFlags();
  if (!flags["occasions.enabled"]) {
    return NextResponse.json({
      status: "disabled",
      message: "Outfit ideas are taking a short break — please try again soon.",
    });
  }

  // Own request only (RLS also enforces).
  const { data: request } = await supabase
    .from("outfit_requests").select("*").eq("id", params.requestId).eq("user_id", user.id).single();
  if (!request) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  // ---- entitlements (server-side; the client only greys out UI) ----
  const ent = await getEntitlements(user.id);
  if (!occasionAllowed(ent, request.occasion)) {
    return NextResponse.json({ status: "upgrade_required", reason: "occasion_locked" }, { status: 402 });
  }
  const ideas = ent.limits.ideasPerRequest;

  const { data: itemsData } = await supabase.from("wardrobe_items").select("*").eq("user_id", user.id);
  const allItems = (itemsData ?? []) as WardrobeItem[];
  const items = allItems.filter(isWearableItem);
  if (items.length < MIN_ITEMS_FOR_DRAFTS) {
    return NextResponse.json({
      status: "insufficient",
      message: "Add a few more clothes (or mark items available) to get outfit ideas.",
    });
  }

  const itemsById = new Map<string, RoleClassifiableItem>(items.map((i) => [i.id, i]));

  // ---- 1) rules engine (0 tokens) ----
  let looks: EngineOutfit[] = engineOutfits(items, request.occasion, ideas);
  let usedAi = false;

  // ---- 2) AI escalation only when the engine can't fill the request ----
  if (looks.length < ideas) {
    const ai = await aiOutfits(user.id, items, request.occasion, request.notes);
    usedAi = !ai.cached && !ai.denied && ai.suggestions.length > 0;
    const seen = new Set(looks.map((l) => [...l.item_ids].sort().join("|")));
    for (const s of ai.suggestions) {
      if (looks.length >= ideas) break;
      // fail-closed validator on every AI look before a user can see it
      if (!validateOutfitByIds(s.item_ids, itemsById).valid) continue;
      const key = [...s.item_ids].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      looks.push({
        title: s.title,
        item_ids: s.item_ids,
        styling_reason: s.styling_reason ?? "Styled from your wardrobe.",
        confidence: s.confidence,
      });
    }
  }

  looks = looks.slice(0, ideas);
  if (looks.length === 0) {
    return NextResponse.json({
      status: "insufficient",
      message: "Couldn't build a complete look for this occasion from what's available — add a top and bottom (or a one-piece) and try again.",
    });
  }

  // ---- 3) store per generation mode ----
  // Writes use the service-role client: suggestion RLS is owner-read-approved
  // only (users can never insert/approve their own rows). The session user was
  // authenticated above and every write below is scoped to their own request.
  const admin = createAdminClient();
  const human = flags["occasions.mode"] === "human";
  const status = human ? ("draft" as const) : ("approved" as const);

  await admin.from("outfit_suggestions").delete().eq("request_id", params.requestId).eq("status", "draft");
  const rows = looks.map((l, i) => ({
    request_id: params.requestId,
    user_id: user.id,
    title: l.title,
    description: l.styling_reason,
    item_ids: l.item_ids,
    ai_confidence: l.confidence,
    source: usedAi ? "ai" : "engine",
    status,
    position: i + 1,
  }));
  const { error: insErr } = await admin.from("outfit_suggestions").insert(rows);
  if (insErr) return NextResponse.json({ status: "error", reason: "insert_failed" }, { status: 500 });

  await admin
    .from("outfit_requests")
    .update({ status: human ? "in_review" : "fulfilled" })
    .eq("id", params.requestId);

  await logAppEvent("outfits_generated", user.id, {
    occasion: request.occasion,
    count: rows.length,
    used_ai: usedAi,
    mode: human ? "human" : "auto",
  });

  return NextResponse.json({
    status: human ? "queued_for_review" : "ok",
    count: rows.length,
    message: human ? "Your looks are being double-checked by our stylist — ready shortly." : undefined,
  });
}
