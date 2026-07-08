import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recommendOutfits } from "@/lib/engine/recommend";
import { loadEngineContext } from "@/lib/engine/loadContext";
import { DEFAULT_OCCASION_PROFILES } from "@/lib/engine/config";
import type { EngineOccasion, ScoredOutfit } from "@/lib/engine/types";
import type { WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin QA — Engine v2 factor breakdown per generated outfit (Phase 1).
 * GET /api/admin/engine-qa?occasion=work&userId=<uuid>&tempC=32&rain=0
 *
 * Admin only. Runs the deterministic pipeline against a user's wardrobe
 * (defaults to the admin's own) and returns the hero + backups with their
 * full scoring-factor contributions, confidence, and pipeline diagnostics.
 * Read-only: it computes on demand and stores nothing.
 */
async function requireAdminUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, supabase };
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  return { user: me?.is_admin ? user : null, supabase };
}

function isEngineOccasion(v: string): v is EngineOccasion {
  return Object.prototype.hasOwnProperty.call(DEFAULT_OCCASION_PROFILES, v);
}

function serialize(o: ScoredOutfit) {
  return {
    template: o.template,
    item_ids: o.itemIds,
    items: o.items.map((i) => ({ id: i.id, name: i.user_facing_name ?? i.category, formality: i.formality })),
    total: Number(o.total.toFixed(3)),
    confidence: Number(o.confidence.toFixed(3)),
    why_this_works: o.whyThisWorks,
    factors: o.factors.map((f) => ({ ...f, contribution: Number(f.contribution.toFixed(3)) })),
    penalties: o.penalties.map((f) => ({ ...f, contribution: Number(f.contribution.toFixed(3)) })),
  };
}

export async function GET(req: Request) {
  const { user, supabase } = await requireAdminUser();
  if (!user) return NextResponse.json({ status: "error", reason: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const occasion = (url.searchParams.get("occasion") ?? "work").toLowerCase();
  if (!isEngineOccasion(occasion)) {
    return NextResponse.json(
      { status: "error", reason: "bad_occasion", allowed: Object.keys(DEFAULT_OCCASION_PROFILES) },
      { status: 400 },
    );
  }
  const targetUserId = url.searchParams.get("userId") ?? user.id;
  const tempRaw = url.searchParams.get("tempC");
  const tempC = tempRaw != null && tempRaw !== "" ? Number(tempRaw) : null;
  const isRaining = url.searchParams.get("rain") === "1";

  const { data: itemData } = await supabase.from("wardrobe_items").select("*").eq("user_id", targetUserId);
  const items = (itemData ?? []) as WardrobeItem[];

  const ctx = await loadEngineContext({
    supabase,
    userId: targetUserId,
    occasion,
    weather: { tempC: Number.isFinite(tempC as number) ? (tempC as number) : null, isRaining },
  });

  const result = recommendOutfits(items, ctx, 3);

  return NextResponse.json({
    status: "ok",
    occasion,
    userId: targetUserId,
    weather: ctx.weather,
    diagnostics: result.diagnostics,
    dual_pick: result.dualPick,
    fail_reason: result.failReason ?? null,
    hero: result.hero ? serialize(result.hero) : null,
    backups: result.backups.map(serialize),
    config: { scoringWeights: ctx.config.scoringWeights, penaltyWeights: ctx.config.penaltyWeights, thresholds: ctx.config.thresholds },
  });
}
