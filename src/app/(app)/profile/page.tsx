import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { BottomNav } from "@/components/nav/bottom-nav";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/Icon";
import { DailyDropPreferences } from "./daily-drop-preferences";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { user, supabase, profile } = await requireProfile();
  if (!profile?.onboarded) redirect("/onboarding");

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const [{ count: total }, { count: needsReview }, { count: recentlyWorn }] = await Promise.all([
    supabase.from("wardrobe_items").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("wardrobe_items").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("ai_tag_status", "needs_review"),
    supabase.from("wardrobe_items").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("last_worn_at", sevenDaysAgo),
  ]);

  const firstName = profile?.full_name?.split(" ")[0];
  const initial = (firstName ?? "W").charAt(0).toUpperCase();

  return (
    <main className="min-h-dvh pb-28">
      <div className="animate-fade-in space-y-5 px-6 pt-10">
        {/* Account summary */}
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-stone font-serif text-lg text-charcoal">
            {initial}
          </span>
          <div className="min-w-0">
            <h1 className="ww-display text-2xl text-charcoal">{profile?.full_name || "You"}</h1>
            <p className="truncate text-sm text-graphite">{user.email}</p>
          </div>
        </div>

        {/* Wardrobe stats */}
        <Card className="p-4">
          <p className="ww-eyebrow text-plum">Your wardrobe</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat value={total ?? 0} label="items" />
            <Stat value={recentlyWorn ?? 0} label="recently worn" />
            <Stat value={needsReview ?? 0} label="need review" />
          </div>
          <Link href="/wardrobe" className="mt-4 inline-flex min-h-[24px] items-center gap-1.5 text-sm font-medium text-plum hover:underline">
            Open Closet Board <Icon.ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>

        {/* Daily Outfit Drop preference (preview only) */}
        <DailyDropPreferences />

        {/* Privacy */}
        <Card className="p-4">
          <p className="ww-eyebrow text-plum">Privacy</p>
          <ul className="mt-2.5 space-y-2.5 text-sm text-charcoal">
            <li className="flex gap-2.5"><Icon.Lock className="mt-0.5 h-4 w-4 shrink-0 text-plum" /> Private by default. No public profile.</li>
            <li className="flex gap-2.5"><Icon.Check className="mt-0.5 h-4 w-4 shrink-0 text-sage" /> Delete clothes anytime.</li>
            <li className="flex gap-2.5"><Icon.Heart className="mt-0.5 h-4 w-4 shrink-0 text-plum" /> WearWise suggests outfits, not judgments.</li>
          </ul>
        </Card>

        {/* Settings links */}
        <Card className="p-0">
          <div className="divide-y divide-stone">
            <SettingLink href="/onboarding" icon={<Icon.Settings className="h-4 w-4 text-plum" />} label="Wardrobe preferences" hint="Style & profile" />
            <SettingLink href="/wardrobe/upload" icon={<Icon.Plus className="h-4 w-4 text-plum" />} label="Add clothing" hint="Grow your closet" />
            <div className="flex min-h-[56px] items-center justify-between gap-3 p-4">
              <span className="flex items-center gap-3 text-sm text-charcoal">
                <Icon.User className="h-4 w-4 text-plum" /> Account
              </span>
              <SignOutButton />
            </div>
          </div>
        </Card>
      </div>
      <BottomNav />
    </main>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-ww-sm bg-ivory/60 py-3">
      <span className="block font-serif text-2xl text-charcoal">{value}</span>
      <span className="text-xs text-graphite">{label}</span>
    </div>
  );
}

function SettingLink({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <Link href={href} className="flex min-h-[56px] items-center justify-between gap-3 p-4 transition-colors hover:bg-stone/30">
      <span className="flex items-center gap-3">
        {icon}
        <span className="text-sm text-charcoal">
          {label}
          {hint && <span className="block text-[11px] text-mist">{hint}</span>}
        </span>
      </span>
      <Icon.ArrowRight className="h-4 w-4 text-mist" />
    </Link>
  );
}
