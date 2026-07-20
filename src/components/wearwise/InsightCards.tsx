"use client";

// =====================================================================
// WearWise — Wardrobe insight cards (Phase 5, Module E)
// Renders ≤3 honest, query-backed cards in a stable order
// (most-worn → quiet gems → laundry). Every value is passed in from the
// server loader; this component invents nothing. Each card has ONE
// accessible action (≥44px) and emits `insight_card_tapped` only on tap.
// =====================================================================

import Link from "next/link";
import { track } from "@/lib/analytics";
import type { InsightCard } from "@/lib/wardrobe/insights";

const CARD_CLASS =
  "flex min-h-[44px] flex-col justify-center rounded-ww-md border border-hairline bg-bone px-3 py-2.5 text-left shadow-ww-sm transition-colors hover:border-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function InsightCards({
  cards,
  onShowGems,
  onShowLaundry,
}: {
  cards: InsightCard[];
  onShowGems: () => void;
  onShowLaundry: () => void;
}) {
  if (!cards.length) return null;

  return (
    <section aria-label="Wardrobe insights" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {cards.map((card) => {
        if (card.kind === "most_worn") {
          return (
            <Link
              key="most_worn"
              href={`/wardrobe/${card.itemId}`}
              onClick={() => track("insight_card_tapped", { insight_type: "most_worn", source: "wardrobe_board" })}
              className={CARD_CLASS}
            >
              <span className="ww-eyebrow text-plum">Most worn</span>
              <span className="mt-0.5 truncate text-sm font-medium text-charcoal">
                {card.label} · {card.count} {card.count === 1 ? "wear" : "wears"}
              </span>
            </Link>
          );
        }
        if (card.kind === "quiet_gems") {
          return (
            <button
              key="quiet_gems"
              type="button"
              onClick={() => {
                track("insight_card_tapped", { insight_type: "quiet_gems", source: "wardrobe_board" });
                onShowGems();
              }}
              className={CARD_CLASS}
            >
              <span className="ww-eyebrow text-plum">Quiet gems</span>
              <span className="mt-0.5 text-sm font-medium text-charcoal">
                {card.count} {card.count === 1 ? "piece" : "pieces"} resting 6+ weeks
              </span>
            </button>
          );
        }
        return (
          <button
            key="laundry"
            type="button"
            onClick={() => {
              track("insight_card_tapped", { insight_type: "laundry", source: "wardrobe_board" });
              onShowLaundry();
            }}
            className={CARD_CLASS}
          >
            <span className="ww-eyebrow text-plum">Laundry</span>
            <span className="mt-0.5 text-sm font-medium text-charcoal">
              {card.inWash} {card.inWash === 1 ? "item" : "items"} in wash
            </span>
          </button>
        );
      })}
    </section>
  );
}
