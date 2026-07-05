/**
 * WearWise product analytics — a thin, privacy-safe wrapper over PostHog.
 *
 * DESIGN
 * - Client-safe: reads the global `window.posthog` set by the AnalyticsProvider
 *   snippet. It imports nothing, so it has zero build dependency and cannot fail
 *   to compile if PostHog isn't installed/loaded.
 * - Fail-safe: if PostHog isn't loaded (no key, dev, network blocked, ad-blocker)
 *   every call is a silent no-op, and it NEVER throws — analytics must never
 *   block a product action.
 *
 * PRIVACY — only pass NON-SENSITIVE properties:
 *   counts, categories, booleans, status strings, route/source, occasion type,
 *   error reason codes, item_count, availability_status, daily_drop status.
 * NEVER pass: wardrobe image URLs, signed URLs, image paths, raw notes, user
 *   email, full names, exact wardrobe item names, or body/appearance data.
 */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

interface PostHogLike {
  capture: (event: string, properties?: AnalyticsProps) => void;
}

function getPostHog(): PostHogLike | null {
  if (typeof window === "undefined") return null;
  const ph = (window as unknown as { posthog?: PostHogLike }).posthog;
  return ph && typeof ph.capture === "function" ? ph : null;
}

/** Capture a product event. Safe no-op when analytics isn't available. */
export function track(event: string, properties?: AnalyticsProps): void {
  try {
    getPostHog()?.capture(event, properties);
  } catch {
    // Swallow — a failed analytics call must never break the user's action.
  }
}
