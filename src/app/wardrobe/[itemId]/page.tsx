import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { signWardrobePaths } from "@/lib/images";
import { AppHeader } from "@/components/nav/app-header";
import { ItemEditor } from "./item-editor";
import type { WardrobeItem } from "@/lib/types";

export default async function ItemPage({ params }: { params: { itemId: string } }) {
  const { user, supabase } = await requireUser();
  const { data } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("id", params.itemId)
    .eq("user_id", user.id)
    .single();

  if (!data) notFound();
  const item = data as WardrobeItem;
  const urls = await signWardrobePaths([item.image_path]);

  return (
    <main className="min-h-dvh pb-12">
      <AppHeader title="Edit item" back="/wardrobe" />
      <div className="px-6 pt-5 animate-fade-in">
        <div className="mx-auto aspect-[3/4] w-2/3 overflow-hidden rounded-xl border border-border bg-muted">
          {urls[item.image_path] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[item.image_path]} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="mt-6">
          <ItemEditor item={item} />
        </div>
      </div>
    </main>
  );
}
