import { requireUser } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { roleForItem, type RoleClassifiableItem } from "@/lib/outfitValidation";
import { OccasionForm } from "./occasion-form";

export const dynamic = "force-dynamic";

export default async function NewOccasionPage() {
  const { user, supabase } = await requireUser();

  // Lightweight read (owner-scoped, RLS-enforced) to show honest readiness.
  const { data } = await supabase
    .from("wardrobe_items")
    .select("category, sub_category, user_facing_name")
    .eq("user_id", user.id);
  const items = (data ?? []) as RoleClassifiableItem[];

  const ready = {
    tops: items.some((i) => {
      const r = roleForItem(i);
      return r === "upper" || r === "one_piece";
    }),
    bottoms: items.some((i) => roleForItem(i) === "bottom"),
    shoes: items.some((i) => roleForItem(i) === "footwear"),
  };

  return (
    <main className="min-h-dvh pb-12">
      <AppHeader title="Style Me" back="/dashboard" />
      <div className="animate-fade-in px-6 pt-6">
        <p className="ww-eyebrow mb-2">Style Me</p>
        <h1 className="ww-display text-3xl text-charcoal">
          What are you dressing <em className="text-plum">for?</em>
        </h1>
        <p className="mt-2 text-sm text-graphite">
          Choose the plan. WearWise will find one smart outfit from your wardrobe.
        </p>
        <div className="mt-6">
          <OccasionForm itemCount={items.length} ready={ready} />
        </div>
      </div>
    </main>
  );
}
