"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Error boundary for admin screens — calm copy + retry, no raw error shown. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") console.error(error);
  }, [error]);

  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl place-items-center px-6" aria-label="Admin error">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-serif text-xl text-charcoal">This admin view didn&apos;t load</h1>
        <p className="mt-1.5 text-sm text-graphite">Please try again in a moment.</p>
        <Button onClick={reset} size="full" className="mt-5">Try again</Button>
      </div>
    </main>
  );
}
