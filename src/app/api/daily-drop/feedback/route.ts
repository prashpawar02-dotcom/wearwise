import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAppEvent } from "@/lib/events";
import type { DailyRecommendation } from "@/lib/types";

export const runtime = "nodejs";

/**
 * 👎 feedback on today's drop (Phase 3 → Phase 7 learning). ALWAYS FREE — never
 * gated, never behind a cap. Persists a coarse reason chip (or plain 👎) to
 * drop_feedback (owner-scoped RLS), then returns an immediate soft ack.
 *
 * POST { recommendationId, reason? }  reason ∈ too_formal | not_my_style |
 *   uncomfortable | weather | repeat   (optional; omit for a plain 👎)
 *  → { status: "recorded", ack }
 */
const REASONS = new Set(["too_formal", "not_my_style", "uncomfortable", "weather", "repeat"]);
const SOFT_ACK = "Noted — tomorrow gets sharper.";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  let body: { recommendationId?: string; reason?: string | null } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  if (!body.recommendationId) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  const reason = body.reason && REASONS.has(body.reason) ? body.reason : null;

  const { data: recData } = await supabase
    .from("daily_recommendations").select("*")
    .eq("id", body.recommendationId).eq("user_id", user.id).maybeSingle();
  const rec = recData as DailyRecommendation | null;
  if (!rec) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  const { error } = await supabase.from("drop_feedback").insert({
    user_id: user.id,
    recommendation_id: rec.id,
    local_date: rec.local_date,
    item_ids: rec.selected_item_ids ?? [],
    reason,
    occasion_context: rec.occasion_context,
  });
  if (error) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });

  await logAppEvent("feedback_negative", user.id, { reason: reason ?? "unspecified" });

  return NextResponse.json({ status: "recorded", ack: SOFT_ACK });
}
