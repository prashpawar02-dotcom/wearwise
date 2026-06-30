"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AUTOTAG_PRIVACY_COPY } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Camera, Sparkles, Check, AlertCircle, Loader2, X, Lock } from "lucide-react";

const MAX_BATCH = 10;
const CONCURRENCY = 3;

type ItemStatus =
  | "pending" | "uploading" | "analyzing" | "ready" | "needs_review" | "failed";

interface BatchItem {
  localId: string;
  file: File;
  preview: string;
  itemId?: string;
  status: ItemStatus;
}

type Phase = "select" | "processing" | "done";

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [phase, setPhase] = useState<Phase>("select");
  const [note, setNote] = useState("");

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const room = MAX_BATCH - items.length;
    const accepted = files.slice(0, Math.max(0, room));
    if (files.length > room) setNote(`You can add up to ${MAX_BATCH} photos at a time.`);
    else setNote("");
    setItems((cur) => [
      ...cur,
      ...accepted.map((file) => ({
        localId: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        status: "pending" as ItemStatus,
      })),
    ]);
    e.target.value = ""; // allow re-selecting the same file
  }

  function removeItem(localId: string) {
    setItems((cur) => cur.filter((i) => i.localId !== localId));
  }

  function patch(localId: string, p: Partial<BatchItem>) {
    setItems((cur) => cur.map((i) => (i.localId === localId ? { ...i, ...p } : i)));
  }

  async function processOne(item: BatchItem, userId: string, supabase: ReturnType<typeof createClient>) {
    try {
      patch(item.localId, { status: "uploading" });
      const ext = item.file.name.split(".").pop() || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("wardrobe").upload(path, item.file, { cacheControl: "3600", upsert: false });
      if (upErr) throw new Error("upload");

      const { data: row, error: insErr } = await supabase
        .from("wardrobe_items")
        .insert({ user_id: userId, image_path: path, ai_tag_status: "analyzing" })
        .select("id").single();
      if (insErr || !row) throw new Error("insert");

      patch(item.localId, { status: "analyzing", itemId: row.id });

      // Reuse the existing server-side auto-tagging route (key stays server-only).
      const res = await fetch(`/api/wardrobe/${row.id}/autotag`, { method: "POST" });
      const json = await res.json().catch(() => ({ status: "failed" }));
      const s: ItemStatus =
        json.status === "tagged" ? "ready" :
        json.status === "needs_review" ? "needs_review" : "failed";
      patch(item.localId, { status: s });
    } catch {
      patch(item.localId, { status: "failed" });
    }
  }

  async function startBatch() {
    if (items.length === 0) return;
    setPhase("processing");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    // Snapshot the queue; process with limited concurrency.
    const queue = [...items];
    let idx = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (idx < queue.length) {
        const cur = queue[idx++];
        await processOne(cur, user.id, supabase);
      }
    });
    await Promise.all(workers);

    // Single-item: keep the v0.2 confirmation-card experience.
    if (queue.length === 1) {
      const only = queue[0];
      // read latest state for that item
      setItems((cur) => {
        const it = cur.find((x) => x.localId === only.localId);
        if (it?.itemId) router.push(`/wardrobe/${it.itemId}`);
        else setPhase("done");
        return cur;
      });
      return;
    }
    setPhase("done");
  }

  function goToWardrobe() {
    // Hard navigation guarantees a fresh server render of /wardrobe, bypassing the
    // App Router client cache (which can hold a prefetched, pre-upload empty list).
    window.location.assign("/wardrobe");
  }

  // ---------- SELECT ----------
  if (phase === "select") {
    return (
      <div className="space-y-6">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onPick}
        />

        {items.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-ww-md border-2 border-dashed border-hairline-strong bg-bone text-graphite transition-colors hover:border-plum/40"
          >
            <Camera className="h-8 w-8 text-plum" />
            <span className="mt-2 text-sm">Tap to choose photos</span>
            <span className="text-xs text-mist">Natural light · plain background works best</span>
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {items.map((i) => (
              <div key={i.localId} className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.preview} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeItem(i.localId)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background"
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {items.length < MAX_BATCH && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex aspect-[3/4] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground"
              >
                <Camera className="h-5 w-5" />
                <span className="mt-1 text-xs">Add</span>
              </button>
            )}
          </div>
        )}

        {note && <p className="text-xs text-gold">{note}</p>}

        <div className="flex items-start gap-2 rounded-ww-md border border-sage/30 bg-sage/10 p-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
          <p className="text-xs text-graphite">{AUTOTAG_PRIVACY_COPY}</p>
        </div>

        <Button onClick={startBatch} size="full" disabled={items.length === 0}>
          {items.length <= 1 ? "Add to wardrobe" : `Add ${items.length} items`}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-graphite">
          <Lock className="h-3 w-3" /> Photos are private and can be deleted anytime.
        </p>
      </div>
    );
  }

  // ---------- PROCESSING / DONE ----------
  const ready = items.filter((i) => i.status === "ready").length;
  const review = items.filter((i) => i.status === "needs_review").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const uploaded = items.filter((i) => i.itemId).length;

  return (
    <div className="space-y-5">
      {phase === "done" && (
        <Card className="border-sage/30 bg-sage/5">
          <CardContent className="pt-5">
            <p className="font-serif text-lg font-semibold">Added to your wardrobe</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {uploaded} uploaded · {ready} ready
              {review > 0 ? ` · ${review} to check` : ""}
              {failed > 0 ? ` · ${failed} failed` : ""}
            </p>
          </CardContent>
        </Card>
      )}

      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.localId}>
            <ItemRow item={i} />
          </li>
        ))}
      </ul>

      {phase === "done" && (
        <div className="space-y-3">
          <Button onClick={goToWardrobe} size="full">Go to wardrobe</Button>
          {failed > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Failed items aren&apos;t saved. You can try adding those photos again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({ item }: { item: BatchItem }) {
  const inner = (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
      <div className="h-14 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.preview} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <StatusLabel status={item.status} />
      </div>
    </div>
  );
  // Tap to edit once it has a DB row.
  return item.itemId ? <Link href={`/wardrobe/${item.itemId}`}>{inner}</Link> : inner;
}

function StatusLabel({ status }: { status: ItemStatus }) {
  const map: Record<ItemStatus, { text: string; cls: string; icon: React.ReactNode }> = {
    pending:      { text: "Waiting…",     cls: "text-muted-foreground", icon: <Loader2 className="h-4 w-4" /> },
    uploading:    { text: "Uploading…",   cls: "text-muted-foreground", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
    analyzing:    { text: "Analyzing…",   cls: "text-plum",             icon: <Sparkles className="h-4 w-4 animate-pulse" /> },
    ready:        { text: "Ready",        cls: "text-foreground",       icon: <Check className="h-4 w-4 text-sage" /> },
    needs_review: { text: "Please check", cls: "text-foreground",       icon: <AlertCircle className="h-4 w-4 text-gold" /> },
    failed:       { text: "Failed", cls: "text-destructive", icon: <AlertCircle className="h-4 w-4 text-destructive" /> },
  };
  const s = map[status];
  return (
    <span className={cn("flex items-center gap-2 text-sm font-medium", s.cls)}>
      {s.icon} {s.text}
    </span>
  );
}
