import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FLAG_DEFAULTS, FLAG_KEYS, getFlags, setFlag, type Flags } from "@/lib/flags";
import { logAppEvent } from "@/lib/events";
import { parseJsonBody } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin Control Panel API (Module A).
 * GET  → current flags (admin only)
 * POST → { key, value } set one flag (admin verified, then service-role write)
 * Changes apply live: getFlags() cache TTL is ~30s and is invalidated on write.
 */
async function requireAdminUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  return me?.is_admin ? user : null;
}

export async function GET() {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ status: "error", reason: "forbidden" }, { status: 403 });
  return NextResponse.json({ status: "ok", flags: await getFlags(), keys: FLAG_KEYS });
}

export async function POST(req: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ status: "error", reason: "forbidden" }, { status: 403 });

  const body = await parseJsonBody(req);
  const key = body?.key as keyof Flags | undefined;
  const value = body?.value;
  if (!key || !(key in FLAG_DEFAULTS) || typeof value !== typeof FLAG_DEFAULTS[key]) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  // Numeric guardrails must stay sane.
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0 || value > 1_000_000)) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }

  const ok = await setFlag(key, value as Flags[keyof Flags], user.id);
  if (!ok) return NextResponse.json({ status: "error", reason: "write_failed" }, { status: 500 });

  await logAppEvent("flag_changed", user.id, { key, value: String(value) });
  return NextResponse.json({ status: "ok", flags: await getFlags() });
}
