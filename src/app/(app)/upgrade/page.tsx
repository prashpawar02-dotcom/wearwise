import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { AppHeader } from "@/components/nav/app-header";
import { BottomNav } from "@/components/nav/bottom-nav";
import { UpgradeSheet } from "./upgrade-sheet";

export const dynamic = "force-dynamic";

/**
 * Upgrade surface (Module E / plan §5.10). Reached CONTEXTUALLY — after a
 * success moment or at a peak-want gate (6th save, locked occasion, swap on
 * free) — never as a nagging tab.
 */
export default async function UpgradePage({ searchParams }: { searchParams: { from?: string } }) {
  const { user } = await requireUser();
  const ent = await getEntitlements(user.id);

  return (
    <main className="min-h-dvh pb-28">
      <AppHeader title="WearWise Pro" back="/dashboard" />
      <UpgradeSheet
        from={searchParams.from ?? "direct"}
        isPro={ent.plan === "pro"}
        isTrialActive={ent.isTrialActive}
        trialEndsAt={ent.trialEndsAt}
      />
      <BottomNav />
    </main>
  );
}
