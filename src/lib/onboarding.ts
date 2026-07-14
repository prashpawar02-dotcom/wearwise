// =====================================================================
// WearWise — Onboarding v2 (Phase 4D). Pure logic only — no Supabase
// import, so this is safe under tsconfig.test.json (unit-testable without
// a DB) and importable from both server and client components.
//
// Wardrobe-readiness reuses the EXACT same classification helpers already
// proven in src/app/(app)/occasion/new/page.tsx (roleForItem, isWearableItem)
// and the exact minimum-items threshold already proven in
// src/lib/daily-drop.ts (MIN_OUTFIT_ITEMS = 2) — deliberately not a new,
// invented threshold. "Ready for Today" here means the same thing
// ensureTodayDrop() means by a buildable outfit: at least one upper/
// one_piece, at least one bottom (unless the upper is a one_piece), and at
// least 2 wearable items total. Footwear is tracked and shown, but never
// blocks readiness — matches ensureTodayDrop()'s `shoesAvailable` (never a
// hard gate) and the explicit product rule "Do not block the user
// indefinitely for missing footwear."
// =====================================================================
import { roleForItem, type RoleClassifiableItem } from "@/lib/outfitValidation";
import { isWearableItem } from "@/lib/wardrobe";
import type { OnboardingState, OnboardingStep } from "@/lib/types";

// Matches src/lib/daily-drop.ts's MIN_OUTFIT_ITEMS exactly (kept as a
// separate local constant, not an import, because daily-drop.ts is a
// server-only module with a Supabase import chain — importing it here
// would break this file's pure/test-safe status for no real benefit; the
// two values must simply be kept equal by hand, and are documented as such
// in both places).
const MIN_OUTFIT_ITEMS = 2;

export type OnboardingWardrobeItem = RoleClassifiableItem & { availability_status?: string | null };

export interface WardrobeReadiness {
  tops: boolean;
  bottoms: boolean;
  shoes: boolean;
  wearableCount: number;
  /** True when the SAME rule ensureTodayDrop() uses would produce a buildable outfit. */
  ready: boolean;
}

/** Live-computed from current wardrobe rows — never persisted, never stale. */
export function computeWardrobeReadiness(items: OnboardingWardrobeItem[]): WardrobeReadiness {
  const wearable = items.filter(isWearableItem);
  const tops = wearable.some((i) => {
    const r = roleForItem(i);
    return r === "upper" || r === "one_piece";
  });
  const bottoms = wearable.some((i) => roleForItem(i) === "bottom");
  const shoes = wearable.some((i) => roleForItem(i) === "footwear");
  const onePiece = wearable.some((i) => roleForItem(i) === "one_piece");
  const hasCore = onePiece || (tops && bottoms);
  const ready = hasCore && wearable.length >= MIN_OUTFIT_ITEMS;
  return { tops, bottoms, shoes, wearableCount: wearable.length, ready };
}

const STEP_ORDER: readonly OnboardingStep[] = ["welcome", "context", "style", "wardrobe", "ready", "completed"];

/** True when `candidate` is at or before the furthest step actually reached. */
export function hasReached(furthest: OnboardingStep | null | undefined, candidate: OnboardingStep): boolean {
  if (!furthest) return false;
  return STEP_ORDER.indexOf(furthest) >= STEP_ORDER.indexOf(candidate);
}

/** Never regresses: returns whichever of the two steps is further along. */
export function furthestOf(a: OnboardingStep | null | undefined, b: OnboardingStep): OnboardingStep {
  if (!a) return b;
  return STEP_ORDER.indexOf(b) > STEP_ORDER.indexOf(a) ? b : a;
}

/**
 * Computes the six-value onboarding state. `onboarded`/`onboarding_step`
 * are the only persisted inputs; wardrobe readiness is always live. This
 * mirrors migration 0025's header exactly — do not add new persisted
 * fields here without updating that migration's reasoning.
 */
export function computeOnboardingState(opts: {
  onboarded: boolean;
  onboardingStep: OnboardingStep | null | undefined;
  wardrobeReady: boolean;
}): OnboardingState {
  const { onboarded, onboardingStep, wardrobeReady } = opts;
  if (onboarded) return "completed";
  if (!onboardingStep || onboardingStep === "welcome") return "new";
  if (onboardingStep === "context" || onboardingStep === "style") return "in_progress";
  // "wardrobe" or "ready" reached — readiness is live, not the stored step.
  return wardrobeReady ? "ready" : "wardrobe_incomplete";
}
