import { Skeleton } from "@/components/ui/Skeleton";

/** Loading skeleton for Style Me — header, context strip, and the occasion card grid. */
export default function OccasionLoading() {
  return (
    <main className="min-h-dvh px-6 pt-10 pb-28" aria-busy="true" aria-label="Loading Style Me">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-48" />
      </div>

      <Skeleton className="mt-4 h-11 w-full rounded-ww-md" />

      <div className="mt-6 grid grid-cols-2 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-ww-lg" />
        ))}
      </div>
    </main>
  );
}
