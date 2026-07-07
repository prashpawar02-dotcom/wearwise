import Link from "next/link";
import { getEntitlements } from "@/lib/entitlements";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/Icon";

/** Plan summary on Profile (Module E). Server component; reads the gate. */
export async function SubscriptionCard({ userId }: { userId: string }) {
  const ent = await getEntitlements(userId);

  const label = ent.plan === "pro"
    ? "WearWise Pro"
    : ent.isTrialActive
      ? "Free trial — full Pro access"
      : "Basic (free)";

  const detail = ent.plan === "pro"
    ? "Everything unlocked. Thank you for supporting WearWise."
    : ent.isTrialActive && ent.trialEndsAt
      ? `Trial ends ${new Date(ent.trialEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — keep your full stylist after.`
      : "15 items · 1 drop/day · Casual + Office. Go Pro for everything.";

  return (
    <Card className="p-4">
      <p className="ww-eyebrow text-plum">Your plan</p>
      <p className="mt-1 font-serif text-lg text-charcoal">{label}</p>
      <p className="mt-0.5 text-sm text-graphite">{detail}</p>
      {ent.plan !== "pro" && (
        <Link
          href="/upgrade?from=profile"
          className="mt-3 inline-flex min-h-[24px] items-center gap-1.5 text-sm font-medium text-plum hover:underline"
        >
          See Pro <Icon.ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </Card>
  );
}
