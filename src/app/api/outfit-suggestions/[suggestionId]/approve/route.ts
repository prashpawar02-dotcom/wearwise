import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateOutfitByIds, type RoleClassifiableItem } from "@/lib/outfitValidation";
import type { WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Server-side approval guard for an outfit suggestion.
 *
 * This is the LAST line of defense: even if the admin UI fails to disable the
 * Approve button, an outfit that fails structure validation can never become
 * `approved` (and therefore can never reach a user's dashboard). It FAILS
 * CLOSED — unresolved item ids, missing item types, or unknown roles all block
 * approval. Auth/RLS are unchanged; this runs as the signed-in admin and the
 * existing admin RLS policies still apply to every query/update.
 */
export async function POST(
  _req: Request,
  { params }: { params: { suggestionId: string } }
) {
  const supabase = createClient();

  // ---- Admin only ----
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return NextResponse.json({ status: "error", reason: "forbidden" }, { status: 403 });

  // ---- Load the suggestion (admin RLS allows) ----
  const { data: suggestion } = await supabase
    .from("outfit_suggestions")
    .select("id, request_id, user_id, item_ids, status")
    .eq("id", params.suggestionId)
    .single();
  if (!suggestion) {
    return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });
  }

  // ---- Re-validate against the owner's CURRENT wardrobe (fail closed) ----
  const itemIds: string[] = suggestion.item_ids ?? [];
  const { data: itemsData } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", suggestion.user_id)
    .in("id", itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"]);
  const items = (itemsData ?? []) as WardrobeItem[];
  const itemsById = new Map<string, RoleClassifiableItem>(items.map((i) => [i.id, i]));

  const result = validateOutfitByIds(itemIds, itemsById);
  if (!result.valid) {
    // 422: the request was understood but the outfit is not approvable.
    return NextResponse.json(
      { status: "invalid", reason: result.reason ?? "This outfit can't be approved." },
      { status: 422 }
    );
  }

  // ---- Approve (RLS still enforces admin-only write) ----
  const { error: updErr } = await supabase
    .from("outfit_suggestions")
    .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
    .eq("id", suggestion.id);
  if (updErr) {
    return NextResponse.json({ status: "error", reason: "update_failed" }, { status: 500 });
  }

  await supabase
    .from("outfit_requests")
    .update({ status: "fulfilled" })
    .eq("id", suggestion.request_id);

  return NextResponse.json({ status: "ok" });
}
