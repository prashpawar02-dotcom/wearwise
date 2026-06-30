import * as React from "react";
import { Garment, type GarmentKind } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * A garment swatch tile — a soft coloured square holding a minimal garment
 * illustration. Used in outfit rows, grids and stacks as a calm stand-in when
 * there's no photo (and alongside photos elsewhere).
 */
export interface GarmentTileProps {
  kind: GarmentKind;
  /** Background colour of the swatch (any CSS colour). */
  color?: string;
  /** Pixel size for square tiles. Ignored when `fill` is set. */
  size?: number;
  /** Fill the parent instead of using a fixed size (for grid cells). */
  fill?: boolean;
  rounded?: string;
  className?: string;
}

export function GarmentTile({
  kind,
  color = "#EAE3D7",
  size = 52,
  fill = false,
  rounded = "rounded-ww-sm",
  className,
}: GarmentTileProps) {
  const G = Garment[kind] ?? Garment.Shirt;
  return (
    <div
      className={cn(
        "grid place-items-center overflow-hidden border border-hairline",
        rounded,
        fill ? "h-full w-full" : "",
        className
      )}
      style={{ background: color, width: fill ? undefined : size, height: fill ? undefined : size }}
    >
      <G className="h-[58%] w-[58%]" style={{ color: "rgba(28,26,23,0.55)" }} />
    </div>
  );
}
