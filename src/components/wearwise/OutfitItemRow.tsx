import * as React from "react";
import { type GarmentKind, Icon } from "@/components/ui/Icon";
import { GarmentTile } from "@/components/wearwise/GarmentTile";
import { cn } from "@/lib/utils";

export interface OutfitItem {
  kind: GarmentKind;
  /** Swatch colour for the garment tile (used when there's no photo). */
  color?: string;
  label: string;
  /** Short descriptor under the label, e.g. "Light · breathable". */
  sub?: string;
  /** Mono meta line, e.g. "Top · Linen · Cream". */
  meta?: string;
  /** Right-aligned note, e.g. "Last worn 6 days ago". */
  note?: string;
  /**
   * Optional short-lived signed URL for a real wardrobe photo. When present it
   * replaces the vector garment tile. Never a public storage URL.
   */
  image?: string | null;
}

export interface OutfitItemRowProps {
  item: OutfitItem;
  /** Visual treatment: a contained card row, or a lighter list row. */
  variant?: "card" | "list";
  showCheck?: boolean;
  highlighted?: boolean;
  tileSize?: number;
  className?: string;
}

/** A single garment line in an outfit — tile + details + optional trailing slot. */
export function OutfitItemRow({
  item,
  variant = "list",
  showCheck = false,
  highlighted = false,
  tileSize = 52,
  className,
}: OutfitItemRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 rounded-ww-md border p-3",
        highlighted
          ? "border-champagne/30 bg-champagne/[0.08]"
          : variant === "card"
            ? "border-hairline bg-bone shadow-ww-xs"
            : "border-hairline bg-bone",
        className
      )}
    >
      {item.image ? (
        <div
          className="shrink-0 overflow-hidden rounded-ww-sm border border-hairline bg-stone"
          style={{ width: tileSize, height: tileSize }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <GarmentTile kind={item.kind} color={item.color} size={tileSize} rounded="rounded-ww-sm" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-charcoal">{item.label}</p>
        {item.meta && (
          <p className="mt-0.5 truncate font-mono text-[11px] tracking-[0.04em] text-mist">{item.meta}</p>
        )}
        {item.sub && <p className="mt-0.5 truncate text-xs text-graphite">{item.sub}</p>}
      </div>
      {item.note && (
        <span className="shrink-0 text-right text-[10px] leading-tight text-mist">{item.note}</span>
      )}
      {showCheck && (
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sage/15">
          <Icon.Check className="h-3.5 w-3.5 text-[#5d7351]" />
        </span>
      )}
    </div>
  );
}
