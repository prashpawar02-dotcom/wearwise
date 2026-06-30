import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { signWardrobePaths } from "@/lib/images";
import { AppHeader } from "@/components/nav/app-header";
import { Badge } from "@/components/ui/badge";
import { OCCASIONS, type OutfitSuggestion, type WardrobeItem } from "@/lib/types";
import { SuggestionBuilder } from "./suggestion-builder";

export const dynamic = "force-dynamic";

const occasionLabel = (v: string) => OCCASIONS.find((o) => o.value === v)?.label ?? v;

export default async function AdminRequestDetail({ params }: { params: { requestId: string } }) {
  const { supabase } = await requireAdmin();

  // Plain select — no profiles embed (no FK path from outfit_requests to profiles).
  const { data: request } = await supabase
    .from("outfit_requests")
    .select("*")
    .eq("id", params.requestId)
    .single();
  if (!request) notFound();

  // Fetch the requesting user's profile separately (admin RLS allows it).
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, city")
    .eq("id", request.user_id)
    .single();

  // Admin RLS allows reading the requesting user's wardrobe to build looks.
  const { data: itemsData } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", request.user_id)
    .order("category", { ascending: true });
  const items = (itemsData ?? []) as WardrobeItem[];

  const { data: suggData } = await supabase
    .from("outfit_suggestions")
    .select("*")
    .eq("request_id", params.requestId)
    .order("position", { ascending: true });
  const suggestions = (suggData ?? []) as OutfitSuggestion[];

  const urls = await signWardrobePaths(items.map((i) => i.image_path));

  return (
    <main className="min-h-dvh pb-12">
      <AppHeader title="Curate" back="/admin/requests" />
      <div className="px-5 pt-5 animate-fade-in">
        <div className="flex items-center gap-2">
          <Badge tone="plum">{occasionLabel(request.occasion)}</Badge>
          <Badge tone="muted">{request.status.replace("_", " ")}</Badge>
        </div>
        <p className="mt-2 text-sm">
          <span className="font-medium">{profile?.full_name || "User"}</span>
          {profile?.city ? ` · ${profile.city}` : ""}
        </p>
        {request.notes && (
          <p className="mt-1 text-sm text-muted-foreground">Note: {request.notes}</p>
        )}

        <div className="mt-6">
          <SuggestionBuilder
            requestId={request.id}
            userId={request.user_id}
            items={items}
            urls={urls}
            existing={suggestions}
          />
        </div>
      </div>
    </main>
  );
}
