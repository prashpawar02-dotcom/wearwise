import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Admin-only: edit the safe, editable fields of a suggestion.
 *
 * This NEVER approves. Content/item edits are allowed in any state; the only
 * status transition permitted here is back to 'draft' (un-approve / re-open for
 * curation), which is safe because drafts are never shown to users. Approving
 * goes through .../approve (which re-validates) and rejecting through
 * .../reject. Unknown fields are ignored. Auth/RLS unchanged — runs as the
 * signed-in admin under existing admin RLS policies.
 */

const MAX_LEN = {
  title: 80,
  description: 400,
  avoid_note: 300,
  missing_item_suggestion: 200,
} as const;
type TextField = keyof typeof MAX_LEN;
const TEXT_FIELDS: TextField[] = ["title", "description", "avoid_note", "missing_item_suggestion"];

export async function PATCH(
  req: Request,
  { params }: { params: { suggestionId: string } }
) {
  const supabase = createClient();

  // ---- Admin only ----
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return NextResponse.json({ status: "error", reason: "forbidden" }, { status: 403 });

  // ---- Parse + whitelist ----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "error", reason: "invalid_json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  for (const f of TEXT_FIELDS) {
    if (!(f in b)) continue;
    const v = b[f];
    if (v === null) {
      update[f] = null;
    } else if (typeof v === "string") {
      const trimmed = v.trim().slice(0, MAX_LEN[f]);
      update[f] = trimmed.length ? trimmed : null;
    } else {
      return NextResponse.json({ status: "error", reason: `bad_field:${f}` }, { status: 400 });
    }
  }

  if ("item_ids" in b) {
    const v = b.item_ids;
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
      return NextResponse.json({ status: "error", reason: "bad_field:item_ids" }, { status: 400 });
    }
    update.item_ids = Array.from(new Set(v as string[])).slice(0, 12);
  }

  // Only safe status transition allowed here: return to draft (un-approve).
  if ("status" in b) {
    if (b.status !== "draft") {
      return NextResponse.json(
        { status: "error", reason: "Only 'draft' is allowed here. Use /approve or /reject for other transitions." },
        { status: 422 }
      );
    }
    update.status = "draft";
    update.approved_by = null;
    update.approved_at = null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ status: "error", reason: "nothing_to_update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("outfit_suggestions")
    .update(update)
    .eq("id", params.suggestionId);
  if (error) return NextResponse.json({ status: "error", reason: "update_failed" }, { status: 500 });

  return NextResponse.json({ status: "ok" });
}
