import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { logAppEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook (Module E) — the ONLY writer of paid entitlements.
 * Security:
 *  - HMAC signature verified on the RAW body before anything else
 *  - idempotent: event id recorded in billing_events; replays are no-ops
 *  - service-role writes only (subscriptions has no client write policy)
 * A user can never self-upgrade: no client-reachable path writes these tables.
 */

interface RzpEvent {
  event?: string;
  payload?: {
    subscription?: { entity?: { id?: string; status?: string; current_end?: number; notes?: Record<string, string>; customer_id?: string } };
    payment?: { entity?: { id?: string; order_id?: string; notes?: Record<string, string> } };
  };
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ status: "error", reason: "bad_signature" }, { status: 401 });
  }

  let event: RzpEvent;
  try {
    event = JSON.parse(rawBody) as RzpEvent;
  } catch {
    return NextResponse.json({ status: "error", reason: "bad_json" }, { status: 400 });
  }

  const eventId = req.headers.get("x-razorpay-event-id") ?? "";
  const eventType = event.event ?? "unknown";
  const admin = createAdminClient();

  // ---- idempotency: first insert wins; replays exit early ----
  if (eventId) {
    const { error: dupErr } = await admin
      .from("billing_events")
      .insert({ event_id: eventId, event_type: eventType });
    if (dupErr) return NextResponse.json({ status: "ok", note: "duplicate_ignored" });
  }

  // ---- subscription lifecycle → subscriptions table ----
  const subEntity = event.payload?.subscription?.entity;
  if (subEntity?.id) {
    const userId = subEntity.notes?.user_id;
    if (userId) {
      const statusMap: Record<string, string> = {
        activated: "active",
        charged: "active",
        authenticated: "active",
        pending: "past_due",
        halted: "past_due",
        cancelled: "canceled",
        completed: "expired",
        expired: "expired",
      };
      const rzpStatus = subEntity.status ?? "";
      const status = statusMap[rzpStatus] ?? (eventType.includes("cancel") ? "canceled" : "active");
      const isPro = status === "active";
      await admin.from("subscriptions").upsert({
        user_id: userId,
        plan: isPro ? "pro" : "free",
        status,
        current_period_end: subEntity.current_end ? new Date(subEntity.current_end * 1000).toISOString() : null,
        razorpay_subscription_id: subEntity.id,
        razorpay_customer_id: subEntity.customer_id ?? null,
        updated_at: new Date().toISOString(),
      });
      await logAppEvent(isPro ? "subscription_active" : "subscription_changed", userId, { status, event: eventType });
    }
  }

  // ---- one-time Manual Analysis payment ----
  const payEntity = event.payload?.payment?.entity;
  if (eventType === "payment.captured" && payEntity?.order_id) {
    const { data: purchase } = await admin
      .from("analysis_purchases")
      .select("id, user_id, status")
      .eq("razorpay_order_id", payEntity.order_id)
      .maybeSingle();
    if (purchase && purchase.status === "created") {
      await admin
        .from("analysis_purchases")
        .update({ status: "paid" })
        .eq("id", purchase.id);
      await logAppEvent("analysis_purchased", purchase.user_id, {});
      // Report generation is picked up by /api/analysis/generate (user-triggered)
      // or could be cron'd; keeping delivery async keeps the webhook fast.
    }
  }

  return NextResponse.json({ status: "ok" });
}
