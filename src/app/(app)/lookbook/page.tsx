import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { signWardrobePaths } from "@/lib/images";
import { AppHeader } from "@/components/nav/app-header";
import { BottomNav } from "@/components/nav/bottom-nav";
import { Bookmark } from "lucide-react";
import type { SavedLook, WardrobeItem } from "@/lib/types";
import { DeleteLookButton } from "./delete-look-button";

export const dynamic = "force-dynamic";

/**
 * Lookbook (Module C) — the investment vault. Saved looks accumulate;
 * Free caps at 5 (server-enforced), Pro unlimited.
 */
export default async function LookbookPage() {
  const { user, supabase } = await requireUser();

  const [{ data: looksData }, ent] = await Promise.all([
    supabase.from("saved_looks").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    getEntitlements(user.id),
  ]);
  const looks = (looksData ?? []) as SavedLook[];

  const itemIds = Array.from(new Set(looks.flatMap((l) => l.item_ids)));
  const { data: itemsData } = itemIds.length
    ? await supabase.from("wardrobe_items").select("*").in("id", itemIds)
    : { data: [] as WardrobeItem[] };
  const items = (itemsData ?? []) as WardrobeItem[];
  const urls = await signWardrobePaths(items.map((i) => i.image_path));
  const itemById = new Map(items.map((i) => [i.id, i]));

  const cap = ent.limits.maxSavedLooks;
  const capped = Number.isFinite(cap);

  return (
    <main className="min-h-dvh pb-28">
      <AppHeader title="Lookbook" />
      <div className="animate-fade-in px-5 pt-5">
        {capped && (
          <p className="text-xs text-muted-foreground">
            {looks.length}/{cap} saved on the free plan ·{" "}
            <Link href="/upgrade?from=lookbook" className="text-plum underline-offset-4 hover:underline">
              Go Pro for unlimited
            </Link>
          </p>
        )}

        {looks.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Bookmark className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="mt-4 font-medium">No saved looks yet.</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Tap “Save look” on any outfit you love — it will live here so a great outfit is never lost.
            </p>
            <Link href="/dashboard" className="mt-6 text-sm text-plum underline-offset-4 hover:underline">
              See today’s outfit
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {looks.map((look) => (
              <div key={look.id} className="rounded-ww-lg border border-hairline bg-card p-4 shadow-ww-sm">
                <div className="flex items-center justify-between">
                  <p className="font-serif text-base font-semibold">
                    {look.title || `Saved look`}
                  </p>
                  <DeleteLookButton lookId={look.id} />
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {look.item_ids.map((id) => {
                    const item = itemById.get(id);
                    if (!item) return null;
                    return (
                      <div key={id} className="w-20 shrink-0">
                        <div className="aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted">
                          {urls[item.image_path] && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={urls[item.image_path]} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">{item.category ?? "Item"}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Saved {new Date(look.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
