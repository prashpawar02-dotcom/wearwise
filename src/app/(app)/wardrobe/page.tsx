import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { signWardrobePaths } from "@/lib/images";
import { BottomNav } from "@/components/nav/bottom-nav";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import type { WardrobeItem } from "@/lib/types";

// Always render fresh per-user data (no stale Router Cache after uploads).
export const dynamic = "force-dynamic";

export default async function WardrobePage() {
  const { user, supabase } = await requireUser();
  const { data } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const items = (data ?? []) as WardrobeItem[];
  const urls = await signWardrobePaths(items.map((i) => i.image_path));

  return (
    <main className="min-h-dvh pb-28">
      <div className="animate-fade-in px-6 pt-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="ww-display text-3xl text-charcoal">Wardrobe</h1>
            <p className="mt-1 text-sm text-graphite">
              {items.length} {items.length === 1 ? "item" : "items"} · private to you
            </p>
          </div>
          <Link
            href="/wardrobe/upload"
            aria-label="Add clothing"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-charcoal text-bone transition-colors hover:bg-plum"
          >
            <Icon.Plus className="h-4 w-4" />
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <div className="grid h-24 w-24 place-items-center rounded-full bg-lavender/20">
              <div className="grid h-16 w-16 place-items-center rounded-ww-md border border-hairline bg-bone">
                <Icon.Hanger className="h-7 w-7 text-plum" />
              </div>
            </div>
            <p className="ww-eyebrow mt-5">Empty wardrobe</p>
            <h2 className="ww-display mt-2 text-2xl text-charcoal">
              Your wardrobe starts <em className="text-plum">here.</em>
            </h2>
            <p className="mt-2 max-w-xs text-sm text-graphite">
              Add a few everyday items first. WearWise gets smarter as your closet grows.
            </p>
            <Button asChild className="mt-6" size="lg">
              <Link href="/wardrobe/upload"><Icon.Plus className="h-4 w-4" /> Add clothing</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {items.map((item) => (
              <Link key={item.id} href={`/wardrobe/${item.id}`} className="group">
                <div className="aspect-[3/4] overflow-hidden rounded-ww-md border border-hairline bg-stone">
                  {urls[item.image_path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={urls[item.image_path]}
                      alt={item.user_facing_name ?? item.category ?? "Clothing item"}
                      className="h-full w-full object-cover transition-transform group-active:scale-[0.98]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-mist">
                      <Icon.Hanger className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-charcoal">
                    {item.user_facing_name ?? item.category ?? "Untagged"}
                  </span>
                  {item.ai_tag_status === "analyzing" && <Chip tone="champagne" size="sm">Analyzing…</Chip>}
                  {item.ai_tag_status === "needs_review" && <Chip tone="champagne" size="sm">Check</Chip>}
                  {item.ai_tag_status !== "analyzing" && item.color && (
                    <Chip size="sm" className="text-graphite">{item.color}</Chip>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
