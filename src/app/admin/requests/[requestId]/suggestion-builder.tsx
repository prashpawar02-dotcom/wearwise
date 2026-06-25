"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OutfitSuggestion, WardrobeItem } from "@/lib/types";
import { Check, Trash2 } from "lucide-react";

export function SuggestionBuilder({
  requestId,
  userId,
  items,
  urls,
  existing,
}: {
  requestId: string;
  userId: string;
  items: WardrobeItem[];
  urls: Record<string, string>;
  existing: OutfitSuggestion[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  const supabase = createClient();

  async function createDraft() {
    if (selected.length === 0) { setError("Select at least one item for the look."); return; }
    if (existing.length >= 3) { setError("This request already has 3 suggestions."); return; }
    setBusy(true);
    setError("");
    const { error } = await supabase.from("outfit_suggestions").insert({
      request_id: requestId,
      user_id: userId,
      title: title || null,
      description: description || null,
      item_ids: selected,
      status: "draft",
      position: existing.length + 1,
    });
    // Move request into review when first draft is added.
    await supabase.from("outfit_requests").update({ status: "in_review" }).eq("id", requestId);
    if (error) { setError(error.message); setBusy(false); return; }
    setTitle(""); setDescription(""); setSelected([]);
    setBusy(false);
    router.refresh();
  }

  async function approve(id: string) {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from("outfit_suggestions")
      .update({ status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
      .eq("id", id);
    await supabase.from("outfit_requests").update({ status: "fulfilled" }).eq("id", requestId);
    setBusy(false);
    router.refresh();
  }

  async function reject(id: string) {
    setBusy(true);
    await supabase.from("outfit_suggestions").update({ status: "rejected" }).eq("id", id);
    setBusy(false);
    router.refresh();
  }

  async function del(id: string) {
    if (!confirm("Delete this suggestion?")) return;
    setBusy(true);
    await supabase.from("outfit_suggestions").delete().eq("id", id);
    setBusy(false);
    router.refresh();
  }

  const itemById = new Map(items.map((i) => [i.id, i]));

  return (
    <div className="space-y-8">
      {/* Existing suggestions */}
      {existing.length > 0 && (
        <section>
          <h2 className="font-serif text-lg font-semibold">Suggestions ({existing.length}/3)</h2>
          <div className="mt-3 space-y-3">
            {existing.map((s, idx) => (
              <Card key={s.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{s.title || `Look ${idx + 1}`}</p>
                    <Badge tone={s.status === "approved" ? "sage" : s.status === "rejected" ? "muted" : "gold"}>
                      {s.status}
                    </Badge>
                  </div>
                  {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {s.item_ids.map((id) => {
                      const it = itemById.get(id);
                      if (!it) return null;
                      return (
                        <div key={id} className="aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                          {urls[it.image_path] && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={urls[it.image_path]} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-2">
                    {s.status !== "approved" && (
                      <Button size="sm" onClick={() => approve(s.id)} disabled={busy}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                    )}
                    {s.status !== "rejected" && s.status !== "approved" && (
                      <Button size="sm" variant="outline" onClick={() => reject(s.id)} disabled={busy}>
                        Reject
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => del(s.id)} disabled={busy}
                      className="text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* New suggestion builder */}
      {existing.length < 3 && (
        <section>
          <h2 className="font-serif text-lg font-semibold">Build a new look</h2>
          <div className="mt-3 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Easy office elegance" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Styling note</Label>
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Why this works and how to wear it." />
            </div>

            <div className="space-y-2">
              <Label>Pick items from her wardrobe ({selected.length} selected)</Label>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">This user has no wardrobe items yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {items.map((it) => {
                    const active = selected.includes(it.id);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => toggle(it.id)}
                        className={cn(
                          "relative aspect-[3/4] overflow-hidden rounded-lg border-2 bg-muted",
                          active ? "border-plum" : "border-transparent"
                        )}
                      >
                        {urls[it.image_path] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={urls[it.image_path]} alt="" className="h-full w-full object-cover" />
                        )}
                        {active && (
                          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-plum text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button onClick={createDraft} size="full" disabled={busy}>
              {busy ? "Saving…" : "Save as draft"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
