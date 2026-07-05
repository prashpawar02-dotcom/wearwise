import { Skeleton } from "@/components/ui/Skeleton";

/** Loading skeleton for an outfit request detail — header + suggestion cards. */
export default function OutfitLoading() {
  return (
    <main className="min-h-dvh px-6 pt-10 pb-28" aria-busy="true" aria-label="Loading outfit ideas">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-40" />

      <div className="mt-6 space-y-4">
        <Skeleton className="h-72 w-full rounded-ww-lg" />
        <Skeleton className="h-72 w-full rounded-ww-lg" />
      </div>
    </main>
  );
}
