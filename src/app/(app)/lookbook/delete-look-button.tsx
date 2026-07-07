"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteLookButton({ lookId }: { lookId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const resp = await fetch(`/api/looks/${lookId}`, { method: "DELETE" });
      if (resp.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      aria-label="Delete look"
      className="rounded-full p-1.5 text-muted-foreground transition-colors hover:text-red-600"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
