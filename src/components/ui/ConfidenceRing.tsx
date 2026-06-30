import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Confidence ring — a conic "style match" dial. The numeric value is rendered
 * as text so it remains accessible; the ring itself is decorative.
 *
 * `variant`:
 *  - "light": for light surfaces (plum arc on bone)
 *  - "dark":  for the charcoal recommendation card (champagne arc)
 */
export interface ConfidenceRingProps {
  value: number;
  size?: number;
  variant?: "light" | "dark";
  className?: string;
  label?: string;
}

export function ConfidenceRing({
  value,
  size = 56,
  variant = "light",
  className,
  label,
}: ConfidenceRingProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const arc = variant === "dark" ? "#B8915A" : "#4A2C3D";
  const track = variant === "dark" ? "rgba(251,248,243,0.14)" : "rgba(28,26,23,0.08)";
  const innerBg = variant === "dark" ? "#1C1A17" : "#FBF8F3";
  const textColor = variant === "dark" ? "text-bone" : "text-charcoal";

  return (
    <div
      role="img"
      aria-label={label ?? `Style match ${pct} percent`}
      className={cn("relative grid place-items-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${arc} ${pct}%, ${track} 0)`,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute rounded-full"
        style={{ inset: 5, background: innerBg }}
      />
      <span
        className={cn("relative font-mono font-medium tracking-tight", textColor)}
        style={{ fontSize: Math.round(size * 0.22) }}
      >
        {pct}
      </span>
    </div>
  );
}
