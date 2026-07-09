import { requireUser } from "@/lib/auth";
import { signWardrobePaths } from "@/lib/images";
import { BottomNav } from "@/components/nav/bottom-nav";
import { ClosetBoard } from "./closet-board";
import { countReadyToReturn, DEFAULT_WASH_CYCLE_DAYS, daysSinceDate } from "@/lib/laundry";
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

  // Soft auto-return (Phase 2): how many in-wash items look ready to come back,
  // using the user's learned wash-cycle estimate. Never a push — only a quiet
  // badge, and only when we haven't nudged within the last cycle.
  const { data: profileData } = await supabase
    .from("profiles")
    .select("wash_cycle_days, laundry_return_prompt_at")
    .eq("id", user.id)
    .maybeSingle();
  const washCycleDays =
    (profileData as { wash_cycle_days?: number } | null)?.wash_cycle_days ?? DEFAULT_WASH_CYCLE_DAYS;
  const lastPromptAt = (profileData as { laundry_return_prompt_at?: string | null } | null)?.laundry_return_prompt_at ?? null;
  const autoReturnCount = countReadyToReturn(items, washCycleDays);
  const daysSincePrompt = daysSinceDate(lastPromptAt);
  const showAutoReturn = autoReturnCount > 0 && (daysSincePrompt == null || daysSincePrompt >= 1);

  return (
    <main className="min-h-dvh pb-28">
      <div className="animate-fade-in px-6 pt-10">
        <ClosetBoard
          items={items}
          urls={urls}
          autoReturnCount={autoReturnCount}
          showAutoReturn={showAutoReturn}
        />
      </div>
      <BottomNav />
    </main>
  );
}
