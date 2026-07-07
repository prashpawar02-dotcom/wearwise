import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getFlags } from "@/lib/flags";
import { rateLimit } from "@/lib/rate-limit";
import { parseJsonBody, uuidArray } from "@/lib/validate";
import { logAppEvent } from "@/lib/events";

export const runtime = "nodejs";

const TOKEN_TTL_DAYS = 7;

/**
 * Create a share token (Module F growth loop).
 * POST { suggestionIds: [1..3 ids] } → { url } — a public, signed, expiring
 * vote page. The token snapshots titles + item ids only (NO names, NO email:
 * the public page is PII-free by construction).
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`share:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ status: "error", reason: "rate_limited" }, { status: 429 });

  const flags = await getFlags();
  if (!flags["share_vote.enabled"]) {
    return NextResponse.json({ status: "disabled", message: "Sharing is taking a short break — back soon." });
  }

  const body = await parseJsonBody(req);
  const suggestionIds = uuidArray(body?.suggestionIds, 3);
  if (!suggestionIds) return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });

  // Own approved suggestions only (session read under RLS).
  const { data: suggestions } = await supabase
    .from("outfit_suggestions")
    .select("id, title, item_ids")
    .eq("user_id", user.id)
    .in("id", suggestionIds);
  if (!suggestions || suggestions.length === 0) {
    return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });
  }

  const token = randomBytes(18).toString("base64url"); // 24 chars, URL-safe
  const options = suggestions.map((s, i) => ({
    key: `option_${i + 1}`,
    title: s.title ?? `Look ${i + 1}`,
    item_ids: s.item_ids,
  }));

  const admin = createAdminClient();
  const { error } = await admin.from("share_tokens").insert({
    token,
    user_id: user.id,
    suggestion_ids: suggestions.map((s) => s.id),
    options,
    votes: {},
    expires_at: new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000).toISOString(),
  });
  if (error) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });

  await logAppEvent("share_created", user.id, { option_count: options.length });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return NextResponse.json({ status: "ok", token, url: `${base}/vote/${token}` });
}
