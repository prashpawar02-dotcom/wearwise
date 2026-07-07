import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkinStreak } from "@/lib/streaks";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Idempotent daily streak check-in (Module C).
 * Session-authenticated; the WRITE happens via service role inside
 * checkinStreak (streaks has no client write policy → unfakeable).
 * Calling twice in one local day is a no-op ("already_counted").
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`streak:${user.id}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ status: "error", reason: "rate_limited" }, { status: 429 });

  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
  const result = await checkinStreak(user.id, profile?.timezone ?? null);
  if (result.status === "error") {
    return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result });
}
