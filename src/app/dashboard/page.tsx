import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/nav/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OCCASIONS } from "@/lib/types";
import { Sparkles, Shirt, Plus } from "lucide-react";

const occasionLabel = (v: string) => OCCASIONS.find((o) => o.value === v)?.label ?? v;

export default async function DashboardPage() {
  const { user, supabase, profile } = await requireProfile();
  if (!profile?.onboarded) redirect("/onboarding");

  const [{ count: itemCount }, { data: requests }, { data: worn }] = await Promise.all([
    supabase.from("wardrobe_items").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("outfit_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
    supabase.from("worn_history").select("*").eq("user_id", user.id).order("worn_on", { ascending: false }).limit(1),
  ]);

  const items = itemCount ?? 0;
  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <main className="min-h-dvh pb-24">
      <div className="px-6 pt-10 animate-fade-in">
        <p className="text-sm text-muted-foreground">{greeting()}{firstName ? `, ${firstName}` : ""}</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold">What will you wear today?</h1>

        {items < 10 ? (
          <Card className="mt-6 border-rose/30 bg-rose/5">
            <CardContent className="pt-5">
              <p className="font-medium">Build your wardrobe first</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add at least 10 items so we can suggest great outfits. You have {items} so far.
              </p>
              <Button asChild className="mt-4" size="full">
                <Link href="/wardrobe/upload"><Plus className="h-4 w-4" /> Add clothes</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Button asChild className="mt-6" size="full">
            <Link href="/occasion/new"><Sparkles className="h-4 w-4" /> Get today&apos;s outfit ideas</Link>
          </Button>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link href="/wardrobe">
            <Card className="h-full">
              <CardContent className="flex flex-col gap-1 pt-5">
                <Shirt className="h-5 w-5 text-plum" />
                <span className="mt-1 text-2xl font-semibold">{items}</span>
                <span className="text-sm text-muted-foreground">items in wardrobe</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/occasion/new">
            <Card className="h-full">
              <CardContent className="flex flex-col gap-1 pt-5">
                <Sparkles className="h-5 w-5 text-gold" />
                <span className="mt-1 text-2xl font-semibold">{requests?.length ?? 0}</span>
                <span className="text-sm text-muted-foreground">recent requests</span>
              </CardContent>
            </Card>
          </Link>
        </div>

        {requests && requests.length > 0 && (
          <section className="mt-8">
            <h2 className="font-serif text-lg font-semibold">Recent requests</h2>
            <div className="mt-3 space-y-2">
              {requests.map((r) => (
                <Link key={r.id} href={`/outfits/${r.id}`}>
                  <Card>
                    <CardContent className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-medium">{occasionLabel(r.occasion)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge tone={r.status === "fulfilled" ? "sage" : "gold"}>
                        {r.status === "fulfilled" ? "Ideas ready" : "Curating"}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {worn && worn.length > 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            Last worn outfit logged on {new Date(worn[0].worn_on).toLocaleDateString()}.
          </p>
        )}
      </div>
      <BottomNav />
    </main>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
