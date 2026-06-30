import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Admin-only: reject a suggestion (set status = 'rejected').
 *
 * Rejecting is always safe — rejected suggestions are never shown to users — so
 * this needs no structure validation. It is the preferred way to retire an
 * invalid look (including an already-approved one). Auth/RLS unchanged: this
 * runs as the signed-in admin and the existing admin RLS policy authorizes the
 * write.
 */
export async function POST(
  _req: Request,
  { params }: { params: { suggestionId: string } }
) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return NextResponse.json({ status: "error", reason: "forbidden" }, { status: 403 });

  const { error } = await supabase
    .from("outfit_suggestions")
    .update({ status: "rejected" })
    .eq("id", params.suggestionId);
  if (error) return NextResponse.json({ status: "error", reason: "update_failed" }, { status: 500 });

  return NextResponse.json({ status: "ok" });
}
