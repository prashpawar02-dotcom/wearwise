import { requireProfile } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const { profile } = await requireProfile();
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
