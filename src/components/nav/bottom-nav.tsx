"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Shirt, Sparkles, Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Today", icon: Home },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/occasion/new", label: "Style Me", icon: Sparkles },
  { href: "/plan", label: "Plan", icon: Calendar },
  { href: "/profile", label: "You", icon: User },
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
