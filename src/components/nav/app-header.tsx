import Link from "next/link";

export function AppHeader({ title, back }: { title?: string; back?: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur">
      {back ? (
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      ) : (
        <Link href="/dashboard" className="font-serif text-lg font-semibold tracking-tight text-plum">
          WearWise
        </Link>
      )}
      {title && <span className="text-sm font-medium">{title}</span>}
      <span className="w-12" />
    </header>
  );
}
