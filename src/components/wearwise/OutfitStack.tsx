import * as React from "react";
import { Icon, type GarmentKind } from "@/components/ui/Icon";
import { GarmentTile } from "@/components/wearwise/GarmentTile";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";

/**
 * The Outfit Stack — WearWise's signature interface motif. A set of layered
 * cards that visualise how the AI reasons: occasion + weather + wardrobe +
 * style logic → one confident recommendation. Decorative-but-meaningful; used
 * on the landing hero and marketing surfaces.
 */
export interface StackItem {
  kind: GarmentKind;
  color: string;
  label: string;
}

export interface OutfitStackProps {
  width?: number;
  weather?: { temp: string; label: string };
  occasion?: string;
  items?: StackItem[];
  reason?: string;
  confidence?: number;
  className?: string;
}

function Layer({
  offset,
  rotate,
  z,
  scale = 1,
  width,
  dark = false,
  children,
}: {
  offset: number;
  rotate: number;
  z: number;
  scale?: number;
  width: number;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        "absolute left-1/2 top-0 origin-top rounded-ww-lg border px-[18px] shadow-ww-stack " +
        (dark ? "border-charcoal bg-charcoal text-bone" : "border-hairline bg-bone")
      }
      style={{
        width,
        zIndex: z,
        transform: `translateX(-50%) translateY(${offset}px) rotate(${rotate}deg) scale(${scale})`,
      }}
    >
      {children}
    </div>
  );
}

export function OutfitStack({
  width = 280,
  weather = { temp: "28°", label: "Sunny · Office light" },
  occasion = "Office · Smart casual",
  items = [
    { kind: "Shirt", color: "#F4F0E8", label: "White linen shirt" },
    { kind: "Pants", color: "#2A3852", label: "Navy chinos" },
    { kind: "Loafer", color: "#7B4B2E", label: "Brown loafers" },
  ],
  reason = "Polished without trying too hard.",
  confidence = 87,
  className,
}: OutfitStackProps) {
  return (
    <div
      className={className}
      style={{ width, position: "relative", height: 540 }}
      role="img"
      aria-label={`Example WearWise recommendation for ${occasion}, ${weather.temp} ${weather.label}: ${reason} ${confidence} percent style match.`}
    >
      {/* 01 — Occasion */}
      <Layer offset={0} rotate={-3.2} z={1} scale={0.92} width={width - 40}>
        <div className="flex items-center justify-between py-3.5">
          <span className="ww-eyebrow">Occasion</span>
          <span className="font-mono text-[10px] text-mist">01</span>
        </div>
        <p className="-mt-2 pb-3.5 text-sm font-medium text-charcoal">{occasion}</p>
      </Layer>

      {/* 02 — Weather */}
      <Layer offset={56} rotate={2.4} z={2} scale={0.95} width={width - 28}>
        <div className="flex items-center justify-between py-3.5">
          <span className="ww-eyebrow">Weather</span>
          <span className="font-mono text-[10px] text-mist">02</span>
        </div>
        <div className="-mt-2 flex items-center gap-2.5 pb-3.5">
          <Icon.Sun className="h-4 w-4 text-champagne" />
          <span className="text-sm font-medium text-charcoal">{weather.temp}</span>
          <span className="text-[13px] text-graphite">{weather.label}</span>
        </div>
      </Layer>

      {/* 03 — Wardrobe (centerpiece) */}
      <Layer offset={120} rotate={-1.2} z={3} width={width}>
        <div className="flex items-center justify-between pb-3 pt-4">
          <span className="ww-eyebrow">Wardrobe</span>
          <span className="font-mono text-[10px] text-mist">03</span>
        </div>
        <div className="grid gap-2 pb-4">
          {items.map((it, i) => (
            <div key={`${it.kind}-${i}`} className="flex items-center gap-2.5">
              <GarmentTile kind={it.kind} color={it.color} size={36} rounded="rounded-ww-sm" />
              <span className="flex-1 text-[13px] text-charcoal">{it.label}</span>
              <Icon.Check className="h-3.5 w-3.5 text-sage" />
            </div>
          ))}
        </div>
      </Layer>

      {/* 04 — Style logic */}
      <Layer offset={310} rotate={1.8} z={4} scale={0.97} width={width - 12}>
        <div className="flex items-center justify-between pt-3.5">
          <span className="ww-eyebrow flex items-center gap-1.5">
            <Icon.Sparkle className="h-3 w-3 text-cobalt" />
            Style logic
          </span>
          <span className="font-mono text-[10px] text-mist">04</span>
        </div>
        <p className="pb-3.5 pt-1 font-serif text-[17px] leading-tight text-charcoal">{reason}</p>
      </Layer>

      {/* 05 — Recommendation (anchor) */}
      <Layer offset={400} rotate={0} z={5} width={width + 8} dark>
        <div className="flex items-center justify-between py-[18px]">
          <div>
            <span className="ww-eyebrow text-bone/55">Recommendation</span>
            <p className="mt-1 font-serif text-[22px] tracking-tight">Today&apos;s outfit</p>
          </div>
          <ConfidenceRing value={confidence} size={52} variant="dark" />
        </div>
      </Layer>
    </div>
  );
}
