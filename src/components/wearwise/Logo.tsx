import * as React from "react";
import { cn } from "@/lib/utils";

/** WearWise wordmark — a small two-tone mark + serif wordmark. */
export function Logo({
  size = 22,
  className,
  withWordmark = true,
}: {
  size?: number;
  className?: string;
  withWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-serif tracking-tight text-charcoal", className)} style={{ fontSize: size }}>
      <span aria-hidden="true" className="relative inline-block" style={{ width: size * 0.85, height: size * 0.85 }}>
        <span className="absolute rounded-[2px] bg-plum" style={{ inset: "10% 30% 30% 10%" }} />
        <span className="absolute rounded-[2px] bg-champagne" style={{ inset: "30% 10% 10% 30%" }} />
      </span>
      {withWordmark && <span>WearWise</span>}
    </span>
  );
}
