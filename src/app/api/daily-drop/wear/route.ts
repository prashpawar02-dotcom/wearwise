import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAppEvent } from "@/lib/events";

export const runtime = "nodejs";

/**
 * Confirm "Wore It" for TODAY's Daily Drop — Phase 4C atomicity hotfix
 * (migration 0023).
 *
 * POST { recommendationId, itemIds }
 *  -> { status: "ok" | "already" | "stale" | "error", reason?, wornAt?, itemCount? }
 *
 * This route is now a THIN wrapper: authenticate, validate request shape,
 * call the ONE atomic RPC public.confirm_daily_drop_wear() exactly once, map
 * its result, and log non-blocking telemetry AFTER the result is known.
 *
 * There are NO independent daily_recommendations or wardrobe_items writes
 * here anymore. A prior version of this route performed the idempotency
 * check and both core writes as three separate PostgREST calls with no
 * shared transaction — a transactional-integrity audit found that allowed
 * two concurrent requests to both pass the status check, worn_at to be
 * overwritten by whichever request committed last, and a wardrobe_items
 * write failure to be silently swallowed after daily_recommendations had
 * already committed, with no repair path (the next request's idempotency
 * check would short-circuit to "already" before ever retrying it). See
 * supabase/migrations/0023_atomic_wear_confirmation.sql for the full fix:
 * ownership, idempotency, exact item-set match, availability re-check, row
 * locking (FOR UPDATE, deterministic order), and both core writes, all
 * inside ONE Postgres transaction with one shared timestamp.
 *
 * Response mapping (RPC status -> HTTP response):
 *   confirmed      -> { status: "ok", wornAt, itemCount }            200
 *   already         -> { status: "already", wornAt, itemCount }       200
 *   stale           -> { status: "stale", reason }                    200
 *   invalid_items   -> { status: "error", reason }                    400
 *   not_found       -> { status: "error", reason: "not_found" }       404
 *   error (RPC-level, e.g. unauthenticated) -> { status:"error", ... } 401/400
 *   RPC call itself failed (network/exception) -> { status:"error",
 *     reason:"rpc_failed" }                                           500
 *   unrecognized RPC shape -> { status:"error",
 *     reason:"unexpected_rpc_result" }                                500
 * The RPC call failing NEVER falls through to a success response — every
 * branch below either maps a specific, known RPC status or fails closed.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  let body: { recommendationId?: string; itemIds?: unknown } = {};
  try {
    body = (await req.json()) as { recommendationId?: string; itemIds?: unknown };
  } catch {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }
  const { recommendationId } = body;
  const itemIds = Array.isArray(body.itemIds)
    ? (body.itemIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  if (!recommendationId) {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }

  // ---- The ONE atomic call. Every ownership/idempotency/set/availability
  // check and BOTH core writes happen inside this single database
  // transaction (migration 0023). Nothing after this line performs a
  // separate daily_recommendations or wardrobe_items write.
  const { data, error } = await supabase.rpc("confirm_daily_drop_wear", {
    p_recommendation_id: recommendationId,
    p_item_ids: itemIds,
  });

  // The RPC call itself failing (network, permissions, a raised exception
  // inside the function, a malformed uuid[] cast) must NEVER be reported as
  // success — fail closed immediately, before any telemetry.
  if (error) {
    return NextResponse.json({ status: "error", reason: "rpc_failed" }, { status: 500 });
  }

  const result = (Array.isArray(data) ? data[0] : data) as
    | { status?: string; worn_at?: string | null; item_count?: number; reason?: string | null }
    | null
    | undefined;
  const rpcStatus = result?.status;
  const wornAt = result?.worn_at ?? null;
  const itemCount = result?.item_count ?? 0;
  const reason = result?.reason ?? null;

  // ---- Telemetry AFTER the RPC result is known. Treated as non-critical:
  // a logging failure here must never change the response already decided
  // by the RPC result above (logAppEvent already never throws, but the
  // ordering itself — decide the response, THEN log — is what guarantees
  // telemetry can't influence correctness).
  const userId = user.id; // captured outside the closure so TS keeps the null-check narrowing
  async function mirror(name: string, props: Record<string, string | number | boolean | null>) {
    await logAppEvent(name, userId, props);
  }

  switch (rpcStatus) {
    case "confirmed":
      await mirror("daily_drop_wear_confirmed", { item_count: itemCount });
      return NextResponse.json({ status: "ok", wornAt, itemCount });

    case "already":
      return NextResponse.json({ status: "already", wornAt, itemCount });

    case "stale":
      await mirror("stale_outfit_blocked", { surface: "daily_drop_wear", reason: reason ?? "stale" });
      return NextResponse.json({ status: "stale", reason: reason ?? "stale" });

    case "invalid_items":
      await mirror("stale_outfit_blocked", { surface: "daily_drop_wear", reason: reason ?? "invalid_items" });
      return NextResponse.json({ status: "error", reason: reason ?? "invalid_items" }, { status: 400 });

    case "not_found":
      return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

    case "error":
      if (reason === "unauthenticated") {
        return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ status: "error", reason: reason ?? "error" }, { status: 400 });

    default:
      // The RPC returned a shape we don't recognize — never guess success.
      return NextResponse.json({ status: "error", reason: "unexpected_rpc_result" }, { status: 500 });
  }
}
