import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OCCASIONS } from "@/lib/types";

const occasionLabel = (v: string) => OCCASIONS.find((o) => o.value === v)?.label ?? v;
const statusTone: Record<string, "gold" | "sage" | "muted"> = {
  pending: "gold", in_review: "gold", fulfilled: "sage", archived: "muted",
};

export default async function AdminRequests() {
  const { supabase } = await requireAdmin();
  const { data: requests } = await supabase
    .from("outfit_requests")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false });

  const rows = requests ?? [];

  return (
    <main className="min-h-dvh pb-12">
      <AppHeader title="Requests" back="/admin" />
      <div className="px-5 pt-5 animate-fade-in">
        <p className="text-sm text-muted-foreground">{rows.length} requests</p>
        <div className="mt-4 space-y-2">
          {rows.map((r: any) => (
            <Link key={r.id} href={`/admin/requests/${r.id}`}>
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{occasionLabel(r.occasion)}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.profiles?.full_name || "User"} · {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge tone={statusTone[r.status] ?? "muted"}>{r.status.replace("_", " ")}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
