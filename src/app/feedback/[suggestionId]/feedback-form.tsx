"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ThumbsDown, ThumbsUp } from "lucide-react";

export function FeedbackForm({ suggestionId, requestId }: { suggestionId: string; requestId: string }) {
  const router = useRouter();
  const [liked, setLiked] = useState<boolean | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (liked === null && rating === 0) { setError("Tap a thumb or a star to rate."); return; }
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { error } = await supabase.from("feedback").insert({
      suggestion_id: suggestionId,
      user_id: user.id,
      liked,
      rating: rating || null,
      comment: comment || null,
    });
    if (error) { setError(error.message); setSaving(false); return; }
    router.push(`/outfits/${requestId}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-center gap-4">
        <button
          type="button"
          onClick={() => setLiked(true)}
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full border transition-colors",
            liked === true ? "border-sage bg-sage/20 text-foreground" : "border-border bg-card"
          )}
        >
          <ThumbsUp className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={() => setLiked(false)}
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full border transition-colors",
            liked === false ? "border-rose bg-rose/15 text-plum" : "border-border bg-card"
          )}
        >
          <ThumbsDown className="h-6 w-6" />
        </button>
      </div>

      <div className="space-y-2">
        <Label>Rate this look</Label>
        <div className="flex justify-between gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={cn(
                "h-11 flex-1 rounded-lg border text-lg transition-colors",
                rating >= n ? "border-gold bg-gold/20" : "border-border bg-card"
              )}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="comment">Comments (optional)</Label>
        <Textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What worked, what didn't…"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={submit} size="full" disabled={saving}>
        {saving ? "Saving…" : "Submit feedback"}
      </Button>
    </div>
  );
}
