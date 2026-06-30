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
import { Check, Trash2, Sparkles, Loader2, AlertCircle, Plus } from "lucide-react";
import { validateOutfitItems } from "@/lib/outfitValidation";

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
  const supabase = createClient();
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);

  async function generate() {
    if (existing.length > 0 && !confirm("Replace the current draft suggestions with fresh AI drafts? Approved looks are kept.")) return;
    setGenerating(true);
    setGenMsg(null);
    try {
      const res = await fetch(`/api/outfit-requests/${requestId}/generate-drafts`, { method: "POST" });
      const data = await res.json().catch(() => ({ status: "error" }));
      if (data.status === "ok") {
        router.refresh();
      } else if (data.status === "insufficient") {
        setGenMsg({ kind: "info", text: data.message });
      } else {
        setGenMsg({ kind: "error", text: "Couldn't generate drafts right now. Please try again." });
      }
    } catch {
      setGenMsg({ kind: "error", text: "Couldn't generate drafts right now. Please try again." });
    } finally {
      setGenerating(false);
    }
  }

  async function addBlank() {
    setAdding(true);
    await supabase.from("outfit_suggestions").insert({
      request_id: requestId, user_id: userId, title: "New look",
      item_ids: [], status: "draft", source: "manual", position: existing.length + 1,
    });
    await supabase.from("outfit_requests").update({ status: "in_review" }).eq("id", requestId);
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Generate */}
      <section className="rounded-xl border border-plum/25 bg-plum/5 p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-plum" />
          <div className="flex-1">
            <p className="font-medium">AI outfit drafts</p>
            <p className="text-xs text-muted-foreground">
              Generates 3 draft looks from this user&apos;s wardrobe. Drafts are private until you approve them.
            </p>
          </div>
        </div>
        <Button onClick={generate} size="full" className="mt-3" disabled={generating}>
          {generating ? (<><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>) :
            existing.length > 0 ? "Regenerate AI drafts" : "Generate AI outfit drafts"}
        </Button>
        {genMsg && (
          <div className={cn(
            "mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs",
            genMsg.kind === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-gold/40 bg-gold/10 text-muted-foreground"
          )}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{genMsg.text}</span>
          </div>
        )}
      </section>

      {/* Suggestions (editable) */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold">Suggestions ({existing.length})</h2>
          <Button variant="ghost" size="sm" onClick={addBlank} disabled={adding}>
            <Plus className="h-4 w-4" /> Manual
          </Button>
        </div>

        {existing.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No suggestions yet. Generate AI drafts above, or add one manually.
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            {existing.map((s, idx) => (
              <DraftCard key={s.id} suggestion={s} index={idx} items={items} urls={urls} requestId={requestId} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DraftCard({
  suggestion: s, index, items, urls, requestId,
}: {
  suggestion: OutfitSuggestion; index: number; items: WardrobeItem[];
  urls: Record<string, string>; requestId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState(s.title ?? "");
  const [reason, setReason] = useState(s.description ?? "");
  const [avoidNote, setAvoidNote] = useState(s.avoid_note ?? "");
  const [missing, setMissing] = useState(s.missing_item_suggestion ?? "");
  const [selected, setSelected] = useState<string[]>(s.item_ids ?? []);
  const [editingItems, setEditingItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const itemById = new Map(items.map((i) => [i.id, i]));
  const selectedItems = selected
    .map((id) => itemById.get(id))
    .filter((it): it is WardrobeItem => Boolean(it));
  const validation = validateOutfitItems(selectedItems);
  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    await supabase.from("outfit_suggestions").update({
      title: title || null,
      description: reason || null,
      avoid_note: avoidNote || null,
      missing_item_suggestion: missing || null,
      item_ids: selected,
    }).eq("id", s.id);
    setBusy(false); setSaved(true);
    router.refresh();
  }

  async function approve() {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("outfit_suggestions").update({
      status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString(),
    }).eq("id", s.id);
    await supabase.from("outfit_requests").update({ status: "fulfilled" }).eq("id", requestId);
    setBusy(false);
    router.refresh();
  }

  async function reject() {
    setBusy(true);
    await supabase.from("outfit_suggestions").update({ status: "rejected" }).eq("id", s.id);
    setBusy(false);
    router.refresh();
  }

  async function del() {
    if (!confirm("Delete this suggestion?")) return;
    setBusy(true);
    await supabase.from("outfit_suggestions").delete().eq("id", s.id);
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">Look {index + 1}</span>
            {s.source === "ai" && <Badge tone="plum">AI</Badge>}
            {typeof s.ai_confidence === "number" && (
              <span className="text-xs text-muted-foreground">{Math.round(s.ai_confidence * 100)}%</span>
            )}
          </div>
          <Badge tone={s.status === "approved" ? "sage" : s.status === "rejected" ? "muted" : "gold"}>
            {s.status}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} />
        </div>
        <div className="space-y-1.5">
          <Label>Styling reason</Label>
          <Textarea value={reason} onChange={(e) => { setReason(e.target.value); setSaved(false); }} />
        </div>
        <div className="space-y-1.5">
          <Label>What to avoid</Label>
          <Input value={avoidNote} onChange={(e) => { setAvoidNote(e.target.value); setSaved(false); }} placeholder="Optional" />
        </div>
        <div className="space-y-1.5">
          <Label>Missing item (optional)</Label>
          <Input value={missing} onChange={(e) => { setMissing(e.target.value); setSaved(false); }} placeholder="Optional" />
        </div>

        {/* Selected items */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Items ({selected.length})</Label>
            <button onClick={() => setEditingItems((v) => !v)} className="text-xs text-plum hover:underline">
              {editingItems ? "Done" : "Edit items"}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {selected.map((id) => {
              const it = itemById.get(id);
              if (!it) return null;
              return (
                <div key={id} className="aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                  {urls[it.image_path] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[it.image_path]} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
              );
            })}
            {selected.length === 0 && <p className="text-xs text-muted-foreground">No items selected.</p>}
          </div>

          {editingItems && (
            <div className="grid grid-cols-4 gap-2 rounded-lg border border-border p-2">
              {items.map((it) => {
                const active = selected.includes(it.id);
                return (
                  <button key={it.id} type="button" onClick={() => toggle(it.id)}
                    className={cn("relative aspect-[3/4] overflow-hidden rounded-md border-2 bg-muted", active ? "border-plum" : "border-transparent")}>
                    {urls[it.image_path] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urls[it.image_path]} alt="" className="h-full w-full object-cover" />
                    )}
                    {active && (
                      <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-plum text-primary-foreground">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selected.length > 0 && !validation.valid && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-medium">Invalid outfit &mdash; can&apos;t approve.</span> {validation.reason} Adjust the items first.
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={save} disabled={busy}>
            {saved ? "Saved" : "Save edits"}
          </Button>
          {s.status !== "approved" && (
            <Button size="sm" onClick={approve} disabled={busy || selected.length === 0 || !validation.valid}>
              <Check className="h-4 w-4" /> Approve
            </Button>
          )}
          {s.status !== "rejected" && s.status !== "approved" && (
            <Button size="sm" variant="ghost" onClick={reject} disabled={busy}>Reject</Button>
          )}
          <Button size="sm" variant="ghost" onClick={del} disabled={busy} className="text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
