import * as React from "react";
import { OutfitItemRow, type OutfitItem } from "@/components/wearwise/OutfitItemRow";
import { cn } from "@/lib/utils";

/**
 * Vertical, no-rotation list of the pieces in an outfit — used inside the home
 * "Best Pick" card and result screens.
 */
export interface CompactOutfitStackProps {
  items: OutfitItem[];
  showCheck?: boolean;
  /** Index of the item to highlight (e.g. a freshly swapped piece). */
  highlight?: number | null;
  tileSize?: number;
  className?: string;
}

export function CompactOutfitStack({
  items,
  showCheck = true,
  highlight = null,
  tileSize = 52,
  className,
}: CompactOutfitStackProps) {
  return (
    <ul className={cn("grid gap-2.5", className)}>
      {items.map((item, i) => (
        <li key={`${item.kind}-${i}`}>
          <OutfitItemRow
            item={item}
            showCheck={showCheck}
            highlighted={highlight === i}
            tileSize={tileSize}
          />
        </li>
      ))}
    </ul>
  );
}
