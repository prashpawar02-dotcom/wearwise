import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { FeedbackForm } from "./feedback-form";
import type { OutfitSuggestion } from "@/lib/types";

export default async function FeedbackPage({ params }: { params: { suggestionId: string } }) {
  const { user, supabase } = await requireUser();
  const { data } = await supabase
    .from("outfit_suggestions")
    .select("*")
    .eq("id", params.suggestionId)
    .eq("user_id", user.id)
    .single();
  if (!data) notFound();
  const suggestion = data as OutfitSuggestion;

  return (
    <main className="min-h-dvh pb-12">
      <AppHeader title="Feedback" back={`/outfits/${suggestion.request_id}`} />
      <div className="px-6 pt-6 animate-fade-in">
        <h1 className="font-serif text-2xl font-semibold">How was this look?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your feedback helps us suggest better outfits next time.
        </p>
        <div className="mt-6">
          <FeedbackForm suggestionId={suggestion.id} requestId={suggestion.request_id} />
        </div>
      </div>
    </main>
  );
}
