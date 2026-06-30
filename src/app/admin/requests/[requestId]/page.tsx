import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { signWardrobePaths } from "@/lib/images";
import { AppHeader } from "@/components/nav/app-header";
import { Badge } from "@/components/ui/badge";
import {
  OCCASIONS,
  type OutfitSuggestion,
  type OutfitSuggestionFeedback,
  type WardrobeItem,
} from "@/lib/types";
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

  // Admin-only: user feedback for this request's suggestions (latest first).
  // RLS policy `ssfeedback_admin_read` authorizes admins to read all feedback.
  const { data: feedbackData } = await supabase
    .from("outfit_suggestion_feedback")
    .select("*")
    .eq("request_id", params.requestId)
    .order("created_at", { ascending: false });
  const feedback = (feedbackData ?? []) as OutfitSuggestionFeedback[];

  const summary = {
    total: feedback.length,
    wearYes: feedback.filter((f) => f.would_wear === "yes").length,
    wearMaybe: feedback.filter((f) => f.would_wear === "maybe").length,
    wearNo: feedback.filter((f) => f.would_wear === "no").length,
    usefulYes: feedback.filter((f) => f.useful === true).length,
    usefulNo: feedback.filter((f) => f.useful === false).length,
  };

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

        {/* Request-level feedback summary (admin-only) */}
        {summary.total > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-medium text-muted-foreground">
              User feedback · {summary.total} {summary.total === 1 ? "entry" : "entries"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <Badge tone="sage">Would wear · Yes {summary.wearYes}</Badge>
              <Badge tone="gold">Maybe {summary.wearMaybe}</Badge>
              <Badge tone="rose">No {summary.wearNo}</Badge>
              <Badge tone="muted">Useful Yes {summary.usefulYes} · No {summary.usefulNo}</Badge>
            </div>
          </div>
        )}

        <div className="mt-6">
          <SuggestionBuilder
            requestId={request.id}
            userId={request.user_id}
            items={items}
            urls={urls}
            existing={suggestions}
            feedback={feedback}
          />
        </div>
      </div>
    </main>
  );
}
