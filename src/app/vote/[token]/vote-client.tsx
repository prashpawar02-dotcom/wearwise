"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoteOption {
  key: string;
  title: string;
  votes: number;
  items: { image: string | null; category: string | null }[];
}

export function VoteClient({ token }: { token: string }) {
  const [options, setOptions] = useState<VoteOption[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "voted" | "gone">("loading");
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`/api/vote/${token}`);
        if (!resp.ok) { setState("gone"); return; }
        const json = (await resp.json()) as { status: string; options?: VoteOption[] };
        if (json.status !== "ok" || !json.options) { setState("gone"); return; }
        setOptions(json.options);
        setState("ready");
      } catch {
        setState("gone");
      }
    })();
  }, [token]);

  async function vote(key: string) {
    if (state !== "ready") return;
    setPicked(key);
    setState("voted");
    try {
      const resp = await fetch(`/api/vote/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionKey: key }),
      });
      const json = (await resp.json()) as { status: string; votes?: Record<string, number> };
      if (json.status === "ok" && json.votes && options) {
        setOptions(options.map((o) => ({ ...o, votes: json.votes?.[o.key] ?? o.votes })));
      }
    } catch { /* vote already reflected optimistically */ }
  }

  if (state === "loading") {
    return <p className="mt-20 text-center text-sm text-graphite">Loading looks…</p>;
  }
  if (state === "gone") {
    return (
      <div className="mx-auto mt-20 max-w-xs text-center">
        <p className="font-serif text-xl text-charcoal">This vote has ended.</p>
        <p className="mt-2 text-sm text-graphite">But you can build your own daily stylist in minutes.</p>
        <SignupCta />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[480px] animate-fade-in px-5 pt-6">
      <h1 className="text-center font-serif text-2xl leading-tight text-charcoal">
        {state === "voted" ? "Thanks for helping! 💛" : "Which look should they wear?"}
      </h1>
      <p className="mt-1 text-center text-sm text-graphite">
        {state === "voted" ? "Your vote is counted." : "Tap your favourite — it takes one second."}
      </p>

      <div className="mt-6 space-y-4">
        {(options ?? []).map((o) => (
          <button
            key={o.key}
            onClick={() => vote(o.key)}
            disabled={state === "voted"}
            className={cn(
              "w-full rounded-ww-lg border bg-paper p-4 text-left shadow-ww-sm transition-all",
              picked === o.key ? "border-plum ring-2 ring-plum/30" : "border-hairline hover:border-plum/40"
            )}
          >
            <div className="flex items-center justify-between">
              <p className="font-serif text-base font-semibold text-charcoal">{o.title}</p>
              {state === "voted" && (
                <span className="flex items-center gap-1 text-sm text-plum">
                  {picked === o.key && <Check className="h-4 w-4" />}
                  {o.votes} vote{o.votes === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {o.items.map((it, i) => (
                <div key={i} className="h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-lg border border-hairline bg-stone">
                  {it.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image} alt={it.category ?? ""} className="h-full w-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      {state === "voted" && <SignupCta />}
    </div>
  );
}

function SignupCta() {
  return (
    <div className="mt-8 rounded-ww-lg border border-hairline bg-bone p-5 text-center">
      <p className="font-serif text-lg text-charcoal">Never stress about what to wear.</p>
      <p className="mt-1 text-sm text-graphite">
        Upload your clothes once — get a fresh outfit from your own wardrobe every morning.
      </p>
      <Link
        href="/login?ref=vote"
        className="mt-4 inline-block rounded-full bg-plum px-6 py-2.5 text-sm font-medium text-white"
      >
        Make your own with WearWise
      </Link>
    </div>
  );
}
