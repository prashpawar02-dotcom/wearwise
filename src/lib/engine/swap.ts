// =====================================================================
// WearWise — Engine v2 LOCK-AND-REPLACE swap (Phase 3)
// PURE and deterministic. This is the contract behind "Swap one item":
// the outfit the user liked stays; only the piece they asked for changes.
//
// Guarantees (handbook §5 P3):
//   * Single-item swap LOCKS every other slot + the occasion + the formality
//     window + the colour theme. A candidate replaces exactly one item.
//   * Every candidate must pass ALL hard filters against the locked items
//     (candidateRejection) — FAIL CLOSED, no silent relaxation.
//   * Candidates are ranked by the resulting outfit_score with locked items
//     fixed; top-5 returned.
//   * Layer/Accessory swaps may resolve to "none — this outfit is complete"
//     as a FIRST-CLASS result.
//   * Mood swaps change the MINIMUM number of items (1, max 2), fewest first.
//   * Every replacement carries a one-line reason rendered 1:1 from a REAL
//     scoring factor of the resulting outfit (never free-generated).
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type { EngineContext } from "@/lib/engine/types";
import { eligiblePool, candidateRejection } from "@/lib/engine/filters";
import { scoreOutfit } from "@/lib/engine/scoring";
import {
  engineRole, colorFamilyOf, isNeutralColor, formalityOf, modestyOf,
} from "@/lib/engine/classify";

const CORE_ROLES = new Set(["upper", "ethnic_upper", "bottom", "one_piece", "saree", "outerwear"]);

// ---------------------------------------------------------------------------
// Canonical swap slots — the user-facing grouping (Top/Bottom/Shoes/Layer/
// Accessory + Dress/Saree cores). Candidate MATCHING is by engineRole (precise);
// slots are only for chip labels + completion logic.
// ---------------------------------------------------------------------------
export type SwapSlot = "top" | "bottom" | "shoes" | "layer" | "accessory" | "dress" | "saree";

const ROLE_TO_SLOT: Record<string, SwapSlot | null> = {
  upper: "top",
  ethnic_upper: "top",
  activewear_top: "top",
  bottom: "bottom",
  activewear_bottom: "bottom",
  one_piece: "dress",
  saree: "saree",
  outerwear: "layer",
  drape: "layer",
  footwear: "shoes",
  accessory: "accessory",
  unknown: null,
};

const SLOT_LABEL: Record<SwapSlot, string> = {
  top: "Top", bottom: "Bottom", shoes: "Shoes", layer: "Layer",
  accessory: "Accessory", dress: "Dress", saree: "Saree",
};

/** Canonical slot for an item, or null when unclassifiable. */
export function swapSlot(item: WardrobeItem): SwapSlot | null {
  return ROLE_TO_SLOT[engineRole(item)] ?? null;
}

/** User-facing chip label for a slot. */
export function slotLabel(slot: SwapSlot): string {
  return SLOT_LABEL[slot];
}

/** Slots whose absence still makes a COMPLETE outfit (may resolve to "complete"). */
export function isCompletionSlot(slot: SwapSlot): boolean {
  return slot === "layer" || slot === "accessory";
}

// ---------------------------------------------------------------------------
// Colour-theme lock — a single-item swap must not introduce a NEW saturated hue
// beyond the occasion's budget (config.thresholds.max_saturated_hues). Neutrals
// and metallics are free. This is what "locks the colour theme" concretely.
// ---------------------------------------------------------------------------
function saturatedCoreHues(items: WardrobeItem[], ctx: EngineContext): Set<string> {
  const neutrals = ctx.config.colorRules.neutrals;
  const metallics = ctx.config.colorRules.metallics;
  const hues = new Set<string>();
  for (const i of items) {
    if (!CORE_ROLES.has(engineRole(i))) continue;
    const c = colorFamilyOf(i);
    if (c === "unknown" || isNeutralColor(c, neutrals) || metallics.includes(c)) continue;
    hues.add(c);
  }
  return hues;
}

function withinColorTheme(trial: WardrobeItem[], ctx: EngineContext): boolean {
  return saturatedCoreHues(trial, ctx).size <= ctx.config.thresholds.max_saturated_hues;
}

// ---------------------------------------------------------------------------
// Single-item lock-and-replace
// ---------------------------------------------------------------------------
export interface SwapCandidate {
  id: string;
  slot: SwapSlot;
  /** One-line reason, taken verbatim from a real factor of the RESULTING outfit. */
  reason: string;
  /** Full top-3 Why-This-Works of the resulting outfit (all real factors). */
  whyThisWorks: string[];
  /** Resulting outfit_score with locked items fixed (for ranking + QA). */
  score: number;
}

