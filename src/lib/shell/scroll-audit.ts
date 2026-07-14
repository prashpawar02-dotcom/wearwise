// =====================================================================
// WearWise — Scroll budget audit (Phase 4A, handbook §3.2 One-Screen Rule)
// Pure module: no React/DOM here. `ScrollAudit.tsx` (dev-only component)
// wires this threshold logic to a ResizeObserver; this file holds only the
// testable math so it can compile under tsconfig.test.json.
// =====================================================================

/**
 * Default content-height budget: a screen's content may be at most 1.3x
 * the viewport height before the One-Screen Rule is considered violated.
 */
export const SCROLL_BUDGET_FACTOR = 1.3;

/**
 * True when `contentHeight` exceeds the scroll budget for `viewportHeight`.
 * Strictly greater-than — content exactly at the budget (== factor x
 * viewport) passes.
 */
export function exceedsViewport(
  contentHeight: number,
  viewportHeight: number,
  factor: number = SCROLL_BUDGET_FACTOR
): boolean {
  return contentHeight > viewportHeight * factor;
}
