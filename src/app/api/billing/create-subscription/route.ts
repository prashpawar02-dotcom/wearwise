import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createRzpSubscription, createRzpOrder, publicKeyId, PRICING } from "@/lib/razorpay";
import { getFlags } from "@/lib/flags";
import { rateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/validate";
import { logAppEvent } from "@/lib/events";

export const runtime = "nodejs";

/**
 * Start a checkout (Module E).
 * POST { kind: 'monthly' | 'yearly' | 'analysis' }
 *  - monthly/yearly → Razorpay subscription; client opens Razorpay Checkout.
 *  - analysis       → Rs.199 one-time order (Manual Wardrobe Analysis).
 * The webhook — not this route, and never the client — flips entitlements.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`billing:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ status: "error", reason: "rate_limited" }, { status: 429 });

  const flags = await getFlags();
  if (!flags["billing.enabled"]) {
    return NextResponse.json({ status: "disabled", message: "Upgrades are paused for a moment — back soon." });
  }

  const body = await parseJsonBody(req);
  const kind = body?.kind;
  if (kind !== "monthly" && kind !== "yearly" && kind !== "analysis") {
    return NextResponse.json({ status: "error", reason: "bad_request" }, { status: 400 });
  }

  const keyId = publicKeyId();
  if (!keyId) return NextResponse.json({ status: "error", reason: "billing_not_configured" }, { status: 503 });

  if (kind === "analysis") {
    const order = await createRzpOrder(PRICING.analysisInr, user.id, "manual_analysis");
    if (!order?.id) return NextResponse.json({ status: "error", reason: "provider_error" }, { status: 502 });
    // Track the pending purchase server-side (service role).
    const admin = createAdminClient();
    await admin.from("analysis_purchases").insert({
      user_id: user.id,
      razorpay_order_id: String(order.id),
      status: "created",
    });
    await logAppEvent("upgrade_started", user.id, { kind });
    return NextResponse.json({
      status: "ok",
      mode: "order",
      keyId,
      orderId: order.id,
      amount: PRICING.analysisInr * 100,
      currency: "INR",
    });
  }

  const sub = await createRzpSubscription(kind, user.id);
  if (!sub?.id) return NextResponse.json({ status: "error", reason: "provider_error" }, { status: 502 });

  await logAppEvent("upgrade_started", user.id, { kind });
  return NextResponse.json({ status: "ok", mode: "subscription", keyId, subscriptionId: sub.id });
}
