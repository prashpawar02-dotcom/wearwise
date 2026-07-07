"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * The paywall sheet (Module E). Anchored pricing (₹149 struck → ₹99 launch,
 * ₹999/yr "2 months free"), one primary CTA, loss-aversion framing.
 * Payment: Razorpay Checkout (script loaded on demand). Entitlements unlock
 * ONLY via the signature-verified webhook — never from this client.
 */

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const PRO_POINTS = [
  "Unlimited wardrobe items",
  "Unlimited swaps & extra options daily",
  "All occasions — festive, ethnic, travel, party",
  "3 curated ideas per request",
  "Unlimited Lookbook + streak freezes",
  "Weather-aware outfits & trip planning",
];

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

export function UpgradeSheet({
  from,
  isPro,
  isTrialActive,
  trialEndsAt,
}: {
  from: string;
  isPro: boolean;
  isTrialActive: boolean;
  trialEndsAt: string | null;
}) {
  const router = useRouter();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout(kind: "monthly" | "yearly" | "analysis") {
    setBusy(true);
    setError("");
    track("upgrade_started", { kind, from });
    try {
      const resp = await fetch("/api/billing/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const json = (await resp.json()) as {
        status: string; mode?: string; keyId?: string; subscriptionId?: string;
        orderId?: string; amount?: number; currency?: string; message?: string;
      };
      if (json.status === "disabled") { setError(json.message ?? "Upgrades are paused."); return; }
      if (json.status !== "ok" || !json.keyId) { setError("Checkout isn't available right now — try again shortly."); return; }
      if (!(await loadRazorpay()) || !window.Razorpay) { setError("Couldn't load the payment window — check your connection."); return; }

      const base = {
        key: json.keyId,
        name: "WearWise",
        description: kind === "analysis" ? "Manual Wardrobe Analysis" : "WearWise Pro",
        theme: { color: "#4A2C3D" },
        handler: () => {
          // Entitlements flip via the verified webhook; give it a beat, then refresh.
          track("payment_completed_client", { kind });
          setTimeout(() => { router.push("/dashboard?upgraded=1"); router.refresh(); }, 1500);
        },
      };
      const options =
        json.mode === "subscription"
          ? { ...base, subscription_id: json.subscriptionId }
          : { ...base, order_id: json.orderId, amount: json.amount, currency: json.currency ?? "INR" };
      new window.Razorpay(options).open();
    } catch {
      setError("Something went wrong starting checkout — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (isPro) {
    return (
      <div className="animate-fade-in px-6 pt-10 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-champagne" />
        <h1 className="mt-3 font-serif text-2xl">You&apos;re on Pro.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your full daily stylist is active. Enjoy it.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in px-6 pt-8">
      {/* Loss-aversion headline: protect what they already built */}
      <h1 className="font-serif text-[1.6rem] leading-tight text-charcoal">
        Keep your streak and your <em className="text-plum">full stylist</em>.
      </h1>
      <p className="mt-2 text-sm text-graphite">
        {isTrialActive && trialEndsAt
          ? `Your full-access trial ends ${new Date(trialEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. Keep everything you've set up.`
          : "Your wardrobe is already uploaded. Pro keeps every outfit, option, and occasion open."}
      </p>

      <ul className="mt-5 space-y-2.5">
        {PRO_POINTS.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-sm text-charcoal">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-sage" /> {p}
          </li>
        ))}
      </ul>

      {/* Anchored pricing */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={() => setCycle("monthly")}
          className={cn(
            "rounded-ww-md border p-4 text-left transition-colors",
            cycle === "monthly" ? "border-plum bg-plum/5" : "border-border bg-card"
          )}
        >
          <p className="text-xs text-muted-foreground line-through">₹149/mo</p>
          <p className="font-serif text-xl text-charcoal">₹99<span className="text-sm">/mo</span></p>
          <p className="text-[11px] text-graphite">Launch price</p>
        </button>
        <button
          onClick={() => setCycle("yearly")}
          className={cn(
            "relative rounded-ww-md border p-4 text-left transition-colors",
            cycle === "yearly" ? "border-plum bg-plum/5" : "border-border bg-card"
          )}
        >
          <span className="absolute -top-2 right-3 rounded-full bg-champagne px-2 py-0.5 text-[10px] font-medium text-white">
            2 months free
          </span>
          <p className="text-xs text-muted-foreground">&nbsp;</p>
          <p className="font-serif text-xl text-charcoal">₹999<span className="text-sm">/yr</span></p>
          <p className="text-[11px] text-graphite">≈ ₹83/mo</p>
        </button>
      </div>

      <Button size="full" className="mt-5" disabled={busy} onClick={() => checkout(cycle)}>
        {busy ? "Opening checkout…" : "Go Pro — your daily stylist"}
      </Button>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Cancel anytime · less than one coffee a month
      </p>
      <p className="mt-3 text-center text-xs text-graphite italic">
        “I stopped standing in front of my cupboard every morning.” — beta user, Pune
      </p>

      {/* Micro-commitment ladder: ₹199 one-time analysis */}
      <div className="mt-8 rounded-ww-md border border-hairline bg-bone p-4">
        <p className="text-sm font-medium text-charcoal">Not ready to subscribe?</p>
        <p className="mt-1 text-xs text-graphite">
          Get a one-time <span className="font-medium">Manual Wardrobe Analysis</span> — your colour palette,
          wardrobe gaps, and 10 outfit combos from your own closet. Delivered in-app + email.
        </p>
        <Button variant="secondary" size="sm" className="mt-3" disabled={busy} onClick={() => checkout("analysis")}>
          Get the analysis — ₹199
        </Button>
      </div>

      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
