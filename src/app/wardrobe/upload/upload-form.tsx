"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CATEGORIES } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Camera } from "lucide-react";

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Please choose a photo first."); return; }
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("wardrobe")
      .upload(path, file, { cacheControl: "3600", upsert: false });

    if (upErr) { setError(upErr.message); setSaving(false); return; }

    const { data: inserted, error: insErr } = await supabase
      .from("wardrobe_items")
      .insert({ user_id: user.id, image_path: path, category: category || null })
      .select("id")
      .single();

    if (insErr) { setError(insErr.message); setSaving(false); return; }

    // Go to the item editor to refine tags
    router.push(`/wardrobe/${inserted.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-card"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center text-muted-foreground">
            <Camera className="h-8 w-8" />
            <span className="mt-2 text-sm">Tap to take or choose a photo</span>
          </div>
        )}
      </button>

      <div className="space-y-2">
        <Label>Quick category (optional)</Label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(category === c ? "" : c)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                category === c ? "border-plum bg-plum/10 text-plum" : "border-border bg-card"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" size="full" disabled={saving || !file}>
        {saving ? "Uploading…" : "Save & add tags"}
      </Button>
    </form>
  );
}
