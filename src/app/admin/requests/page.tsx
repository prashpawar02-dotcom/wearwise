import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OCCASIONS } from "@/lib/types";

// Always render fresh — admins must see new requests immediately.
export const dynamic = "force-dynamic";

const occasionLabel = (v: string) => OCCASIONS.find((o) => o.value === v)?.label ?? v;
const statusTone: Record<string, "gold" | "sage" | "muted"> = {
  pending: "gold", in_review: "gold", fulfilled: "sage", archived: "muted",
};

export default async function AdminRequests() {
  const { supabase } = await requireAdmin();

  // Note: no PostgREST embed here — outfit_requests.user_id references auth.users,
  // not public.profiles, so `profiles(...)` cannot be joined. Fetch names separately.
  const { data: requests, error } = await supabase
    .from("outfit_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="min-h-dvh pb-12">
        <AppHeader title="Requests" back="/admin" />
        <div className="px-5 pt-5">
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Couldn&apos;t load requests: {error.message}
          </div>
        </div>
      </main>
    );
  }

  const rows = requests ?? [];

  // Map user_id -> full_name (admin RLS allows reading all profiles).
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles").select("id, full_name").in("id", userIds);
    profs?.forEach((p) => nameById.set(p.id, p.full_name ?? ""));
  }

  return (
    <main className="min-h-dvh pb-12">
      <AppHeader title="Requests" back="/admin" />
      <div className="px-5 pt-5 animate-fade-in">
        <p className="text-sm text-muted-foreground">{rows.length} requests</p>
        {rows.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No outfit requests yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {rows.map((r) => (
              <Link key={r.id} href={`/admin/requests/${r.id}`}>
                <Card>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{occasionLabel(r.occasion)}</p>
                      <p className="text-xs text-muted-foreground">
                        {nameById.get(r.user_id) || "User"} · {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge tone={statusTone[r.status] ?? "muted"}>{r.status.replace("_", " ")}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