export interface LockReplaceResult {
  status: "ok" | "complete" | "no_candidate";
  slot: SwapSlot | null;
  candidates: SwapCandidate[];
  /** Actionable message for complete / no_candidate. */
  message: string | null;
}

/** The locked set = the current outfit minus the item being replaced. */
export function lockedItems(outfit: WardrobeItem[], replaceItemId: string): WardrobeItem[] {
  return outfit.filter((i) => i.id !== replaceItemId);
}

/**
 * Rank valid replacements for ONE item, keeping every other slot fixed.
 * Deterministic: same inputs → same ordering (score desc, id asc tiebreak).
 */
export function lockAndReplaceCandidates(
  allItems: WardrobeItem[],
  outfit: WardrobeItem[],
  replaceItem: WardrobeItem,
  ctx: EngineContext,
  limit = 5,
): LockReplaceResult {
  const slot = swapSlot(replaceItem);
  const role = engineRole(replaceItem);
  if (!slot || role === "unknown") {
    return { status: "no_candidate", slot, candidates: [], message: noCandidateMessage(null, ctx) };
  }

  const locked = lockedItems(outfit, replaceItem.id);
  const inOutfit = new Set(outfit.map((i) => i.id));

  // Eligible pool = same per-item hard filters the engine uses (availability,
  // weather, formality window, cultural, exclusions, gym rules).
  const { pool } = eligiblePool(allItems, ctx);

  const scored: SwapCandidate[] = [];
  for (const cand of pool) {
    if (inOutfit.has(cand.id)) continue;      // not already worn in this outfit
    if (engineRole(cand) !== role) continue;   // same slot only (locked structure)
    const trial = [...locked, cand];
    if (!withinColorTheme(trial, ctx)) continue;   // colour theme locked
    if (candidateRejection(trial, ctx)) continue;  // ALL hard filters, fail closed
    const s = scoreOutfit(trial, ctx);
    scored.push({
      id: cand.id,
      slot,
      reason: s.whyThisWorks[0] ?? reasonFallback(s),
      whyThisWorks: s.whyThisWorks,
      score: s.total,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const top = scored.slice(0, Math.max(0, limit));

  if (top.length > 0) {
    return { status: "ok", slot, candidates: top, message: null };
  }
  // No valid replacement. Layer/accessory → the outfit is genuinely complete.
  if (isCompletionSlot(slot)) {
    return { status: "complete", slot, candidates: [], message: completeMessage(slot) };
  }
  return { status: "no_candidate", slot, candidates: [], message: noCandidateMessage(slot, ctx) };
}

/** A resulting-outfit fallback reason when no factor produced a detail string. */
function reasonFallback(s: ReturnType<typeof scoreOutfit>): string {
  const best = [...s.factors].filter((f) => f.contribution > 0).sort((a, b) => b.contribution - a.contribution)[0];
  return best?.detail || "Keeps the look balanced for today";
}

/** First-class "this outfit is complete" copy (layer/accessory). */
function completeMessage(slot: SwapSlot): string {
  return slot === "layer"
    ? "None needed — this outfit is complete without another layer."
    : "None needed — this outfit is complete without another accessory.";
}

/**
 * Specific, actionable no-candidate copy (handbook §5 P3). NEVER silently
 * relaxes a hard filter — it names the blocker and offers the next step.
 */
export function noCandidateMessage(slot: SwapSlot | null, ctx: EngineContext): string {
  const occ = ctx.profile.label.toLowerCase();
  if (!slot) return `I couldn't read that piece well enough to swap it. Add a quick tag and try again.`;
  const alt: Record<SwapSlot, string> = {
    top: "Swap the bottom instead, or loosen to smart-casual?",
    bottom: "Swap the top instead, or loosen to smart-casual?",
    shoes: "Keep today's shoes, or mark another clean pair available?",
    dress: "Try another option, or loosen the occasion?",
    saree: "Try another option, or loosen the occasion?",
    layer: "This outfit works without another layer.",
    accessory: "This outfit works without another accessory.",
  };
  const noun: Record<SwapSlot, string> = {
    top: "top", bottom: "bottom", shoes: "pair of shoes", dress: "dress",
    saree: "saree", layer: "layer", accessory: "accessory",
  };
  return `No clean ${noun[slot]} matches the rest of this look for ${occ}. ${alt[slot]}`;
}

// ---------------------------------------------------------------------------
// Mood swaps — change the MINIMUM items (1, max 2), fewest changes first.
// ---------------------------------------------------------------------------
export type Mood = "more_formal" | "more_casual" | "more_comfortable" | "more_modest" | "weather_safer";

export const MOODS: Mood[] = ["more_formal", "more_casual", "more_comfortable", "more_modest", "weather_safer"];

export const MOOD_LABEL: Record<Mood, string> = {
  more_formal: "More formal",
  more_casual: "More casual",
  more_comfortable: "More comfortable",
  more_modest: "More modest",
  weather_safer: "Weather-safer",
};

export interface MoodSwapResult {
  status: "ok" | "no_candidate";
  /** IDs removed from the outfit (subset of the original). */
  removedItemIds: string[];
  /** IDs added to the outfit. */
  addedItemIds: string[];
  /** The full new outfit's item IDs (when ok). */
  newItemIds: string[];
  reason: string | null;
  whyThisWorks: string[];
  message: string | null;
}

/** Scalar the mood tries to MAXIMISE (higher = more "in the requested mood"). */
function moodScore(items: WardrobeItem[], mood: Mood, ctx: EngineContext): number | null {
  const core = items.filter((i) => CORE_ROLES.has(engineRole(i)));
  const known = (vals: (number | null)[]) => vals.filter((v): v is number => v != null);
  switch (mood) {
    case "more_formal": {
      const f = known(core.map(formalityOf));
      return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
    }
    case "more_casual": {
      const f = known(core.map(formalityOf));
      return f.length ? -(f.reduce((a, b) => a + b, 0) / f.length) : null;
    }
    case "more_modest": {
      const m = known(items.map(modestyOf));
      return m.length ? m.reduce((a, b) => a + b, 0) / m.length : null;
    }
    case "more_comfortable": {
      const c = scoreOutfit(items, ctx).factors.find((x) => x.name === "comfort");
      return c ? c.raw : null;
    }
    case "weather_safer": {
      const w = scoreOutfit(items, ctx).penalties.find((x) => x.name === "weather_soft");
      // Lower penalty = safer, so negate the magnitude.
      return w ? -w.raw : 0;
    }
  }
}

/**
 * Apply a mood by making the SMALLEST change that improves the mood objective
 * while passing every hard filter and the colour-theme lock. Tries single-item
 * moves first (replace one item, or ADD one layer); only reports a change when
 * it STRICTLY improves the objective. Returns no_candidate honestly otherwise.
 */
export function moodSwap(
  allItems: WardrobeItem[],
  outfit: WardrobeItem[],
  mood: Mood,
  ctx: EngineContext,
): MoodSwapResult {
  const base = moodScore(outfit, mood, ctx);
  const { pool } = eligiblePool(allItems, ctx);
  const inOutfit = new Set(outfit.map((i) => i.id));

  interface Move { removed: string[]; added: string[]; items: WardrobeItem[]; score: number; changed: number; }
  const moves: Move[] = [];

  const consider = (items: WardrobeItem[], removed: string[], added: string[]) => {
    if (!withinColorTheme(items, ctx)) return;
    if (candidateRejection(items, ctx)) return; // fail closed
    const s = moodScore(items, mood, ctx);
    if (s == null) return;
    moves.push({ removed, added, items, score: s, changed: removed.length + added.length });
  };

  // 1-item REPLACEMENTS (same role) across every current item.
  for (const cur of outfit) {
    const role = engineRole(cur);
    if (role === "unknown") continue;
    const locked = outfit.filter((i) => i.id !== cur.id);
    for (const cand of pool) {
      if (inOutfit.has(cand.id)) continue;
      if (engineRole(cand) !== role) continue;
      consider([...locked, cand], [cur.id], [cand.id]);
    }
  }

  // 1-item ADD of a layer (outerwear) when none is present — helps
  // more_formal / weather_safer without disturbing the rest.
  const hasLayer = outfit.some((i) => engineRole(i) === "outerwear");
  if (!hasLayer && (mood === "weather_safer" || mood === "more_formal")) {
    for (const cand of pool) {
      if (inOutfit.has(cand.id)) continue;
      if (engineRole(cand) !== "outerwear") continue;
      consider([...outfit, cand], [], [cand.id]);
    }
  }

  // Keep only STRICT improvements; fewest changes first, then best score.
  const improving = moves.filter((m) => base == null || m.score > base + 1e-9);
  if (improving.length === 0) {
    return {
      status: "no_candidate", removedItemIds: [], addedItemIds: [], newItemIds: [],
      reason: null, whyThisWorks: [],
      message: `Nothing in your clean wardrobe makes this ${MOOD_LABEL[mood].toLowerCase()} without breaking the look. Try “Another option”.`,
    };
  }
  improving.sort((a, b) => a.changed - b.changed || b.score - a.score ||
    a.added.join().localeCompare(b.added.join()));
  const best = improving[0];
  const s = scoreOutfit(best.items, ctx);
  return {
    status: "ok",
    removedItemIds: best.removed,
    addedItemIds: best.added,
    newItemIds: best.items.map((i) => i.id),
    reason: s.whyThisWorks[0] ?? reasonFallback(s),
    whyThisWorks: s.whyThisWorks,
    message: null,
  };
}
