"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";

/**
 * Error boundary for authenticated (app) screens. Shows calm, non-technical
 * copy and a retry that re-runs the failed render. Never surfaces the raw error
 * to the user.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Dev-only visibility; no user-facing raw errors.
    if (process.env.NODE_ENV !== "production") console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-6" aria-label="Something went wrong">
      <div className="w-full max-w-sm text-center">
        <span aria-hidden="true" className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-stone">
          <Icon.Sparkle className="h-5 w-5 text-plum" />
        </span>
        <h1 className="mt-4 font-serif text-xl text-charcoal">We couldn&apos;t load this screen</h1>
        <p className="mt-1.5 text-sm text-graphite">
          Something interrupted it. Please try again in a moment.
        </p>
        <Button onClick={reset} size="full" className="mt-5">Try again</Button>
      </div>
    </main>
  );
}
