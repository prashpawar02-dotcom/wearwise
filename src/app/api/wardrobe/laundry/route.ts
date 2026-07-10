import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  toInWash, toAvailable, toArchived, toggleWashTransition,
  ASK_ME_LESS_THRESHOLD, type Disposition, type LaundryTransition,
} from "@/lib/laundry";
import { prepareDailyDrop, userLocalDate } from "@/lib/daily-drop";
import type { AvailabilityStatus, WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Single write path for every laundry / availability transition (Phase 2).
 * Centralising it keeps in_wash_since honest with availability_status, updates
 * the per-category wear/wash learning stub, and enforces the "ask me less" +
 * "quiet auto-return" preferences in one place. RLS scopes every row to the
 * signed-in owner; the user is taken from the session, never the body.
 *
 * POST body (JSON), discriminated by `action`:
 *   { action: "toggle",   itemId }
 *   { action: "set_state", itemId, state: available|in_wash|archived }
 *   { action: "bulk_clean", itemIds: string[] }                 // laundry done
 *   { action: "postwear",  dispositions: [{ itemId, to }] }     // after Wore It
 *   { action: "ask_me_less" }                                   // silence the sheet
 *   { action: "dismiss_return_prompt" }                         // throttle the badge
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ status: "error", reason: "bad_json" }, { status: 400 });
  }
  const action = String(body.action ?? "");
  const now = new Date();

  // ---- Apply an availability transition to one item (owner-scoped) ----
  async function applyTransition(itemId: string, t: LaundryTransition) {
    return supabase
      .from("wardrobe_items")
      .update({ availability_status: t.availability_status, in_wash_since: t.in_wash_since })
      .eq("id", itemId)
      .eq("user_id", user!.id);
  }

  switch (action) {
    case "toggle":
    case "set_state": {
      const itemId = String(body.itemId ?? "");
      if (!itemId) return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });

      const { data: cur } = await supabase
        .from("wardrobe_items")
        .select("id, availability_status, category")
        .eq("id", itemId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cur) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

      let t: LaundryTransition;
      if (action === "toggle") {
        t = toggleWashTransition((cur as { availability_status: AvailabilityStatus }).availability_status, now);
      } else {
        const state = String(body.state ?? "") as AvailabilityStatus;
        if (state === "in_wash") t = toInWash(now);
        else if (state === "available") t = toAvailable();
        else if (state === "archived") t = toArchived();
        else return NextResponse.json({ status: "error", reason: "bad_state" }, { status: 400 });
      }

      const { error } = await applyTransition(itemId, t);
      if (error) return NextResponse.json({ status: "error", reason: "write_failed" }, { status: 500 });

      if (t.availability_status === "in_wash") {
        await bumpWashStats(supabase, user.id, [(cur as { category: string | null }).category]);
      }
      if (t.availability_status !== "available") {
        await invalidateActiveDrop(supabase, user.id, [itemId]);
      }
      return NextResponse.json({ status: "ok", availability_status: t.availability_status });
    }

    case "bulk_clean": {
      const ids = Array.isArray(body.itemIds) ? (body.itemIds as unknown[]).map(String).filter(Boolean) : [];
      if (ids.length === 0) return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
      const t = toAvailable();
      const { error } = await supabase
        .from("wardrobe_items")
        .update({ availability_status: t.availability_status, in_wash_since: t.in_wash_since })
        .in("id", ids)
        .eq("user_id", user.id)
        .eq("availability_status", "in_wash"); // only clean things actually in the wash
      if (error) return NextResponse.json({ status: "error", reason: "write_failed" }, { status: 500 });
      return NextResponse.json({ status: "ok", cleaned: ids.length });
    }

    case "postwear": {
      const raw = Array.isArray(body.dispositions) ? (body.dispositions as unknown[]) : [];
      const dispositions = raw
        .map((d) => d as { itemId?: unknown; to?: unknown })
        .map((d) => ({ itemId: String(d.itemId ?? ""), to: String(d.to ?? "") as Disposition }))
        .filter((d) => d.itemId && (d.to === "wash" || d.to === "wardrobe"));
      if (dispositions.length === 0) return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });

      const ids = dispositions.map((d) => d.itemId);
      const { data: itemRows } = await supabase
        .from("wardrobe_items")
        .select("id, category")
        .in("id", ids)
        .eq("user_id", user.id);
      const catById = new Map((itemRows ?? []).map((r) => [r.id as string, (r as { category: string | null }).category]));

      const toWash = dispositions.filter((d) => d.to === "wash").map((d) => d.itemId);
      const toWardrobe = dispositions.filter((d) => d.to === "wardrobe").map((d) => d.itemId);

      if (toWash.length) {
        const t = toInWash(now);
        await supabase
          .from("wardrobe_items")
          .update({ availability_status: t.availability_status, in_wash_since: t.in_wash_since })
          .in("id", toWash)
          .eq("user_id", user.id);
      }
      if (toWardrobe.length) {
        const t = toAvailable();
        await supabase
          .from("wardrobe_items")
          .update({ availability_status: t.availability_status, in_wash_since: t.in_wash_since })
          .in("id", toWardrobe)
          .eq("user_id", user.id);
      }

      // Learning stub (counts only): every disposed item was just worn; those
      // sent to wash also add a wash. Non-atomic read-modify-write is fine for a
      // single owner's stub.
      await bumpWearWashStats(
        supabase,
        user.id,
        dispositions.map((d) => ({ category: catById.get(d.itemId) ?? null, washed: d.to === "wash" }))
      );

      if (toWash.length) await invalidateActiveDrop(supabase, user.id, toWash);
      return NextResponse.json({ status: "ok", washed: toWash.length, wardrobe: toWardrobe.length });
    }

    case "ask_me_less": {
      const { data: prof } = await supabase
        .from("profiles")
        .select("postwear_prompt_dismissals")
        .eq("id", user.id)
        .maybeSingle();
      const next = ((prof as { postwear_prompt_dismissals: number } | null)?.postwear_prompt_dismissals ?? 0) + 1;
      const silence = next >= ASK_ME_LESS_THRESHOLD;
      const { error } = await supabase
        .from("profiles")
        .update({ postwear_prompt_dismissals: next, postwear_sheet_enabled: !silence })
        .eq("id", user.id);
      if (error) return NextResponse.json({ status: "error", reason: "write_failed" }, { status: 500 });
      return NextResponse.json({ status: "ok", dismissals: next, sheet_enabled: !silence });
    }

    case "dismiss_return_prompt": {
      await supabase
        .from("profiles")
        .update({ laundry_return_prompt_at: now.toISOString() })
        .eq("id", user.id);
      return NextResponse.json({ status: "ok" });
    }

    case "set_postwear_enabled": {
      const enabled = Boolean(body.enabled);
      // Re-enabling clears the "ask me less" tally so it doesn't instantly silence again.
      const patch: Record<string, unknown> = { postwear_sheet_enabled: enabled };
      if (enabled) patch.postwear_prompt_dismissals = 0;
      const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
      if (error) return NextResponse.json({ status: "error", reason: "write_failed" }, { status: 500 });
      return NextResponse.json({ status: "ok", sheet_enabled: enabled });
    }

    default:
      return NextResponse.json({ status: "error", reason: "unknown_action" }, { status: 400 });
  }
}

