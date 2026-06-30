import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { signWardrobePaths } from "@/lib/images";
import { AppHeader } from "@/components/nav/app-header";
import { BottomNav } from "@/components/nav/bottom-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OCCASIONS, type OutfitSuggestion, type WardrobeItem } from "@/lib/types";
import { WornTodayButton } from "./worn-today-button";
import { SuggestionFeedback } from "./suggestion-feedback";
import { Clock } from "lucide-react";

const occasionLabel = (v: string) => OCCASIONS.find((o) => o.value === v)?.label ?? v;

export default async function OutfitsPage({ params }: { params: { requestId: string } }) {
  const { user, supabase } = await requireUser();

  const { data: request } = await supabase
    .from("outfit_requests")
    .select("*")
    .eq("id", params.requestId)
    .eq("user_id", user.id)
    .single();
  if (!request) notFound();

  // RLS ensures only APPROVED suggestions are visible to the user.
  const { data: suggestionsData } = await supabase
    .from("outfit_suggestions")
    .select("*")
    .eq("request_id", params.requestId)
    .order("position", { ascending: true });
  const suggestions = (suggestionsData ?? []) as OutfitSuggestion[];

  // Load the items referenced by suggestions to render photos.
  const itemIds = Array.from(new Set(suggestions.flatMap((s) => s.item_ids)));
  const { data: itemsData } = itemIds.length
    ? await supabase.from("wardrobe_items").select("*").in("id", itemIds)
    : { data: [] as WardrobeItem[] };
  const items = (itemsData ?? []) as WardrobeItem[];
  const urls = await signWardrobePaths(items.map((i) => i.image_path));
  const itemById = new Map(items.map((i) => [i.id, i]));

  return (
    <main className="min-h-dvh pb-24">
      <AppHeader title="Outfit ideas" back="/dashboard" />
      <div className="px-5 pt-5 animate-fade-in">
        <div className="flex items-center gap-2">
          <Badge tone="plum">{occasionLabel(request.occasion)}</Badge>
          {request.notes && <span className="text-sm text-muted-foreground">· {request.notes}</span>}
        </div>

        {suggestions.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Clock className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="mt-4 font-medium">Your looks are being prepared.</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Our stylist is putting together ideas from your wardrobe. We&apos;ll have them
              ready shortly — check back soon.
            </p>
            <Link href="/dashboard" className="mt-6 text-sm text-plum underline-offset-4 hover:underline">
              Back to home
            </Link>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {suggestions.map((s, idx) => (
              <Card key={s.id}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <p className="font-serif text-lg font-semibold">
                      {s.title || `Look ${idx + 1}`}
                    </p>
                    <Badge tone="gold">Look {idx + 1}</Badge>
                  </div>
                  {s.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                  )}
                  {s.avoid_note && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">Tip:</span> {s.avoid_note}
                    </p>
                  )}
                  {s.missing_item_suggestion && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">Would complete it:</span> {s.missing_item_suggestion}
                    </p>
                  )}

                  <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                    {s.item_ids.map((id) => {
                      const item = itemById.get(id);
                      if (!item) return null;
                      return (
                        <div key={id} className="w-24 shrink-0">
                          <div className="aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted">
                            {urls[item.image_path] && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={urls[item.image_path]} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {item.category ?? "Item"}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex">
                    <WornTodayButton suggestionId={s.id} itemIds={s.item_ids} />
                  </div>

                  {/* Single feedback path for beta: the inline "Rate this look" form
                      (writes to outfit_suggestion_feedback). The older /feedback/[id]
                      page is intentionally left in place but no longer linked here. */}
                  <div className="mt-3">
                    <SuggestionFeedback suggestionId={s.id} requestId={request.id} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
