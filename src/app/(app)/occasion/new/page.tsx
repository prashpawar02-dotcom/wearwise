import { requireUser } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { OccasionForm } from "./occasion-form";

export default async function NewOccasionPage() {
  const { user, supabase } = await requireUser();
  const { count } = await supabase
    .from("wardrobe_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return (
    <main className="min-h-dvh pb-12">
      <AppHeader title="New request" back="/dashboard" />
      <div className="px-6 pt-6 animate-fade-in">
        <p className="ww-eyebrow mb-2">Today&apos;s plan</p>
        <h1 className="ww-display text-3xl text-charcoal">
          What are you dressing <em className="text-plum">for?</em>
        </h1>
        <p className="mt-2 text-sm text-graphite">
          Pick an occasion and we&apos;ll curate 3 outfit ideas from your wardrobe.
        </p>
        <div className="mt-6">
          <OccasionForm itemCount={count ?? 0} />
        </div>
      </div>
    </main>
  );
}
