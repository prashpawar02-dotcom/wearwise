import { Skeleton } from "@/components/ui/Skeleton";

/** Loading skeleton for Today — mirrors the header, weather strip, pick card,
 *  insight and stat tiles so content swaps in without layout shift. */
export default function DashboardLoading() {
  return (
    <main className="min-h-dvh px-6 pt-10 pb-28" aria-busy="true" aria-label="Loading your day">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-52" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>

      <Skeleton className="mt-3 h-4 w-64" />

      {/* Weather strip */}
      <Skeleton className="mt-3 h-11 w-full rounded-ww-md" />

      {/* Context chips */}
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>

      {/* Best Pick card */}
      <Skeleton className="mt-5 h-72 w-full rounded-ww-lg" />

      {/* Daily insight */}
      <Skeleton className="mt-5 h-16 w-full rounded-ww-md" />

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-ww-lg" />
        <Skeleton className="h-24 rounded-ww-lg" />
      </div>
    </main>
  );
}
