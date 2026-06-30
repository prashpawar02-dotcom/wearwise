import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { signWardrobePaths } from "@/lib/images";
import { AppHeader } from "@/components/nav/app-header";
import { ItemView } from "./item-view";
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
      <AppHeader title="Item" back="/wardrobe" />
      <div className="px-6 pt-5 animate-fade-in">
        <ItemView item={item} imageUrl={urls[item.image_path]} />
      </div>
    </main>
  );
}
