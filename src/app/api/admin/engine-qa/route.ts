import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recommendOutfits } from "@/lib/engine/recommend";
import { eligiblePool } from "@/lib/engine/filters";
import { engineRole, culturalSourceOf } from "@/lib/engine/classify";
import { loadEngineContext } from "@/lib/engine/loadContext";
import { DEFAULT_OCCASION_PROFILES } from "@/lib/engine/config";
import type { EngineOccasion, ScoredOutfit } from "@/lib/engine/types";
import type { WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin QA — Engine v2 factor breakdown + normalization diagnostics (Phase 1).
 * GET /api/admin/engine-qa?occasion=work&userId=<uuid>&tempC=32&rain=0
 *
 * Admin only. Runs the deterministic pipeline against a user's wardrobe
 * (defaults to the admin's own) and returns hero + backups with their scoring
 * factors, confidence, pipeline diagnostics, and — to debug "why did N items
 * drop?" — raw/normalized category & availability counts plus per-filter
 * rejection counts. Read-only: computes on demand, stores nothing.
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
    completeness: o.completeness,
    missing_slots: o.missingSlots,
    partial_reason: o.partialReason ?? null,
    item_ids: o.itemIds,
    items: o.items.map((i) => ({ id: i.id, name: i.user_facing_name ?? i.category, formality: i.formality })),
    total: Number(o.total.toFixed(3)),
    confidence: Number(o.confidence.toFixed(3)),
    why_this_works: o.whyThisWorks,
    factors: o.factors.map((f) => ({ ...f, contribution: Number(f.contribution.toFixed(3)) })),
    penalties: o.penalties.map((f) => ({ ...f, contribution: Number(f.contribution.toFixed(3)) })),
  };
}

/** Count occurrences of a key over items (skips null/empty as "(none)"). */
function countBy(items: WardrobeItem[], key: (i: WardrobeItem) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) {
    const k = (key(i) ?? "(none)") || "(none)";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
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

  // Normalization diagnostics (why did items drop before candidate building?).
  const availableItems = items.filter((i) => (i.availability_status ?? "available") === "available");
  const { pool, rejected } = eligiblePool(items, ctx);
  const rejectionCounts = countBy(rejected.map((r) => r.item), () => "x"); // placeholder replaced below
  delete rejectionCounts.x;
  for (const r of rejected) rejectionCounts[r.filter] = (rejectionCounts[r.filter] ?? 0) + 1;
  const normalizedItemsSample = items.slice(0, 12).map((i) => ({
    id: i.id,
    label: i.user_facing_name ?? i.category ?? "(unnamed)",
    category: i.category,
    role: engineRole(i),
    availability: i.availability_status ?? "available",
    formality: i.formality ?? null,
    cultural_tag: i.cultural_tag ?? null,
    cultural_source: culturalSourceOf(i),
    occasion_tags: i.occasion_tags ?? [],
  }));

  const result = recommendOutfits(items, ctx, 3);

  return NextResponse.json({
    status: "ok",
    occasion,
    userId: targetUserId,
    weather: ctx.weather,
    diagnostics: result.diagnostics,
    normalization: {
      categoryCountsRaw: countBy(items, (i) => i.category),
      categoryCountsAfterAvailability: countBy(availableItems, (i) => i.category),
      availabilityStatusCounts: countBy(items, (i) => i.availability_status ?? "available"),
      eligiblePoolSize: pool.length,
      rejectionCounts,
      normalizedItemsSample,
    },
    outfit_status: result.outfitStatus,
    missing_slots: result.missingSlots,
    partial_reason: result.partialReason ?? null,
    partial_reason_code: result.partialReasonCode ?? null,
    dual_pick: result.dualPick,
    fail_reason: result.failReason ?? null,
    hero: result.hero ? serialize(result.hero) : null,
    backups: result.backups.map(serialize),
    config: { scoringWeights: ctx.config.scoringWeights, penaltyWeights: ctx.config.penaltyWeights, thresholds: ctx.config.thresholds },
  });
}
