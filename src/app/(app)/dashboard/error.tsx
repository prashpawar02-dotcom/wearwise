"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { track } from "@/lib/analytics";

/**
 * Today-specific error boundary (Phase 4B, state F "Error"). Catches an
 * unexpected failure while loading Today (e.g. a Supabase call throwing) and
 * shows a calm, human-readable message with a retry — never the raw
 * exception. Falls back to the shared (app)/error.tsx for any route that
 * doesn't define its own boundary; this one exists so Today's retry fires
 * the required `today_retry_tapped` telemetry and uses Today-flavored copy.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Dev-only visibility; no user-facing raw errors.
    if (process.env.NODE_ENV !== "production") console.error(error);
  }, [error]);

  function retry() {
    track("today_retry_tapped", { source: "error_boundary" });
    reset();
  }

  return (
    <main className="grid min-h-dvh place-items-center px-6" aria-label="Today couldn't load">
      <div className="w-full max-w-sm text-center">
        <span aria-hidden="true" className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-stone">
          <Icon.Hanger className="h-5 w-5 text-plum" />
        </span>
        <h1 className="mt-4 font-serif text-xl text-charcoal">We couldn&apos;t load today&apos;s outfit</h1>
        <p className="mt-1.5 text-sm text-graphite">
          Something interrupted it on our side. Your wardrobe is fine — please try again in a moment.
        </p>
        <Button onClick={retry} size="full" className="mt-5">Try again</Button>
      </div>
    </main>
  );
}
