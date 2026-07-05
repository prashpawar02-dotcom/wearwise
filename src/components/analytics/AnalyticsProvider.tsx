"use client";

import { useEffect } from "react";
import { loadPostHog } from "@/lib/posthog-snippet";

/**
 * Initialises PostHog once on the client. Off by default in development — set
 * NEXT_PUBLIC_ANALYTICS_DEBUG=true to test locally. With no PostHog key, nothing
 * loads and every track() call is a safe no-op. Renders children unchanged (no
 * visible UI, no layout impact).
 */
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const ENABLED =
  Boolean(KEY) &&
  (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "true");

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!ENABLED || !KEY || typeof window === "undefined") return;
    const w = window as unknown as { posthog?: { __loaded?: boolean } };
    if (w.posthog?.__loaded) return; // already initialised
    try {
      loadPostHog(KEY, HOST);
    } catch {
      // If the snippet fails to load, analytics stays off — never blocks the app.
    }
  }, []);

  return <>{children}</>;
}
