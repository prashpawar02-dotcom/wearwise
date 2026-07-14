"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Shirt, Sparkles, CalendarDays, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_TABS, isTabActive, type TabIconKey } from "@/lib/shell/tabs";

const ICONS: Record<TabIconKey, LucideIcon> = {
  today: Home,
  wardrobe: Shirt,
  styleme: Sparkles,
  plan: CalendarDays,
  you: User,
};

/**
 * The presentational bottom tab bar (Phase 4A shell foundation, handbook
 * §6 IA: Today · Wardrobe · Style Me · Plan · You). Fixed to the viewport
 * bottom, tap targets >=44px (§3.8), active tab = plum ink + heavier
 * stroke. Width matches the app shell (`(app)/layout.tsx`, max-w-440px).
 *
 * `BottomNav` (nav/bottom-nav.tsx) re-exports this component so the 7
 * existing pages that import `BottomNav` keep working with zero changes.
 */
export function TabBar() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-[440px] items-stretch justify-around">
        {APP_TABS.map((tab) => {
          const active = isTabActive(pathname, tab);
          const Icon = ICONS[tab.icon];
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 py-2.5 text-xs transition-colors",
                active ? "text-plum" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
