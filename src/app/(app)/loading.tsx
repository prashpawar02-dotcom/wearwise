import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Default loading skeleton for all authenticated (app) routes. Route-specific
 * loading.tsx files override this where the layout differs. Matches the page
 * padding (px-6 pt-10 pb-28) so there's no layout shift when content arrives.
 */
export default function AppLoading() {
  return (
    <main className="min-h-dvh px-6 pt-10 pb-28" aria-busy="true" aria-label="Loading">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>

      {/* A strip + a large card + two stat tiles (common shape across screens) */}
      <Skeleton className="mt-4 h-11 w-full rounded-ww-md" />
      <Skeleton className="mt-5 h-56 w-full rounded-ww-lg" />
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-ww-lg" />
        <Skeleton className="h-24 rounded-ww-lg" />
      </div>
    </main>
  );
}
