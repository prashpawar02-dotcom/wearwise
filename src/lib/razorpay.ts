// =====================================================================
// WearWise — Razorpay integration (Module E). SERVER-ONLY, REST-based
// (no SDK dependency). Key id/secret live in env only.
//   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
//   RAZORPAY_PLAN_ID_MONTHLY / RAZORPAY_PLAN_ID_YEARLY (dashboard-created)
// =====================================================================
import { createHmac, timingSafeEqual } from "crypto";

export const PRICING = {
  monthlyInr: 99,
  anchorMonthlyInr: 149,
  yearlyInr: 999,
  analysisInr: 199,
} as const;

function creds(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

function authHeader(): string | null {
  const c = creds();
  return c ? "Basic " + Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64") : null;
}

export function publicKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID ?? null;
}

async function rzp(path: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const auth = authHeader();
  if (!auth) return null;
  try {
    const resp = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Create a Pro subscription (monthly or yearly plan). */
export async function createRzpSubscription(cycle: "monthly" | "yearly", userId: string) {
  const planId = cycle === "yearly" ? process.env.RAZORPAY_PLAN_ID_YEARLY : process.env.RAZORPAY_PLAN_ID_MONTHLY;
  if (!planId) return null;
  return rzp("subscriptions", {
    plan_id: planId,
    total_count: cycle === "yearly" ? 10 : 120,
    customer_notify: 1,
    notes: { user_id: userId, cycle },
  });
}

/** Create a one-time order (Rs.199 Manual Analysis). Amount in paise. */
export async function createRzpOrder(amountInr: number, userId: string, purpose: string) {
  return rzp("orders", {
    amount: Math.round(amountInr * 100),
    currency: "INR",
    notes: { user_id: userId, purpose },
  });
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Verify the X-Razorpay-Signature header on a webhook body (HMAC-SHA256). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Verify a client checkout success signature (order flow). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const c = creds();
  if (!c) return false;
  const expected = createHmac("sha256", c.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Verify a client subscription success signature. */
export function verifySubscriptionSignature(subscriptionId: string, paymentId: string, signature: string): boolean {
  const c = creds();
  if (!c) return false;
  const expected = createHmac("sha256", c.keySecret).update(`${paymentId}|${subscriptionId}`).digest("hex");
  return safeEqualHex(expected, signature);
}
