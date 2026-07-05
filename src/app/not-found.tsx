import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Friendly 404 for any unmatched route. */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6" aria-label="Page not found">
      <div className="w-full max-w-sm text-center">
        <p className="ww-eyebrow text-plum">404</p>
        <h1 className="mt-2 font-serif text-2xl text-charcoal">We couldn&apos;t find that page</h1>
        <p className="mt-1.5 text-sm text-graphite">
          The link may be old or the page may have moved. Let&apos;s get you back to your wardrobe.
        </p>
        <Button asChild size="full" className="mt-5">
          <Link href="/dashboard">Back to Today</Link>
        </Button>
      </div>
    </main>
  );
}
