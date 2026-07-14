import { requireProfile } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { OnboardingForm } from "./onboarding-form";
import { OnboardingFlow } from "./onboarding-flow";
import type { WardrobeItem } from "@/lib/types";
import type { OnboardingWardrobeItem } from "@/lib/onboarding";

// Always fresh: onboarding_step / onboarded / wardrobe composition must
// never be served from a stale cache, or resume/gating would be wrong.
export const dynamic = "force-dynamic";

/**
 * Dual-purpose route, preserved from before Phase 4D:
 *   - Already-onboarded users reach this route via Profile -> "Wardrobe
 *     preferences" (an ongoing settings link, not a first-run gate) and
 *     get the existing lightweight edit form — completely unchanged, so
 *     "existing users must not be forced through onboarding again" holds
 *     even though this route is shared.
 *   - Not-yet-onboarded users (new / in_progress / wardrobe_incomplete /
 *     ready) reach this route via the `!profile.onboarded` redirect in
 *     dashboard/page.tsx, plan/page.tsx, and profile/page.tsx (all three
 *     unchanged) and get the new 6-step Onboarding v2 flow, resuming at
 *     whichever step `onboarding_step` says they last completed.
 */
export default async function OnboardingPage() {
  const { user, supabase, profile } = await requireProfile();

  if (profile?.onboarded) {
    return (
      <main className="min-h-dvh pb-12">
        <AppHeader title="Your profile" />
        <div className="px-6 pt-6 animate-fade-in">
          <h1 className="font-serif text-2xl font-semibold">A few details</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This helps us tailor outfit ideas to you. You can change it anytime.
          </p>
          <div className="mt-6">
            <OnboardingForm
              initial={{
                full_name: profile?.full_name ?? "",
                age_range: profile?.age_range ?? "",
                city: profile?.city ?? "",
                style_preferences: profile?.style_preferences ?? [],
              }}
            />
          </div>
          <div className="mt-8 flex justify-center">
            <SignOutButton />
          </div>
        </div>
      </main>
    );
  }

  // Live wardrobe composition — never persisted, always current (see
  // migration 0025's header and src/lib/onboarding.ts).
  const { data } = await supabase
    .from("wardrobe_items")
    .select("category, sub_category, user_facing_name, availability_status")
    .eq("user_id", user.id);
  const items = (data ?? []) as (WardrobeItem & OnboardingWardrobeItem)[];

  return (
    <OnboardingFlow
      initial={{
        full_name: profile?.full_name ?? "",
        city: profile?.city ?? "",
        style_preferences: profile?.style_preferences ?? [],
        default_occasion: profile?.default_occasion ?? "",
        onboarding_step: profile?.onboarding_step ?? null,
      }}
      initialWardrobeItems={items}
    />
  );
}
