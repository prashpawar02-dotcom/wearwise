// WearWise — Engine v2 public surface (Phase 1).
export * from "@/lib/engine/types";
export { recommendOutfits } from "@/lib/engine/recommend";
export {
  DEFAULT_CONFIG, DEFAULT_OCCASION_PROFILES, DEFAULT_ETHNIC_RULES,
  EMPTY_PREFERENCES, profileForOccasion,
} from "@/lib/engine/config";
export { eligiblePool, candidateRejection } from "@/lib/engine/filters";
export { scoreOutfit } from "@/lib/engine/scoring";
export { buildCandidates } from "@/lib/engine/templates";
export {
  patternClashGuard, dupattaLayerGuard, shoeCompatibilityGuard, accessoryRelevanceGuard,
} from "@/lib/engine/guards";
export { engineRole } from "@/lib/engine/classify";
export { loadEngineContext } from "@/lib/engine/loadContext";
export {
  swapSlot, slotLabel, isCompletionSlot, lockedItems,
  lockAndReplaceCandidates, noCandidateMessage,
  moodSwap, MOODS, MOOD_LABEL,
} from "@/lib/engine/swap";
export type { SwapSlot, SwapCandidate, LockReplaceResult, Mood, MoodSwapResult } from "@/lib/engine/swap";
