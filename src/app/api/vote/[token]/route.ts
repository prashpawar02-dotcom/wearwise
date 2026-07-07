import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getFlags } from "@/lib/flags";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isShareToken, parseJsonBody, str } from "@/lib/validate";
import { logAppEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public vote endpoint (Module F). The ONLY unauthenticated API surface.
 *  - reads by token via service role (share_tokens has no public RLS select)
 *  - rate-limited per IP (scraping/abuse protection)
 *  - returns titles + short-lived signed image URLs ONLY — never names,
 *    emails, user ids, or storage paths
 * POST { optionKey } → tally one vote (per-IP limited; no auth required).
 */

interface TokenRow {
  token: string;
  user_id: string;
  options: { key: string; title: string; item_ids: string[] }[];
  votes: Record<string, number>;
  expires_at: string;
}

async function loadToken(token: string): Promise<TokenRow | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("share_tokens").select("*").eq("token", token).maybeSingle();
  const row = data as TokenRow | null;
  if (!row || Date.parse(row.expires_at) < Date.now()) return null;
  return row;
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const ip = clientIp(req);
  const rl = await rateLimit(`vote-get:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ status: "error", reason: "rate_limited" }, { status: 429 });

  if (!isShareToken(params.token)) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  const flags = await getFlags();
  if (!flags["share_vote.enabled"]) {
    return NextResponse.json({ status: "error", reason: "disabled" }, { status: 503 });
  }

  const row = await loadToken(params.token);
  if (!row) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  // Resolve item images via service role, short expiry — no paths leak.
  const admin = createAdminClient();
  const allIds = Array.from(new Set(row.options.flatMap((o) => o.item_ids)));
  const { data: items } = await admin
    .from("wardrobe_items")
    .select("id, image_path, category")
    .in("id", allIds);
  const paths = (items ?? []).map((i) => i.image_path);
  const { data: signed } = paths.length
    ? await admin.storage.from("wardrobe").createSignedUrls(paths, 15 * 60)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const itemView = new Map(
    (items ?? []).map((i) => [i.id, { image: urlByPath.get(i.image_path) ?? null, category: i.category }])
  );

  return NextResponse.json({
    status: "ok",
    options: row.options.map((o) => ({
      key: o.key,
      title: o.title,
      votes: row.votes[o.key] ?? 0,
      items: o.item_ids.map((id) => itemView.get(id)).filter(Boolean),
    })),
  });
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const ip = clientIp(req);
  const rl = await rateLimit(`vote-post:${ip}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ status: "error", reason: "rate_limited" }, { status: 429 });

  if (!isShareToken(params.token)) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  const flags = await getFlags();
  if (!flags["share_vote.enabled"]) {
    return NextResponse.json({ status: "error", reason: "disabled" }, { status: 503 });
  }

  const body = await parseJsonBody(req);
  const optionKey = str(body?.optionKey, 20);
  const row = await loadToken(params.token);
  if (!row) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });
  if (!optionKey || !row.options.some((o) => o.key === optionKey)) {
    return NextResponse.json({ status: "error", reason: "bad_option" }, { status: 400 });
  }

  const votes = { ...row.votes, [optionKey]: (row.votes[optionKey] ?? 0) + 1 };
  const admin = createAdminClient();
  const { error } = await admin.from("share_tokens").update({ votes }).eq("token", params.token);
  if (error) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });

  await logAppEvent("vote_cast", row.user_id, { option: optionKey });
  return NextResponse.json({ status: "ok", votes });
}
