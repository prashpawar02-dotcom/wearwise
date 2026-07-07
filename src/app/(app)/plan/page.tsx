import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { signWardrobePaths } from "@/lib/images";
import { BottomNav } from "@/components/nav/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import type { DailyRecommendation, WardrobeItem } from "@/lib/types";
import { WornHistoryAnalytics } from "./worn-history-analytics";

export const dynamic = "force-dynamic";

interface WornItemView { id: string; label: string; image: string | null }
interface WornOutfit { id: string; dateLabel: string; reasoning: string | null; items: WornItemView[] }

export default async function PlanPage() {
  const { user, supabase, profile } = await requireProfile();
  if (!profile?.onboarded) redirect("/onboarding");

  const worn = await loadWornHistory(user.id, supabase);

  return (
    <main className="min-h-dvh pb-28">
      <div className="animate-fade-in space-y-6 px-6 pt-10">
        {/* Header */}
        <div>
          <h1 className="ww-display text-3xl text-charcoal">Plan</h1>
          <p className="mt-1 text-sm text-graphite">Prepare outfits before the day gets busy.</p>
        </div>

        {/* Recently worn — primary section */}
        <section>
          <p className="ww-eyebrow mb-2 text-plum">Recently worn</p>
          <WornHistoryAnalytics count={worn.length} />
          {worn.length === 0 ? (
            <Card className="p-6 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-lavender/20">
                <Icon.Check className="h-6 w-6 text-plum" />
              </div>
              <h3 className="ww-display mt-3 text-xl text-charcoal">No worn outfits yet</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm text-graphite">
                When you tap &ldquo;Wear this&rdquo; on a Daily Drop, it will appear here.
              </p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {worn.map((w) => (
                <WornOutfitCard key={w.id} outfit={w} />
              ))}
            </div>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-graphite">
            <Icon.Lock className="h-3 w-3 shrink-0" /> Wear history helps WearWise avoid repeating the same pieces too often.
          </p>
        </section>

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

function WornOutfitCard({ outfit }: { outfit: WornOutfit }) {
  const labels = outfit.items.map((i) => i.label).filter(Boolean).join(", ");
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-charcoal">{outfit.dateLabel}</p>
        <Chip tone="sage" size="sm">Worn</Chip>
      </div>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
        {outfit.items.slice(0, 5).map((it) => (
          <div key={it.id} className="h-14 w-14 shrink-0 overflow-hidden rounded-ww-sm border border-hairline bg-stone/60">
            {it.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <div className="grid h-full place-items-center text-mist"><Icon.Hanger className="h-5 w-5" /></div>
            )}
          </div>
        ))}
      </div>
      {labels && <p className="mt-2 truncate text-xs text-graphite">{labels}</p>}
      {outfit.reasoning && <p className="mt-1 truncate text-xs text-mist">{outfit.reasoning}</p>}
    </Card>
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

// ===================== Worn history data =====================

/** Human date label for a worn outfit (Today / Yesterday / formatted). */
function wornDateLabel(iso: string | null): string {
  if (!iso) return "Recently";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Recently";
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Latest 10 worn Daily Drops for the signed-in user. Owner-scoped (RLS + explicit
 * user_id filter), signs images at read time (never stored), and drops outfits
 * whose items were all deleted. No service-role client.
 */
async function loadWornHistory(
  userId: string,
  supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"]
): Promise<WornOutfit[]> {
  const { data } = await supabase
    .from("daily_recommendations")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "worn")
    .order("worn_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(10);
  const recs = (data ?? []) as DailyRecommendation[];
  if (recs.length === 0) return [];

  const allIds = Array.from(new Set(recs.flatMap((r) => r.selected_item_ids ?? [])));
  let members: WardrobeItem[] = [];
  if (allIds.length) {
    const { data: itemData } = await supabase
      .from("wardrobe_items")
      .select("*")
      .eq("user_id", userId)
      .in("id", allIds);
    members = (itemData ?? []) as WardrobeItem[];
  }
  const byId = new Map(members.map((m) => [m.id, m]));
  const urls = await signWardrobePaths(members.map((m) => m.image_path));

  return recs
    .map((rec) => {
      const items = (rec.selected_item_ids ?? [])
        .map((id) => byId.get(id))
        .filter((m): m is WardrobeItem => Boolean(m))
        .map((m) => ({
          id: m.id,
          label: m.user_facing_name ?? m.category ?? "Item",
          image: urls[m.image_path] ?? null,
        }));
      return {
        id: rec.id,
        dateLabel: wornDateLabel(rec.worn_at ?? rec.created_at),
        reasoning: rec.reasoning,
        items,
      };
    })
    .filter((w) => w.items.length > 0);
}
