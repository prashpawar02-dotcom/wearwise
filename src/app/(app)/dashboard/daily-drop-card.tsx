"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import { ActionRow } from "@/components/shell/ActionRow";
import { SaveLookButton } from "@/components/wearwise/SaveLookButton";
import { WearConfirmSheet, type WearConfirmState } from "@/components/wearwise/WearConfirmSheet";
import { PostWearSheet } from "@/components/wearwise/PostWearSheet";
import { WhyThisWorks } from "@/components/wearwise/WhyThisWorks";
import { SwapSheet, type CapView } from "@/components/wearwise/SwapSheet";
import { track } from "@/lib/analytics";
import type { Disposition } from "@/lib/laundry";

/**
 * Today's Drop card — renders a prepared daily_recommendation on the Today
 * screen (Phase 4B "Today v2"). Signed image URLs are passed in as props
 * (resolved server-side); this card never fetches or constructs image paths
 * itself.
 *
 * Information hierarchy inside this component (handoff §Phase 4B):
 * hero (thumbnails + items, honest partial-outfit badge) -> primary action
 * (Wear this) -> secondary actions (Swap one thing / Another option / Save
 * look) -> Why This Works (engine-grounded) -> one compact supporting
 * insight. The occasion chip and weather now live in the page-level context
 * strip, not here — no duplicate chip.
 *
 * Phase 3: "Swap one thing" and "Show another" open the SwapSheet (lock-and-
 * replace, mood swaps, full re-theme, caps, feedback, put-back). "Why this
 * works" is a collapsible chip rendered from stored scoring factors.
 *
 * Phase 4C: "Wore It" is a TWO-STEP flow — WearConfirmSheet (confirm, server-
 * validated via POST /api/daily-drop/wear, which calls the ONE atomic RPC
 * confirm_daily_drop_wear — see supabase/migrations/0023_atomic_wear_
 * confirmation.sql for the ownership/idempotency/exact-set/availability/
 * row-locking contract, all inside one database transaction) then, on
 * success, the existing PostWearSheet (laundry disposition, Phase 2,
 * unchanged apart from failure visibility — see persistPostWear()).
 * wearThis() itself performs no write — see confirmWorn().
 *
 * Laundry persistence is intentionally a SEPARATE, later transaction from
 * wear confirmation (by design — it's optional, wear confirmation must never
 * roll back because of it). Its failure must still be visible: persistPostWear()
 * does not unconditionally close the sheet in a `finally` block anymore — on
 * failure the sheet stays open, the user's chosen dispositions are untouched
 * (they live inside PostWearSheet's own state), a clear error is shown, and
 * the same Done/Ask-me-less buttons double as Retry. The user can still
 * explicitly dismiss (Skip for now / the sheet's own close) to move on.
 */
export interface DailyDropItemView {
  id: string;
  label: string;
  sub: string | null;
  image: string | null;
  lastWornAt: string | null;
  category?: string | null;
  /** Phase 3 hotfix: canonical swap slot label (Top/Bottom/Shoes/Layer/Accessory). */
  slot?: string | null;
}

export interface DailyDropView {
  id: string;
  status: string;
  occasionContext: string | null;
  weatherSummary: string | null;
  reasoning: string | null;
  dailyInsight: string | null;
  itemIds: string[];
  items: DailyDropItemView[];
  /** Phase 3: top-3 Why-This-Works lines (1:1 with stored scoring factors). */
  whyThisWorks: string[];
  /** Phase 3: server-computed cap snapshot for the swap sheet. */
  cap: CapView | null;
  /** Phase 3: true when a swap can be undone (pre-swap snapshot exists). */
  hasUndo: boolean;
  /** Phase 4: slots this outfit is honestly missing (engine-persisted; e.g.
   *  ["Shoes"]). Empty = complete. The engine never fabricates a replacement. */
  missingSlots: string[];
  /** Phase 4: engine-persisted honest reason code for the partial state (locked
   *  decision 11). Drives the user-facing copy — never a hardcoded claim. */
  partialReason?: string | null;
  /** Phase 4B: stored engine confidence (0-1) for this pick, or null if
   *  unavailable. Never displayed as a raw number — used only to gate the
   *  honest low-confidence caption below Why This Works. */
  confidence: number | null;
  /** Phase 4B: true when the engine's confidence fell below the dual-pick
   *  threshold at generation time — surfaced as one honest, calm line. */
  isDualPick: boolean;
}

