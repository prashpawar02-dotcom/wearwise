"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORIES, PATTERNS, OCCASIONS, type Occasion, type WardrobeItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

export function ItemEditor({ item }: { item: WardrobeItem }) {
  const router = useRouter();
  const [category, setCategory] = useState(item.category ?? "");
  const [color, setColor] = useState(item.color ?? "");
  const [pattern, setPattern] = useState(item.pattern ?? "");
  const [occasions, setOccasions] = useState<Occasion[]>(item.occasion_tags ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function toggleOcc(o: Occasion) {
    setOccasions((cur) => (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]));
  }

  async function save() {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase
      .from("wardrobe_items")
      .update({
        category: category || null,
        color: color || null,
        pattern: pattern || null,
        occasion_tags: occasions,
      })
      .eq("id", item.id);
    if (error) { setError(error.message); setSaving(false); return; }
    router.push("/wardrobe");
    router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this item from your wardrobe?")) return;
    setDeleting(true);
    const supabase = createClient();
    // Remove the photo from storage, then the row.
    await supabase.storage.from("wardrobe").remove([item.image_path]);
    const { error } = await supabase.from("wardrobe_items").delete().eq("id", item.id);
    if (error) { setError(error.message); setDeleting(false); return; }
    router.push("/wardrobe");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Category</Label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? "" : c)}>{c}</Chip>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="color">Colour</Label>
        <Input id="color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. Maroon" />
      </div>

      <div className="space-y-2">
        <Label>Pattern</Label>
        <div className="flex flex-wrap gap-2">
          {PATTERNS.map((p) => (
            <Chip key={p} active={pattern === p} onClick={() => setPattern(pattern === p ? "" : p)}>{p}</Chip>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Good for</Label>
        <div className="flex flex-wrap gap-2">
          {OCCASIONS.map((o) => (
            <Chip key={o.value} active={occasions.includes(o.value)} onClick={() => toggleOcc(o.value)}>{o.label}</Chip>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={save} size="full" disabled={saving}>
        {saving ? "Saving…" : "Save item"}
      </Button>

      <Button onClick={remove} variant="ghost" size="full" disabled={deleting}
        className="text-destructive hover:bg-destructive/10">
        <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Delete item"}
      </Button>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active ? "border-plum bg-plum/10 text-plum" : "border-border bg-card"
      )}
    >
      {children}
    </button>
  );
}
