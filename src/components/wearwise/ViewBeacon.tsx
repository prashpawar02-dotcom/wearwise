"use client";

import { useEffect } from "react";
import { track, type AnalyticsProps } from "@/lib/analytics";

/**
 * Fires a single PostHog "screen viewed" event on mount — for use inside
 * Server Component branches (like the Today states in dashboard/page.tsx)
 * where telemetry can't be an inline useEffect. The effect depends ONLY on
 * `event`, which is a stable literal per call site, so a Server Component
 * re-render that keeps the same call site mounted (e.g. `router.refresh()`
 * after "Wear this", a swap, or a retry) does NOT re-fire it — React
 * preserves this component's identity at that tree position and the
 * dependency array is unchanged. No sessionStorage/localStorage/global
 * dedup is used or needed for this — component identity + the `[event]`
 * dependency array is the whole mechanism (Phase 4B decision: keep this
 * simple; do not add cross-render dedup storage).
 *
 * Two different usage shapes rely on this the same way, but mean different
 * things — read the call site's context before assuming semantics:
 *
 * - `today_viewed` (dashboard/page.tsx) is mounted UNCONDITIONALLY at a
 *   fixed tree position, with a event name that never changes across
 *   states. Because of that, it fires EXACTLY ONCE per Today route mount
 *   (first navigation / hard reload) and intentionally does NOT re-fire on
 *   a later `router.refresh()` or a state change that happens without a
 *   fresh mount — its identity never changes, so the effect never re-runs.
 *   Its `props` (e.g. `state`, `item_count`) describe the INITIAL rendered state for that route visit.
 *   They are not kept in sync with later
 *   in-place state changes (e.g. constrained -> complete after a retry
 *   without leaving the page). This is intentional, not a bug — do not
 *   "fix" it by adding `state` to the dependency array or by re-keying the
 *   component, and do not build production acceptance evidence on the
 *   assumption that `today_viewed` reflects live state.
 * - `today_constrained_viewed` (dashboard/page.tsx) is mounted only INSIDE
 *   specific conditional branches (needs-wardrobe / failed). A genuine
 *   state transition into or out of a constrained branch swaps which
 *   branch renders, which unmounts/mounts a fresh instance — so THIS one
 *   correctly fires again on a genuine transition into a constrained state,
 *   and does not re-fire while the same constrained branch stays active.
 *
 * Development note: React StrictMode (`reactStrictMode: true` in
 * next.config.js) double-invokes effects on mount in development only —
 * any ViewBeacon (or any track()-in-useEffect call) may appear to fire
 * twice on localhost. This never happens in a production build. Do not use
 * localhost PostHog counts as production acceptance evidence.
 */
export function ViewBeacon({ event, props }: { event: string; props?: AnalyticsProps }) {
  useEffect(() => {
    track(event, props);
    // Intentionally depend on `event` only — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  return null;
}
