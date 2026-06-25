import { requireAdmin } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Profile } from "@/lib/types";

export default async function AdminUsers() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  const users = (data ?? []) as Profile[];

  return (
    <main className="min-h-dvh pb-12">
      <AppHeader title="Beta users" back="/admin" />
      <div className="px-5 pt-5 animate-fade-in">
        <p className="text-sm text-muted-foreground">{users.length} users</p>
        <div className="mt-4 space-y-2">
          {users.map((u) => (
            <Card key={u.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{u.full_name || "Unnamed user"}</p>
                  <p className="text-xs text-muted-foreground">
                    {[u.city, u.age_range].filter(Boolean).join(" · ") || "No profile details"}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {u.is_admin && <Badge tone="plum">Admin</Badge>}
                  {u.is_premium && <Badge tone="gold">Premium</Badge>}
                  <Badge tone={u.onboarded ? "sage" : "muted"}>{u.onboarded ? "Active" : "New"}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
