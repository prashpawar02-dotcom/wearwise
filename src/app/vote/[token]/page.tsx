import { VoteClient } from "./vote-client";

export const dynamic = "force-dynamic";

/**
 * Public friend-vote page (Module F) — the growth loop's landing surface.
 * No auth, no PII: renders outfit options fetched from the rate-limited
 * public API and a "Make your own" signup CTA. Branded, mobile-first.
 */
export default function VotePage({ params }: { params: { token: string } }) {
  return (
    <main className="min-h-dvh bg-ivory pb-16">
      <header className="flex h-14 items-center justify-center border-b border-hairline bg-ivory/90">
        <span className="font-serif text-lg font-semibold tracking-tight text-plum">WearWise</span>
      </header>
      <VoteClient token={params.token} />
    </main>
  );
}
