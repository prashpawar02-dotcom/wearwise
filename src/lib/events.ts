// =====================================================================
// WearWise — server-side event mirror (0017_events.sql). PostHog is the
// primary analytics store (client `track()`); this mirror captures the
// server-only moments (webhooks, crons, budget fallbacks) that never
// touch the browser. Best-effort: NEVER throws, never blocks a route.
// PRIVACY: names + coarse props only — no image paths, no free text.
// =====================================================================
import { createAdminClient } from "@/lib/supabase-admin";

export type EventProps = Record<string, string | number | boolean | null>;

export async function logAppEvent(name: string, userId: string | null, props: EventProps = {}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("app_events").insert({ user_id: userId, name, props });
  } catch {
    // analytics must never break the product
  }
}
