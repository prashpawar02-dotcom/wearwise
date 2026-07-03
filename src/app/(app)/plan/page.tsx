import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { BottomNav } from "@/components/nav/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const { profile } = await requireProfile();
  if (!profile?.onboarded) redirect("/onboarding");

  return (
    <main className="min-h-dvh pb-28">
      <div className="animate-fade-in space-y-6 px-6 pt-10">
        {/* Header */}
        <div>
          <h1 className="ww-display text-3xl text-charcoal">Plan</h1>
          <p className="mt-1 text-sm text-graphite">Prepare outfits before the day gets busy.</p>
        </div>

        {/* Tomorrow card — honest placeholder until daily planning is built */}
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-plum/[0.08]">
              <Icon.Calendar className="h-4 w-4 text-plum" />
            </span>
            <div>
              <p className="ww-eyebrow text-plum">Tomorrow</p>
              <h2 className="font-serif text-lg leading-tight text-charcoal">Tomorrow&apos;s outfit</h2>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-graphite">
            Daily planning is coming soon. For now, use Style Me to create an outfit for any occasion.
          </p>
          <Button asChild className="mt-4" size="full">
            <Link href="/occasion/new"><Icon.Sparkle className="h-4 w-4" /> Open Style Me</Link>
          </Button>
        </Card>

        {/* Saved outfits — no saved-outfit data exists yet, so an honest empty state */}
        <section>
          <p className="ww-eyebrow mb-2 text-plum">Saved outfits</p>
          <Card className="p-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-lavender/20">
              <Icon.Heart className="h-6 w-6 text-plum" />
            </div>
            <h3 className="ww-display mt-3 text-xl text-charcoal">No saved outfits yet</h3>
            <p className="mx-auto mt-2 max-w-xs text-sm text-graphite">
              When you find an outfit you like, save it here for later.
            </p>
            <Button asChild size="lg" variant="secondary" className="mt-5">
              <Link href="/occasion/new">Find an outfit</Link>
            </Button>
          </Card>
        </section>

        {/* Coming later — clearly disabled roadmap */}
        <section>
          <p className="ww-eyebrow mb-2 text-plum">Coming later</p>
          <div className="grid gap-2.5">
            <RoadmapRow icon={<Icon.Calendar className="h-4 w-4" />} title="Weekly outfit planner" />
            <RoadmapRow icon={<Icon.Plane className="h-4 w-4" />} title="Travel packing list" />
            <RoadmapRow icon={<Icon.Sparkle className="h-4 w-4" />} title="Event outfit prep" />
          </div>
        </section>

        <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-graphite">
          <Icon.Lock className="h-3 w-3" /> Your planned outfits stay private.
        </p>
      </div>
      <BottomNav />
    </main>
  );
}

function RoadmapRow({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex min-h-[56px] items-center justify-between rounded-ww-md border border-hairline bg-bone/60 p-4">
      <span className="flex items-center gap-3 text-sm text-charcoal">
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-ww-sm bg-ivory text-mist">{icon}</span>
        {title}
      </span>
      <span className="rounded-full bg-stone px-2.5 py-1 text-[11px] font-medium text-graphite">Coming later</span>
    </div>
  );
}