type RepeatStatus = "no_history" | "repeat_safe" | "one_recent" | "multiple_recent";

const RECENT_DAYS = 7;

/**
 * Honest, reason-specific partial copy (locked decision 11). We only claim "none
 * available" when the engine diagnostics prove zero owned footwear. Every other
 * case names the real reason (in wash / unavailable / archived / still tagging /
 * occasion mismatch) without exposing raw diagnostics.
 */
function partialCopy(reason: string | null | undefined, slots: string[]): string {
  const slot = (slots.join(" & ").toLowerCase() || "shoes");
  switch (reason) {
    case "no_footwear_in_wardrobe":
      return "You have no shoes saved yet — add a pair to finish this look.";
    case "footwear_in_wash":
      return "Your shoes are in the wash — pick another pair to finish this look.";
    case "footwear_unavailable":
      return "Your shoes are marked unavailable right now — pick another pair to finish.";
    case "footwear_archived":
      return "Those shoes are archived — restore or add a pair to finish this look.";
    case "incomplete_tagging":
      return "Still analysing your shoes — try again shortly, or pick your own for now.";
    case "occasion_or_formality_mismatch":
      return `No ${slot} match today's occasion — pick your own to finish this look.`;
    case "no_available_footwear":
      return "Your shoes are all unavailable right now — pick another pair to finish.";
    default:
      return `Add ${slot} to finish this look.`;
  }
}

function daysSince(d: string | null): number | null {
  if (!d) return null;
  const ms = Date.now() - Date.parse(d);
  return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000);
}
function wornRecently(d: string | null): boolean {
  const n = daysSince(d);
  return n !== null && n <= RECENT_DAYS;
}
function itemDetailText(d: string | null): string {
  if (!d) return "No wear history yet";
  return wornRecently(d) ? "Worn recently" : "Not worn recently";
}

