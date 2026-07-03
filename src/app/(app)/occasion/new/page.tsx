import { requireUser } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { roleForItem, type RoleClassifiableItem } from "@/lib/outfitValidation";
import { isWearableItem } from "@/lib/wardrobe";
import { getWeatherContext } from "@/lib/weather";
import { OccasionForm } from "./occasion-form";

export const dynamic = "force-dynamic";

export default async function NewOccasionPage() {
  const { user, supabase } = await requireUser();

  const [{ data }, { data: profile }] = await Promise.all([
    supabase
      .from("wardrobe_items")
      .select("category, sub_category, user_facing_name, availability_status")
      .eq("user_id", user.id),
    supabase.from("profiles").select("city").eq("id", user.id).single(),
  ]);

  const rows = (data ?? []) as (RoleClassifiableItem & { availability_status?: string | null })[];
  // Only currently-available items count toward readiness (in-wash excluded).
  const wearable = rows.filter(isWearableItem);
  const ready = {
    tops: wearable.some((i) => {
      const r = roleForItem(i);
      return r === "upper" || r === "one_piece";
    }),
    bottoms: wearable.some((i) => roleForItem(i) === "bottom"),
    shoes: wearable.some((i) => roleForItem(i) === "footwear"),
  };

  const weather = await getWeatherContext(profile?.city);

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
          <OccasionForm
            itemCount={rows.length}
            wearableCount={wearable.length}
            ready={ready}
            weather={weather}
          />
        </div>
      </div>
    </main>
  );
}
