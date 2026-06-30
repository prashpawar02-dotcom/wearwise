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
import { Check, Trash2, Sparkles, Loader2, AlertCircle, Plus, Copy, X } from "lucide-react";
import { validateOutfitItems, roleForItem } from "@/lib/outfitValidation";

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

/** Small admin-only clipboard button. No-op if the API is unavailable. */
function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }
    } catch {
      /* clipboard blocked — ignore */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
    >
      {copied ? <Check className="h-3 w-3 text-sage" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
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
  const [showDetails, setShowDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const itemById = new Map(items.map((i) => [i.id, i]));
  const selectedItems = selected
    .map((id) => itemById.get(id))
    .filter((it): it is WardrobeItem => Boolean(it));
  const validation = validateOutfitItems(selectedItems);
  // FAIL CLOSED: ids that don't resolve to a real wardrobe item block approval.
  const unresolved = selected.filter((id) => !itemById.has(id));
  const structurallyValid = unresolved.length === 0 && validation.valid;
  const canApprove = selected.length > 0 && structurallyValid;

  const shortId = s.id.slice(0, 8);
  const isApproved = s.status === "approved";
  const invalidApproved = isApproved && !structurallyValid;
  const createdStr = s.created_at ? new Date(s.created_at).toLocaleString() : null;
  const approvedAt = (s as { approved_at?: string | null }).approved_at ?? null;
  const approvedStr = approvedAt ? new Date(approvedAt).toLocaleString() : null;
  const validationMessage = unresolved.length > 0
    ? "One or more selected items couldn't be found in this user's wardrobe."
    : validation.reason;

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setSaved(false);
    setActionError(null);
  }

  // --- Content edits go through the admin update route (whitelisted fields). ---
  async function save() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/outfit-suggestions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || null,
          description: reason || null,
          avoid_note: avoidNote || null,
          missing_item_suggestion: missing || null,
          item_ids: selected,
        }),
      });
      if (res.ok) { setSaved(true); router.refresh(); }
      else setActionError("Couldn't save changes. Please try again.");
    } catch {
      setActionError("Couldn't save changes. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // --- Approve via the server route, which RE-VALIDATES (place 3). ---
  async function approve() {
    if (!canApprove) {
      setActionError(validationMessage ?? "This outfit can't be approved.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/outfit-suggestions/${s.id}/approve`, { method: "POST" });
      const data = await res.json().catch(() => ({ status: "error" }));
      if (res.ok && data.status === "ok") { router.refresh(); return; }
      if (res.status === 422) setActionError(data.reason ?? "This outfit can't be approved.");
      else if (res.status === 401 || res.status === 403) setActionError("You don't have permission to approve this look.");
      else setActionError("Couldn't approve right now. Please try again.");
    } catch {
      setActionError("Couldn't approve right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/outfit-suggestions/${s.id}/reject`, { method: "POST" });
      if (res.ok) router.refresh();
      else setActionError("Couldn't reject right now. Please try again.");
    } catch {
      setActionError("Couldn't reject right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function returnToDraft() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/outfit-suggestions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      if (res.ok) router.refresh();
      else setActionError("Couldn't return to draft. Please try again.");
    } catch {
      setActionError("Couldn't return to draft. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Delete keeps the app's existing confirm-guarded pattern (admin RLS).
  async function del() {
    if (!confirm("Delete this suggestion? Prefer Reject unless this is junk.")) return;
    setBusy(true);
    await supabase.from("outfit_suggestions").delete().eq("id", s.id);
    setBusy(false);
    router.refresh();
  }

  return (
    <Card className={cn(invalidApproved && "border-destructive/50")}>
      <CardContent className="space-y-3 pt-4">
        {/* Header with visible short id (matches audit output) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Look {index + 1}</span>
            <span className="font-mono text-xs text-muted-foreground">Suggestion {shortId}</span>
            {s.source === "ai" && <Badge tone="plum">AI</Badge>}
            {typeof s.ai_confidence === "number" && (
              <span className="text-xs text-muted-foreground">{Math.round(s.ai_confidence * 100)}%</span>
            )}
          </div>
          <Badge tone={s.status === "approved" ? "sage" : s.status === "rejected" ? "muted" : "gold"}>
            {s.status}
          </Badge>
        </div>

        {/* Danger: approved but invalid under the current validator */}
        {invalidApproved && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              This approved suggestion is invalid and users may see it.
            </div>
            <p className="mt-1">
              Suggestion <span className="font-mono">{shortId}</span> · {validationMessage}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="destructive" onClick={reject} disabled={busy}>
                Reject invalid suggestion
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingItems(true)} disabled={busy}>
                Edit items
              </Button>
            </div>
          </div>
        )}

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

          {/* Thumbnails */}
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

          {/* Textual list: name — category — role, with remove + unresolved flag */}
          {selected.length > 0 && (
            <ul className="space-y-1">
              {selected.map((id) => {
                const it = itemById.get(id);
                if (!it) {
                  return (
                    <li key={id} className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                      <span className="min-w-0 truncate">
                        Unresolved wardrobe item <span className="font-mono">{id.slice(0, 8)}…</span>
                      </span>
                      <button type="button" onClick={() => toggle(id)} className="shrink-0 hover:underline" aria-label="Remove item">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                }
                const role = roleForItem(it);
                return (
                  <li key={id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{it.user_facing_name ?? it.category ?? "Item"}</span>
                      {it.category ? ` — ${it.category}` : ""}
                      {" — "}<span className="text-muted-foreground">role: {role}</span>
                    </span>
                    <button type="button" onClick={() => toggle(id)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remove item">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add / replace from the user's wardrobe */}
          {editingItems && (
            <div className="grid grid-cols-4 gap-2 rounded-lg border border-border p-2">
              {items.map((it) => {
                const active = selected.includes(it.id);
                return (
                  <button key={it.id} type="button" onClick={() => toggle(it.id)}
                    title={`${it.user_facing_name ?? it.category ?? "Item"} — role: ${roleForItem(it)}`}
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

        {/* Live validation warning (place 2). Approve stays disabled while invalid. */}
        {selected.length > 0 && (!structurallyValid || actionError) && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-medium">{structurallyValid ? "Action failed." : "Invalid outfit — can't approve."}</span>{" "}
              {actionError ?? validationMessage}{!actionError ? " Adjust the items first." : ""}
            </span>
          </div>
        )}

        {/* Admin details (IDs, copy, dates, validation) */}
        <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center justify-between font-medium text-muted-foreground"
          >
            Admin details
            <span>{showDetails ? "Hide" : "Show"}</span>
          </button>
          {showDetails && (
            <dl className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Suggestion ID</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  <code className="truncate font-mono">{s.id}</code>
                  <CopyButton value={s.id} label="Copy ID" />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Request ID</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  <code className="truncate font-mono">{requestId}</code>
                  <CopyButton value={requestId} label="Copy ID" />
                </dd>
              </div>
              <DetailRow label="Status" value={s.status} />
              <DetailRow label="Source" value={s.source ?? "—"} />
              <DetailRow label="Created" value={createdStr ?? "—"} />
              <DetailRow label="Approved" value={approvedStr ?? "—"} />
              <div className="flex items-start justify-between gap-2">
                <dt className="text-muted-foreground">Validation</dt>
                <dd className={cn("text-right", structurallyValid ? "text-sage" : "text-destructive")}>
                  {structurallyValid ? "Valid" : "Invalid"}
                  {!structurallyValid && validationMessage ? ` — ${validationMessage}` : ""}
                </dd>
              </div>
            </dl>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={save} disabled={busy}>
            {saved ? "Saved" : "Save edits"}
          </Button>
          {s.status !== "approved" && (
            <Button size="sm" onClick={approve} disabled={busy || !canApprove}>
              <Check className="h-4 w-4" /> Approve
            </Button>
          )}
          {s.status !== "rejected" && (
            <Button size="sm" variant="ghost" onClick={reject} disabled={busy}>Reject</Button>
          )}
          {(s.status === "approved" || s.status === "rejected") && (
            <Button size="sm" variant="ghost" onClick={returnToDraft} disabled={busy}>Return to draft</Button>
          )}
          <Button size="sm" variant="ghost" onClick={del} disabled={busy} className="text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </div>
  );
}