export function DailyDropCard({
  drop,
  postwearEnabled = true,
}: {
  drop: DailyDropView;
  postwearEnabled?: boolean;
}) {
  const router = useRouter();
  const [worn, setWorn] = useState(drop.status === "worn");

  // Wore It step 1: confirmation (Phase 4C). No write happens until the
  // user taps the primary action inside the sheet — see confirmWorn().
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<WearConfirmState>("idle");

  // Wore It step 2: post-wear laundry sheet (Phase 2) — opens right after a
  // confirmed wear. postWearError surfaces a failed persist attempt without
  // closing the sheet (see persistPostWear()).
  const [postWearOpen, setPostWearOpen] = useState(false);
  const [postWearSaving, setPostWearSaving] = useState(false);
  const [postWearError, setPostWearError] = useState<string | null>(null);

  // Swap sheet (Phase 3) — SLOT-FIRST single-item swap only.
  const [swapOpen, setSwapOpen] = useState(false);
  // "Another option" is a SEPARATE full-outfit action with its own loading state
  // and message — it never opens the swap sheet or calls the single-slot route.
  const [optionBusy, setOptionBusy] = useState(false);
  const [optionMsg, setOptionMsg] = useState<string | null>(null);

  // ---- Trust signals (derived from the selected items' wear history) ----
  // Kept for telemetry continuity (daily_drop_trust_signals_viewed); no
  // longer rendered as a standalone paragraph — Why This Works (engine-
  // grounded) and the honest missing-slot badge below cover explanation now.
  const withHistory = drop.items.filter((i) => i.lastWornAt);
  const recentCount = drop.items.filter((i) => wornRecently(i.lastWornAt)).length;
  const repeatStatus: RepeatStatus =
    withHistory.length === 0
      ? "no_history"
      : recentCount === 0
        ? "repeat_safe"
        : recentCount === 1
          ? "one_recent"
          : "multiple_recent";

  // Phase 4B state C (Partial outfit): the engine never fabricates a missing
  // piece. `missingSlots` is server-derived from which canonical slots are
  // actually present in `drop.items` — currently only ever ["Shoes"].
  const missingSlots = drop.missingSlots ?? [];
  const isPartial = missingSlots.length > 0;

  // While either sheet is open, the primary/secondary actions underneath are
  // disabled — defense in depth (the sheet already covers the screen).
  const busy = confirmOpen || postWearOpen;

  useEffect(() => {
    track("daily_drop_viewed", {
      status: drop.status === "failed" ? "failed" : "prepared",
      item_count: drop.items.length,
      weather_available: Boolean(drop.weatherSummary),
    });
    track("daily_drop_trust_signals_viewed", {
      repeat_status: repeatStatus,
      selected_item_count: drop.items.length,
      has_weather_summary: Boolean(drop.weatherSummary),
      has_daily_insight: Boolean(drop.dailyInsight),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drop.id, drop.status, drop.items.length, drop.weatherSummary, drop.dailyInsight, repeatStatus]);

  // "Wear this" — opens the confirmation sheet ONLY. No write happens here;
  // see confirmWorn() for the single atomic RPC call (Phase 4C fixes the old
  // unguarded client-side write that used to live in this handler).
  function wearThis() {
    if (busy || worn) return;
    track("wear_this_tapped", { item_count: drop.itemIds.length, is_partial: isPartial });
    setConfirmState("idle");
    setConfirmOpen(true);
  }

  // Single primary action for the confirm sheet, for every state:
  //  - idle/error  -> POST /api/daily-drop/wear (confirm / retry) -> RPC
  //  - stale       -> refresh Today (no write attempted)
  //  - already     -> proceed to the laundry step (duplicate-safe, no write)
  // Correctness for concurrent taps comes from the database transaction
  // (migration 0023), not from this client-side branching — this is purely
  // a UI convenience layer over an already-safe server contract.
  async function confirmWorn() {
    if (confirmState === "stale") {
      setConfirmOpen(false);
      router.refresh();
      return;
    }
    if (confirmState === "already") {
      setConfirmOpen(false);
      if (postwearEnabled && drop.items.length > 0) {
        setPostWearError(null);
        setPostWearOpen(true);
      } else {
        router.refresh();
      }
      return;
    }

    setConfirmState("submitting");
    try {
      const res = await fetch("/api/daily-drop/wear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: drop.id, itemIds: drop.itemIds }),
      });
      const data: { status?: string; reason?: string } = await res.json().catch(() => ({}));

      if (data.status === "ok" || data.status === "already") {
        track("wear_confirmed", { item_count: drop.itemIds.length, already: data.status === "already" });
        setWorn(true);
        if (data.status === "ok") fetch("/api/streaks/checkin", { method: "POST" }).catch(() => {});
        if (data.status === "already") {
          // Duplicate-safe, honest result — required state 6. Let the user
          // see it, then proceed on their own next tap (routed above).
          setConfirmState("already");
          return;
        }
        setConfirmOpen(false);
        if (postwearEnabled && drop.items.length > 0) {
          setPostWearError(null);
          setPostWearOpen(true);
        } else {
          router.refresh();
        }
        return;
      }

      if (data.status === "stale") {
        track("postwear_failed", { stage: "confirm", reason: "stale" });
        setConfirmState("stale");
        return;
      }

      track("postwear_failed", { stage: "confirm", reason: data.reason ?? "error" });
      setConfirmState("error");
    } catch {
      track("postwear_failed", { stage: "confirm", reason: "network" });
      setConfirmState("error");
    }
  }

  function dismissConfirm() {
    if (confirmState === "submitting") return;
    setConfirmOpen(false);
  }

  // Laundry persistence is a SEPARATE, optional, later transaction from wear
  // confirmation — wear is already recorded by the time this runs, and a
  // laundry failure must NEVER roll that back. It must also never be
  // reported as success: the response status is checked (not just
  // fire-and-forget), and on failure the sheet STAYS OPEN with the user's
  // choices intact (they live in PostWearSheet's own state, untouched here)
  // plus a visible error — the same Done/Ask-me-less taps double as Retry.
  // The sheet only closes + refreshes on a genuine success, or when the user
  // explicitly dismisses (Skip for now / the sheet's own close control).
  async function persistPostWear(dispositions: Record<string, Disposition>, opts?: { askMeLess?: boolean }) {
    setPostWearSaving(true);
    setPostWearError(null);
    try {
      const res = await fetch("/api/wardrobe/laundry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "postwear",
          dispositions: drop.items.map((it) => ({ itemId: it.id, to: dispositions[it.id] ?? "wardrobe" })),
        }),
      });
      const json: { status?: string } = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== "ok") {
        throw new Error("laundry_persist_failed");
      }

      const washed = Object.values(dispositions).filter((d) => d === "wash").length;
      track("postwear_completed", {
        item_count: drop.items.length,
        washed_count: washed,
        wardrobe_count: drop.items.length - washed,
        via: opts?.askMeLess ? "ask_me_less" : "done",
      });
      if (washed > 0) track("laundry_marked", { item_count: washed, source: "postwear" });

      if (opts?.askMeLess) {
        // A preference update, not part of the disposition result already
        // saved above — best-effort, matching its existing Phase 2 contract.
        // A failure here doesn't reopen the disposition step.
        const askRes = await fetch("/api/wardrobe/laundry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ask_me_less" }),
        });
        if (!askRes.ok) track("postwear_failed", { stage: "ask_me_less", reason: "network" });
      }

      setPostWearSaving(false);
      setPostWearOpen(false);
      router.refresh();
    } catch {
      track("postwear_failed", { stage: "laundry", reason: "network" });
      setPostWearSaving(false);
      setPostWearError("Couldn't save your laundry choices. Please try again.");
      // Sheet stays open (postWearOpen untouched); this branch does NOT
      // navigate away or reload the page — wear confirmation already
      // succeeded and needs nothing further to be reflected. The user's
      // chosen dispositions live in PostWearSheet's own state and are
      // unaffected by this failure.
    }
  }

  function dismissPostWear() {
    track("postwear_sheet_dismissed", { item_count: drop.items.length });
    setPostWearOpen(false);
    setPostWearError(null);
    router.refresh();
  }

  // "Swap one thing" — opens the slot-first swap sheet. Nothing else.
  // Canonical open event: swap_opened (single fire). Do not reintroduce a
  // second card-level "swap started" event, and do not let SwapSheet's own
  // mount effect emit a second "opened" event — see SwapSheet.tsx and
  // CHANGELOG.md (Phase 4B telemetry-dedup fix) for the retired names.
  function openSwap() {
    setSwapOpen(true);
    track("swap_opened", { selected_item_count: drop.items.length });
  }

  // "Another option" — a completely separate handler. Calls ONLY the full
  // alternative route, with its own loading state + cap message. Never opens the
  // swap sheet and never calls the single-slot swap route. Canonical intent
  // event: another_option_tapped (single fire; the old duplicate "clicked"
  // event was retired — see CHANGELOG.md, Phase 4B telemetry-dedup fix).
  async function anotherOption() {
    setOptionBusy(true);
    setOptionMsg(null);
    track("another_option_tapped", { selected_item_count: drop.items.length });
    try {
      const res = await fetch("/api/daily-drop/another-option", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: drop.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === "updated" || data.status === "stale") { router.refresh(); return; }
      if (data.status === "cap_reached") { setOptionMsg(data.message ?? "You're at today's option limit for now."); return; }
      if (data.status === "not_enough_items") { setOptionMsg("Add a few more available clothes to create another strong option."); return; }
      if (data.status === "disabled") { setOptionMsg(data.message ?? "Options are taking a short break — back soon."); return; }
      setOptionMsg("We couldn't create another option right now. Please try again.");
    } catch {
      setOptionMsg("We couldn't create another option right now. Please try again.");
    } finally {
      setOptionBusy(false);
    }
  }

  const thumbs = drop.items.map((i) => i.image).filter((u): u is string => Boolean(u));

  return (
    <>
    <Card variant="stack" className="mt-5 overflow-hidden p-5">
      <div className="mb-3">
        <p className="ww-eyebrow text-plum">Today&apos;s Drop</p>
        <h2 className="mt-1 font-serif text-[1.35rem] leading-tight tracking-tight text-charcoal">
          Today&apos;s outfit is ready.
        </h2>
      </div>

      {/* Private signed thumbnails, or a calm placeholder */}
      <div className="mb-4 h-40 overflow-hidden rounded-ww-md border border-hairline bg-gradient-to-b from-bone to-stone">
        {thumbs.length > 0 ? (
          <div className="flex h-full gap-1">
            {thumbs.slice(0, 4).map((src, i) => (
              <div key={i} className="h-full flex-1 overflow-hidden bg-stone">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-full place-items-center text-mist">
            <Icon.Hanger className="h-7 w-7" />
          </div>
        )}
      </div>

      {/* Phase 4B state C: honest partial-outfit badge — never fabricates the
          missing piece, always names it plainly. Amber tone (never red) per
          the design system's low-confidence convention. */}
      {isPartial && (
        <div className="mb-3 flex items-start gap-2 rounded-ww-md border border-champagne/30 bg-champagne/[0.08] px-3 py-2.5">
          <Icon.Hanger className="mt-0.5 h-3.5 w-3.5 shrink-0 text-champagne" />
          <p className="text-xs leading-snug text-charcoal">
            {partialCopy(drop.partialReason, missingSlots)}
          </p>
        </div>
      )}

      {/* Item list — each with a subtle wear-history detail */}
      <ul className="space-y-1.5">
        {drop.items.map((it) => (
          <li key={it.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="text-charcoal">{it.label}</span>
              <span className="block text-[11px] text-mist">{itemDetailText(it.lastWornAt)}</span>
            </span>
            {it.sub && <span className="shrink-0 text-xs text-graphite">{it.sub}</span>}
          </li>
        ))}
      </ul>
    </Card>

    {/* Primary + secondary actions (Phase 4A shell primitive, in normal flow —
        not pinned — so it sits between the hero and Why This Works per the
        Phase 4B hierarchy). */}
    <ActionRow sticky={false} className="mt-4 flex-col items-stretch gap-2 bg-transparent px-0 py-0 backdrop-blur-none">
      <Button onClick={wearThis} size="full" disabled={busy || worn} variant={worn ? "secondary" : "default"}>
        {worn ? (<><Icon.Check className="h-4 w-4" /> Worn today</>) : "Wear this"}
      </Button>

      {/* Secondary actions — two SEPARATE buttons, two SEPARATE handlers. */}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={openSwap} disabled={busy || worn || optionBusy}>
          <Icon.Shuffle className="h-3.5 w-3.5" /> Swap one thing
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={anotherOption} disabled={busy || worn || optionBusy}>
          <Icon.Sparkle className="h-3.5 w-3.5" /> {optionBusy ? "Finding another…" : "Another option"}
        </Button>
      </div>
      {optionMsg && <p className="text-center text-xs text-graphite">{optionMsg}</p>}

      {/* Investment vault (Module C): save today's look to the Lookbook */}
      <div className="flex justify-center">
        <SaveLookButton itemIds={drop.itemIds} title="Today's drop" recommendationId={drop.id} />
      </div>
    </ActionRow>

    {/* Why This Works — collapsible, rendered 1:1 from stored scoring factors */}
    <WhyThisWorks lines={drop.whyThisWorks} source="today" />
    {drop.isDualPick && (
      <p className="mt-1.5 px-1 text-xs leading-snug text-graphite">
        This is a close call between a couple of good options — swap anything that&apos;s not quite right.
      </p>
    )}

    {/* One compact supporting insight below the hero (Phase 4B hierarchy #7) */}
    {drop.dailyInsight && (
      <div className="mt-3 flex items-start gap-2 rounded-ww-md border border-lavender/40 bg-lavender/[0.10] px-3 py-2.5">
        <Icon.Sparkle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-plum" />
        <p className="text-xs leading-snug text-charcoal">{drop.dailyInsight}</p>
      </div>
    )}

    <SwapSheet
      open={swapOpen}
      onClose={() => setSwapOpen(false)}
      recommendationId={drop.id}
      items={drop.items.map((it) => ({ id: it.id, label: it.label, image: it.image, category: it.category ?? null, slot: it.slot ?? null }))}
      cap={drop.cap}
      onChanged={() => router.refresh()}
    />

    <WearConfirmSheet
      open={confirmOpen}
      items={drop.items.map((it) => ({ id: it.id, label: it.label, image: it.image }))}
      state={confirmState}
      onPrimary={confirmWorn}
      onDismiss={dismissConfirm}
    />

    <PostWearSheet
      open={postWearOpen}
      saving={postWearSaving}
      error={postWearError}
      items={drop.items.map((it) => ({ id: it.id, label: it.label, image: it.image, category: it.category ?? null }))}
      onDone={(d) => persistPostWear(d)}
      onAskMeLess={(d) => persistPostWear(d, { askMeLess: true })}
      onDismiss={dismissPostWear}
    />
    </>
  );
}
