import { requireUser } from "@/lib/auth";
import { signWardrobePaths } from "@/lib/images";
import { BottomNav } from "@/components/nav/bottom-nav";
import { ClosetBoard } from "./closet-board";
import type { WardrobeItem } from "@/lib/types";

// Always render fresh per-user data (no stale Router Cache after uploads),
// and so private image URLs are signed per request and never cached.
export const dynamic = "force-dynamic";

export default async function WardrobePage() {
  const { user, supabase } = await requireUser();
  const { data } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const items = (data ?? []) as WardrobeItem[];
  // Short-lived signed URLs for the user's own private wardrobe photos.
  const urls = await signWardrobePaths(items.map((i) => i.image_path));

  return (
    <main className="min-h-dvh pb-28">
      <div className="animate-fade-in px-6 pt-10">
        <ClosetBoard items={items} urls={urls} />
      </div>
      <BottomNav />
    </main>
  );
}
