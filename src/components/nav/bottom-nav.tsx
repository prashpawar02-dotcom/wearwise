"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Shirt, Sparkles, BookMarked, User } from "lucide-react";
import { cn } from "@/lib/utils";

// IA (plan §6): Today · Closet · Occasions(+) · Lookbook · Profile.
// Today is the default landing — the daily habit surface.
const items = [
  { href: "/dashboard", label: "Today", icon: Home },
  { href: "/wardrobe", label: "Closet", icon: Shirt },
  { href: "/occasion/new", label: "Occasions", icon: Sparkles },
  { href: "/lookbook", label: "Lookbook", icon: BookMarked },
  { href: "/profile", label: "Profile", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-[480px] items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs transition-colors",
                active ? "text-plum" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
