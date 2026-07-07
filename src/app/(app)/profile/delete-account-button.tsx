"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Account + data deletion (Module G). Two-step confirm, honest copy. */
export function DeleteAccountButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function doDelete() {
    setBusy(true);
    setError("");
    try {
      const resp = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!resp.ok) throw new Error();
      await createClient().auth.signOut();
      router.push("/");
    } catch {
      setError("Couldn't delete your account right now — please try again.");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Delete my account &amp; data
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm text-red-800">
        This permanently deletes your wardrobe photos, outfits, streaks, and account. There is no undo.
      </p>
      <div className="mt-2 flex gap-2">
        <button onClick={doDelete} disabled={busy} className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white">
          {busy ? "Deleting…" : "Delete everything"}
        </button>
        <button onClick={() => setConfirming(false)} disabled={busy} className="rounded-full border border-border px-4 py-1.5 text-xs">
          Keep my account
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
