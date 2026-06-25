import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Users, ListChecks } from "lucide-react";

export default async function AdminHome() {
  const { supabase } = await requireAdmin();

  const [{ count: userCount }, { count: pendingCount }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("outfit_requests").select("id", { count: "exact", head: true }).neq("status", "fulfilled"),
  ]);

  return (
    <main className="min-h-dvh pb-12">
      <AppHeader title="Admin" />
      <div className="px-6 pt-6 animate-fade-in">
        <h1 className="font-serif text-2xl font-semibold">Stylist console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review beta users and curate outfit suggestions.
        </p>

        <div className="mt-6 space-y-3">
          <Link href="/admin/requests">
            <Card>
              <CardContent className="flex items-center justify-between py-5">
                <div className="flex items-center gap-3">
                  <ListChecks className="h-5 w-5 text-plum" />
                  <div>
                    <p className="font-medium">Outfit requests</p>
                    <p className="text-sm text-muted-foreground">{pendingCount ?? 0} awaiting curation</p>
                  </div>
                </div>
                <span className="text-muted-foreground">→</span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/users">
            <Card>
              <CardContent className="flex items-center justify-between py-5">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-sage" />
                  <div>
                    <p className="font-medium">Beta users</p>
                    <p className="text-sm text-muted-foreground">{userCount ?? 0} total</p>
                  </div>
                </div>
                <span className="text-muted-foreground">→</span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </main>
  );
}