type Db = ReturnType<typeof createClient>;

/**
 * Write-time invalidation (Phase 3 hotfix). When an item leaves "available",
 * regenerate TODAY's active daily drop if it referenced that item — this also
 * refreshes the precomputed swap_candidates + alt_item_ids (prepareDailyDrop
 * recomputes them). Best-effort and never blocks the laundry response; read-time
 * validation remains the authoritative safety net for races and old rows.
 */
async function invalidateActiveDrop(supabase: Db, userId: string, affectedIds: string[]) {
  try {
    const ids = affectedIds.filter(Boolean);
    if (ids.length === 0) return;
    const { data: prof } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle();
    const localDate = userLocalDate((prof as { timezone: string | null } | null)?.timezone ?? null);
    const { data: rec } = await supabase
      .from("daily_recommendations")
      .select("selected_item_ids, status")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .maybeSingle();
    const sel = (rec as { selected_item_ids?: string[] } | null)?.selected_item_ids ?? [];
    if (sel.some((id) => ids.includes(id))) {
      await prepareDailyDrop(userId, { force: true, supabase });
    }
  } catch {
    // best-effort; read-time validation is the safety net
  }
}

/** Normalise a wardrobe category into a stable stats bucket. */
function catKey(category: string | null | undefined): string {
  const c = (category ?? "").trim().toLowerCase();
  return c || "other";
}

/** Increment only wash counters for the given categories (state toggles). */
async function bumpWashStats(supabase: Db, userId: string, categories: (string | null)[]) {
  await bumpWearWashStats(supabase, userId, categories.map((category) => ({ category, washed: true, worn: false })));
}

/**
 * Merge per-category deltas into laundry_wear_stats. `worn` defaults true (the
 * item was just worn); `washed` adds a wash. Read-modify-write, owner-scoped.
 */
async function bumpWearWashStats(
  supabase: Db,
  userId: string,
  entries: { category: string | null; washed: boolean; worn?: boolean }[]
) {
  const delta = new Map<string, { wears: number; washes: number }>();
  for (const e of entries) {
    const key = catKey(e.category);
    const d = delta.get(key) ?? { wears: 0, washes: 0 };
    if (e.worn !== false) d.wears += 1;
    if (e.washed) d.washes += 1;
    delta.set(key, d);
  }
  if (delta.size === 0) return;

  const keys = [...delta.keys()];
  const { data: existing } = await supabase
    .from("laundry_wear_stats")
    .select("category, wears, washes, total_wears")
    .eq("user_id", userId)
    .in("category", keys);
  const prev = new Map(
    (existing ?? []).map((r) => [
      r.category as string,
      r as { wears: number; washes: number; total_wears: number },
    ])
  );

  const rows = keys.map((category) => {
    const d = delta.get(category)!;
    const p = prev.get(category) ?? { wears: 0, washes: 0, total_wears: 0 };
    // wears counts wears SINCE last wash → reset to 0 when a wash lands.
    const wears = d.washes > 0 ? 0 : p.wears + d.wears;
    return {
      user_id: userId,
      category,
      wears,
      washes: p.washes + d.washes,
      total_wears: p.total_wears + d.wears,
      updated_at: new Date().toISOString(),
    };
  });
  await supabase.from("laundry_wear_stats").upsert(rows, { onConflict: "user_id,category" });
}
