import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validate";

export const runtime = "nodejs";

/** Delete a saved look (owner only — RLS enforces, filter restates). */
export async function DELETE(_req: Request, { params }: { params: { lookId: string } }) {
  if (!isUuid(params.lookId)) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("saved_looks")
    .delete()
    .eq("id", params.lookId)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ status: "error", reason: "db_error" }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
