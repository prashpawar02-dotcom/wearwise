import { Skeleton } from "@/components/ui/Skeleton";

/** Loading skeleton for You/Profile — account row, stats, and the setting cards. */
export default function ProfileLoading() {
  return (
    <main className="min-h-dvh px-6 pt-10 pb-28" aria-busy="true" aria-label="Loading your profile">
      {/* Account row */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-52" />
        </div>
      </div>

      {/* Stat + setting cards */}
      <Skeleton className="mt-5 h-28 w-full rounded-ww-lg" />
      <Skeleton className="mt-5 h-40 w-full rounded-ww-lg" />
      <Skeleton className="mt-5 h-64 w-full rounded-ww-lg" />
      <Skeleton className="mt-5 h-32 w-full rounded-ww-lg" />
    </main>
  );
}
