import { Skeleton } from "@/components/ui/Skeleton";

/** Loading skeleton for the Closet Board — header, health card, filter row and
 *  a grid of garment tiles. */
export default function WardrobeLoading() {
  return (
    <main className="min-h-dvh px-6 pt-10 pb-28" aria-busy="true" aria-label="Loading your closet">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-44" />
      </div>

      {/* Closet health card */}
      <Skeleton className="mt-5 h-28 w-full rounded-ww-lg" />

      {/* Filter chips */}
      <div className="mt-5 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-full" />
        ))}
      </div>

      {/* Zone heading + tile grid */}
      <Skeleton className="mt-6 h-4 w-40" />
      <div className="mt-3 grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-ww-md" />
        ))}
      </div>
    </main>
  );
}
