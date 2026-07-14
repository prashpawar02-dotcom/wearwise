// =====================================================================
// WearWise — Shared app-shell tab config (Phase 4A)
// Pure module (no React import) so it compiles under tsconfig.test.json
// (no JSX/DOM allowed there). `icon` is a string key, not a component —
// TabBar.tsx maps the key to a lucide icon at render time.
//
// IA locked 2026-07-10 (handoff §1, CEO Prashant): labels/icons/active-
// logic change here. ROUTES DO NOT CHANGE. This is a relabel, not a
// migration — deep links, auth redirects, browser history, analytics
// events, and existing tests all stay intact.
// =====================================================================

export type TabIconKey = "today" | "wardrobe" | "styleme" | "plan" | "you";

export interface AppTab {
  key: string;
  label: string;
  href: string;
  icon: TabIconKey;
}

export const APP_TABS: readonly AppTab[] = [
  { key: "today", label: "Today", href: "/dashboard", icon: "today" },
  { key: "wardrobe", label: "Wardrobe", href: "/wardrobe", icon: "wardrobe" },
  { key: "styleme", label: "Style Me", href: "/occasion/new", icon: "styleme" },
  { key: "plan", label: "Plan", href: "/plan", icon: "plan" },
  { key: "you", label: "You", href: "/profile", icon: "you" },
];

/**
 * True when `pathname` should highlight `tab` as active. Preserves the
 * pre-4A behavior from `bottom-nav.tsx`: exact match, or path-prefix match
 * so nested routes (e.g. `/occasion/new/xyz`) still activate their tab.
 * Tab hrefs are disjoint top-level segments, so no tab ever cross-activates
 * on another tab's route.
 */
export function isTabActive(pathname: string, tab: AppTab): boolean {
  return pathname === tab.href || pathname.startsWith(tab.href + "/");
}
