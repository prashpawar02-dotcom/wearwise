import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { signWardrobePaths } from "@/lib/images";
import { BottomNav } from "@/components/nav/bottom-nav";
import { AppHeader } from "@/components/nav/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Shirt } from "lucide-react";
import type { WardrobeItem } from "@/lib/types";

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
    <main className="min-h-dvh pb-24">
      <AppHeader title="My wardrobe" />
      <div className="px-5 pt-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{items.length} items · private to you</p>
          <Button asChild size="sm">
            <Link href="/wardrobe/upload"><Plus className="h-4 w-4" /> Add</Link>
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Shirt className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="mt-4 font-medium">Your wardrobe is empty</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Add photos of clothes you already own. Aim for 10 to get started.
            </p>
            <Button asChild className="mt-6">
              <Link href="/wardrobe/upload">Add your first item</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3">
            {items.map((item) => (
              <Link key={item.id} href={`/wardrobe/${item.id}`} className="group">
                <div className="aspect-[3/4] overflow-hidden rounded-xl border border-border bg-muted">
                  {urls[item.image_path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={urls[item.image_path]}
                      alt={item.category ?? "Clothing item"}
                      className="h-full w-full object-cover transition-transform group-active:scale-[0.98]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Shirt className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="text-sm font-medium">{item.category ?? "Untagged"}</span>
                  {item.color && <Badge tone="muted">{item.color}</Badge>}
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
