import { Skeleton } from "@/components/ui/Skeleton";

/** Loading skeleton for admin screens — heading, a few rows/cards. */
export default function AdminLoading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-6 py-10" aria-busy="true" aria-label="Loading admin">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-ww-md" />
        ))}
      </div>
    </main>
  );
}
