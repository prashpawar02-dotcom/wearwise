"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { GarmentTile } from "@/components/wearwise/GarmentTile";
import { CollapsibleSection } from "@/components/wearwise/CollapsibleSection";
import { InsightCards } from "@/components/wearwise/InsightCards";
import type { InsightCard } from "@/lib/wardrobe/insights";
import { OCCASIONS, type AvailabilityStatus, type Occasion, type WardrobeItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { daysInWash } from "@/lib/laundry";
import {
  ZONE_META,
  ZONE_ORDER,
  availabilityBadge,
  colorToHex,
  garmentKindForItem,
  itemBadge,
  lastWornLabel,
  zoneForItem,
  type Zone,
} from "@/lib/wardrobe";

type FilterKey = "all" | "available" | "laundry" | "gems" | Zone;

const occasionLabel = (v: string) => OCCASIONS.find((o) => o.value === v)?.label ?? v;
const itemName = (it: WardrobeItem) => it.user_facing_name ?? it.category ?? "Untagged item";
const statusOf = (it: WardrobeItem): AvailabilityStatus =>
  (it.availability_status ?? "available") as AvailabilityStatus;

/** "in wash · 3d" badge text from the real in_wash_since stamp. */
function washAgeLabel(it: WardrobeItem): string {
  const d = daysInWash(it);
  if (d == null || d <= 0) return "in wash · today";
  return `in wash · ${d}d`;
}

async function laundryPost(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch("/api/wardrobe/laundry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface ZoneBuckets {
  all: WardrobeItem[];
  available: WardrobeItem[];
  inWash: number;
  unavailable: number;
}

export function ClosetBoard({
  items,
  urls,
  autoReturnCount = 0,
  showAutoReturn = false,
  insightCards = [],
  gemItemIds = [],
}: {
  items: WardrobeItem[];
  urls: Record<string, string>;
  /** How many in-wash items look ready to come back (server-computed, Phase 2). */
  autoReturnCount?: number;
  /** Whether to show the quiet auto-return badge this visit (throttled server-side). */
  showAutoReturn?: boolean;
  /** Server-computed, query-backed insight cards (Phase 5, Module E). */
  insightCards?: InsightCard[];
  /** Engine-validated gem item ids for the "show gems" action. */
  gemItemIds?: string[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Archived items are off-board (Phase 5, Module C1 — mirrors partitionBoardItems).
  const boardItems = useMemo(() => items.filter((i) => statusOf(i) !== "archived"), [items]);

  const wearable = useMemo(() => boardItems.filter((i) => statusOf(i) === "available"), [boardItems]);
  const inWash = useMemo(() => boardItems.filter((i) => statusOf(i) === "in_wash"), [boardItems]);
  const notAvailable = useMemo(() => boardItems.filter((i) => statusOf(i) !== "available"), [boardItems]);
  const unavailableCount = notAvailable.length - inWash.length;
  const needsReview = useMemo(() => boardItems.filter((i) => i.ai_tag_status === "needs_review"), [boardItems]);

  // Fire once per board view. Counts only — no item names/images.
  useEffect(() => {
    track("closet_board_viewed", {
      total_items: boardItems.length,
      available_items: wearable.length,
      in_wash_items: inWash.length,
      needs_review_items: needsReview.length,
    });
    // Depend on the counts so navigating back with changed data re-reports.
  }, [boardItems.length, wearable.length, inWash.length, needsReview.length]);

  // Per-zone buckets (available items feed the board; all items feed filters/counts).
  const zones = useMemo(() => {
    const empty = (): ZoneBuckets => ({ all: [], available: [], inWash: 0, unavailable: 0 });
    const m: Record<Zone, ZoneBuckets> = {
      hanging: empty(), folded: empty(), occasion: empty(), shoes: empty(), accessories: empty(),
    };
    for (const it of boardItems) {
      const z = zoneForItem(it);
      const s = statusOf(it);
      m[z].all.push(it);
      if (s === "available") m[z].available.push(it);
      else if (s === "in_wash") m[z].inWash += 1;
      else m[z].unavailable += 1;
    }
    return m;
  }, [boardItems]);

  const zonesRepresented = ZONE_ORDER.filter((z) => zones[z].available.length > 0).length;

  // Closet health — computed from AVAILABLE items only, so copy isn't misleading.
  const strongestOccasion = useMemo(() => {
    if (wearable.length < 6) return null;
    const counts: Record<string, number> = {};
    for (const it of wearable) for (const o of it.occasion_tags ?? []) counts[o] = (counts[o] ?? 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? occasionLabel(top[0]) : null;
  }, [wearable]);

  const healthSuggestion =
    zones.shoes.available.length < 1
      ? "Add one pair of shoes to unlock better outfits."
      : wearable.length < 6
        ? "Add a few more everyday pieces to improve recommendations."
        : zones.accessories.available.length < 1
          ? "Add one accessory to complete more looks."
          : null;

  const filtered = useMemo(() => {
    let list: WardrobeItem[];
    if (filter === "all") list = boardItems;
    else if (filter === "available") list = wearable;
    else if (filter === "laundry") list = notAvailable;
    else if (filter === "gems") list = boardItems.filter((i) => gemItemIds.includes(i.id));
    else list = zones[filter].all;

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((it) =>
        [it.user_facing_name, it.category, it.color, it.sub_category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    return list;
  }, [filter, query, boardItems, wearable, notAvailable, zones, gemItemIds]);

  async function toggleItemWash(item: WardrobeItem) {
    const from = statusOf(item);
    const ok = await laundryPost({ action: "toggle", itemId: item.id });
    if (!ok) return;
    if (from === "available") track("laundry_marked", { item_count: 1, source: "item_card" });
    else track("laundry_cleaned", { item_count: 1, source: "item_card" });
    router.refresh();
  }

  if (boardItems.length === 0) return <EmptyState />;

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: boardItems.length },
    { key: "available", label: "Available", count: wearable.length },
    { key: "laundry", label: "Laundry", count: notAvailable.length },
    { key: "hanging", label: "Hanging", count: zones.hanging.all.length },
    { key: "folded", label: "Folded", count: zones.folded.all.length },
    { key: "occasion", label: "Occasion", count: zones.occasion.all.length },
    { key: "shoes", label: "Shoes", count: zones.shoes.all.length },
    { key: "accessories", label: "Accessories", count: zones.accessories.all.length },
  ];
  if (gemItemIds.length > 0) filters.push({ key: "gems", label: "Gems", count: gemItemIds.length });

  return (
    <div className="space-y-5 pb-8">
      <Header
        count={items.length}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen((v) => !v)}
        query={query}
        onQuery={setQuery}
      />

      <InsightCards
        cards={insightCards}
        onShowGems={() => setFilter("gems")}
        onShowLaundry={() => setFilter("laundry")}
      />

      {/* Closet health */}
      <section className="rounded-ww-lg border border-hairline bg-bone p-4 shadow-ww-sm">
        <p className="ww-eyebrow text-plum">Closet health</p>
        <p className="mt-1.5 font-serif text-lg leading-snug text-charcoal">
          {strongestOccasion
            ? <>Your closet is strongest for <em className="text-plum">{strongestOccasion.toLowerCase()}</em> outfits.</>
            : <>{wearable.length} {wearable.length === 1 ? "piece is" : "pieces are"} ready across {zonesRepresented} {zonesRepresented === 1 ? "zone" : "zones"}.</>}
        </p>
        {healthSuggestion && <p className="mt-1 text-sm text-graphite">{healthSuggestion}</p>}

        <div className="mt-3 flex flex-wrap gap-4 border-t border-stone pt-3">
          <Stat value={wearable.length} label="available" />
          <Stat value={zonesRepresented} label="ready zones" />
          {needsReview.length > 0 && <Stat value={needsReview.length} label="need review" tone="champagne" />}
        </div>
      </section>

      {/* Closet Board hero — collapsible sections (Phase 5, Module C2) */}
      <section className="space-y-4 rounded-ww-lg border border-hairline bg-bone p-4 shadow-ww-sm">
        {ZONE_ORDER.map((z) => {
          const Body = ZONE_BODY[z];
          return (
            <CollapsibleSection
              key={z}
              sectionKey={z}
              title={ZONE_META[z].title}
              subtitle={ZONE_META[z].subtitle}
              meta={zoneMetaText(zones[z])}
            >
              <Body buckets={zones[z]} urls={urls} hideHeader />
            </CollapsibleSection>
          );
        })}
      </section>

      {/* Laundry basket — the dedicated section at the bottom of the board */}
      <LaundrySection
        inWash={inWash}
        unavailableCount={unavailableCount}
        urls={urls}
        autoReturnCount={autoReturnCount}
        showAutoReturn={showAutoReturn}
        onChanged={() => router.refresh()}
      />

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2 pt-1">
        {filters.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}>
            <Chip tone={filter === f.key ? "filled" : "default"}>
              {f.label}
              <span className="font-mono text-[10px] opacity-60">{f.count}</span>
            </Chip>
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-graphite">Nothing here yet in this view.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} url={urls[item.image_path]} onToggle={() => toggleItemWash(item)} />
          ))}
        </div>
      )}

      {/* Persistent Add (Phase 5, Module C3) — reachable while browsing; sits
          above the bottom tab bar, never covering cards or Laundry actions. */}
      <Link
        href="/wardrobe/upload"
        aria-label="Add clothing"
        className="fixed bottom-24 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-charcoal text-bone shadow-ww-md transition-colors hover:bg-plum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon.Plus className="h-5 w-5" />
      </Link>
    </div>
  );
}

// ===================== Header =====================

function Header({
  count,
  searchOpen,
  onToggleSearch,
  query,
  onQuery,
}: {
  count: number;
  searchOpen: boolean;
  onToggleSearch: () => void;
  query: string;
  onQuery: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="ww-display text-3xl text-charcoal">Wardrobe</h1>
          <p className="mt-1 text-sm text-graphite">Your clothes, organized for better outfit decisions.</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-mist">
            <Icon.Lock className="h-3 w-3" /> Private by default · delete items anytime
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onToggleSearch}
            aria-label="Search wardrobe"
            aria-pressed={searchOpen}
            className="grid h-10 w-10 place-items-center rounded-full border border-hairline bg-bone text-charcoal transition-colors hover:border-hairline-strong"
          >
            <Icon.Search className="h-4 w-4" />
          </button>
          <Link
            href="/wardrobe/upload"
            aria-label="Add clothing"
            className="grid h-10 w-10 place-items-center rounded-full bg-charcoal text-bone transition-colors hover:bg-plum"
          >
            <Icon.Plus className="h-4 w-4" />
          </Link>
        </div>
      </div>
      {searchOpen && (
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search by name, category or colour…"
          aria-label="Search wardrobe"
          className="mt-3 h-10 w-full rounded-ww-sm border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "champagne" }) {
  return (
    <div>
      <span className={cn("font-serif text-xl leading-none", tone === "champagne" ? "text-[#8a6a3e]" : "text-charcoal")}>
        {value}
      </span>
      <span className="ml-1 text-xs text-graphite">{label}</span>
    </div>
  );
}

// ===================== Laundry section =====================

function LaundrySection({
  inWash,
  unavailableCount,
  urls,
  autoReturnCount,
  showAutoReturn,
  onChanged,
}: {
  inWash: WardrobeItem[];
  unavailableCount: number;
  urls: Record<string, string>;
  autoReturnCount: number;
  showAutoReturn: boolean;
  onChanged: () => void;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const showBadge = showAutoReturn && autoReturnCount > 0 && !dismissed && inWash.length > 0;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function laundryDone(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    const ok = await laundryPost({ action: "bulk_clean", itemIds: ids });
    if (ok) track("laundry_cleaned", { item_count: ids.length, source: "bulk" });
    setBusy(false);
    setSelectMode(false);
    setSelected(new Set());
    if (ok) onChanged();
  }

  async function dismissReturn() {
    setDismissed(true);
    await laundryPost({ action: "dismiss_return_prompt" });
  }

  // Positive empty state — the whole point of the laundry system working.
  if (inWash.length === 0) {
    return (
      <section className="rounded-ww-lg border border-hairline bg-bone p-4 shadow-ww-sm">
        <div className="flex items-center gap-2">
          <Icon.Basket className="h-4 w-4 text-sage" />
          <p className="ww-eyebrow text-plum">Laundry</p>
        </div>
        <p className="mt-1.5 text-sm text-graphite">Nothing in the wash. Everything&apos;s ready to wear.</p>
        {unavailableCount > 0 && (
          <p className="mt-1 text-xs text-mist">{unavailableCount} set aside · not in today&apos;s suggestions.</p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-ww-lg border border-hairline bg-bone p-4 shadow-ww-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon.Basket className="h-4 w-4 text-plum" />
          <p className="ww-eyebrow text-plum">Laundry</p>
          <span className="text-xs text-graphite">
            {inWash.length} in wash{unavailableCount > 0 ? ` · ${unavailableCount} set aside` : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelectMode((v) => !v);
            setSelected(new Set());
          }}
          className="text-xs font-medium text-plum hover:underline"
        >
          {selectMode ? "Cancel" : "Laundry done"}
        </button>
      </div>

      {/* Quiet auto-return nudge (never a push) */}
      {showBadge && !selectMode && (
        <div className="mt-3 flex items-center gap-3 rounded-ww-md border border-sage/30 bg-sage/[0.08] p-3">
          <span className="min-w-0 flex-1 text-sm text-charcoal">
            {autoReturnCount === 1
              ? "1 item might be back from laundry — mark it clean when it is."
              : `${autoReturnCount} items might be back from laundry — mark what's clean?`}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectMode(true);
              setSelected(new Set(inWash.map((i) => i.id)));
            }}
            className="shrink-0 rounded-full bg-sage/90 px-3 py-1 text-xs font-medium text-charcoal hover:bg-sage"
          >
            Review
          </button>
          <button type="button" onClick={dismissReturn} aria-label="Dismiss" className="shrink-0 text-mist hover:text-charcoal">
            <Icon.Close className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Basket — thumbnails with "in wash · Nd" badges */}
      <div className="mt-3 rounded-ww-md border border-dashed border-hairline-strong bg-stone/20 p-3">
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
          {inWash.map((it) => {
            const isSel = selected.has(it.id);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => selectMode && toggleSelect(it.id)}
                aria-pressed={selectMode ? isSel : undefined}
                className={cn(
                  "group relative overflow-hidden rounded-ww-sm border bg-stone text-left transition-transform",
                  selectMode ? "cursor-pointer active:scale-[0.98]" : "cursor-default",
                  isSel ? "border-plum ring-2 ring-plum/40" : "border-hairline"
                )}
              >
                <div className="aspect-square">
                  {urls[it.image_path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[it.image_path]} alt={itemName(it)} className="h-full w-full object-cover opacity-80" />
                  ) : (
                    <GarmentTile fill kind={garmentKindForItem(it)} color={colorToHex(it.color)} rounded="rounded-none" className="border-0" />
                  )}
                </div>
                <span className="absolute inset-x-0 bottom-0 truncate bg-charcoal/55 px-1 py-0.5 text-[9px] font-medium text-bone">
                  {washAgeLabel(it)}
                </span>
                {selectMode && isSel && (
                  <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-plum text-bone">
                    <Icon.Check className="h-2.5 w-2.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectMode ? (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" disabled={busy || selected.size === 0} onClick={() => laundryDone([...selected])} className="flex-1">
            {busy ? "Updating…" : selected.size > 0 ? `Mark ${selected.size} clean` : "Select items"}
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set(inWash.map((i) => i.id)))}
            className="rounded-full border border-hairline px-3 py-2 text-xs font-medium text-graphite hover:text-charcoal"
          >
            Select all
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-mist">Excluded from today&apos;s suggestions until they&apos;re back.</p>
      )}
    </section>
  );
}

// ===================== Board zones =====================

function zoneMetaText(b: ZoneBuckets): string {
  return [
    `${b.available.length} available`,
    b.inWash > 0 ? `${b.inWash} in wash` : null,
    b.unavailable > 0 ? `${b.unavailable} unavailable` : null,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");
}

const ZONE_BODY: Record<
  Zone,
  (p: { buckets: ZoneBuckets; urls: Record<string, string>; hideHeader?: boolean }) => React.ReactElement
> = { hanging: RailZone, folded: ShelfZone, occasion: OccasionZone, shoes: ShoeZone, accessories: TrayZone };

function ZoneHeader({
  zone,
  buckets,
  action,
}: {
  zone: Zone;
  buckets: ZoneBuckets;
  action?: React.ReactNode;
}) {
  const meta = [
    `${buckets.available.length} available`,
    buckets.inWash > 0 ? `${buckets.inWash} in wash` : null,
    buckets.unavailable > 0 ? `${buckets.unavailable} unavailable` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <div>
        <p className="ww-eyebrow text-plum">{ZONE_META[zone].title}</p>
        <p className="text-xs text-graphite">{ZONE_META[zone].subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap text-[11px] text-mist">{meta}</span>
        {action}
      </div>
    </div>
  );
}

/** Body shown when a zone has no AVAILABLE items: ghost note (has hidden items) or a quiet empty line. */
function ZonePlaceholder({ buckets, emptyText }: { buckets: ZoneBuckets; emptyText: string }) {
  const hidden = buckets.inWash + buckets.unavailable;
  if (hidden > 0) {
    return (
      <p className="rounded-ww-md border border-dashed border-hairline bg-stone/20 px-3 py-2.5 text-xs text-graphite">
        Currently set aside · {hidden} {hidden === 1 ? "item is" : "items are"} hidden from today&apos;s suggestions.
      </p>
    );
  }
  return <p className="py-1.5 text-xs text-mist">{emptyText}</p>;
}

function MiniTile({
  item,
  url,
  size,
  rounded = "rounded-ww-sm",
  className,
}: {
  item: WardrobeItem;
  url?: string;
  size: number;
  rounded?: string;
  className?: string;
}) {
  if (url) {
    return (
      <div
        className={cn("overflow-hidden border border-hairline bg-stone", rounded, className)}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={itemName(item)} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <GarmentTile kind={garmentKindForItem(item)} color={colorToHex(item.color)} size={size} rounded={rounded} className={className} />
  );
}

function RailZone({ buckets, urls, hideHeader }: { buckets: ZoneBuckets; urls: Record<string, string>; hideHeader?: boolean }) {
  const shown = buckets.available.slice(0, 5);
  return (
    <div>
      {!hideHeader && <ZoneHeader zone="hanging" buckets={buckets} />}
      {shown.length === 0 ? (
        <ZonePlaceholder buckets={buckets} emptyText="No hanging pieces yet." />
      ) : (
        <div className="relative pt-3.5">
          <div className="absolute left-0 right-0 top-0 h-[3px] rounded-full bg-mist/60" aria-hidden="true" />
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1 pr-4">
            {shown.map((item) => (
              <Link key={item.id} href={`/wardrobe/${item.id}`} className="flex w-[76px] shrink-0 flex-col items-center">
                <span className="h-3.5 w-px bg-mist/70" aria-hidden="true" />
                <MiniTile item={item} url={urls[item.image_path]} size={76} className="shadow-ww-sm" />
                <span className="mt-1 w-full truncate text-center text-[10px] text-graphite">{itemName(item)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShelfZone({ buckets, urls, hideHeader }: { buckets: ZoneBuckets; urls: Record<string, string>; hideHeader?: boolean }) {
  const shown = buckets.available.slice(0, 5);
  return (
    <div>
      {!hideHeader && <ZoneHeader zone="folded" buckets={buckets} />}
      {shown.length === 0 ? (
        <ZonePlaceholder buckets={buckets} emptyText="Nothing folded yet." />
      ) : (
        <div className="rounded-ww-sm border-b-2 border-stone">
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-0.5 pb-2 pr-4">
            {shown.map((item) => (
              <Link key={item.id} href={`/wardrobe/${item.id}`} className="shrink-0">
                <MiniTile item={item} url={urls[item.image_path]} size={76} rounded="rounded-ww-sm" className="shadow-ww-sm" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OccasionZone({ buckets, urls, hideHeader }: { buckets: ZoneBuckets; urls: Record<string, string>; hideHeader?: boolean }) {
  const shown = buckets.available.slice(0, 6);
  return (
    <div>
      {!hideHeader && <ZoneHeader zone="occasion" buckets={buckets} />}
      {shown.length === 0 ? (
        <ZonePlaceholder buckets={buckets} emptyText="No festive, ethnic or formal pieces yet." />
      ) : (
        <div className="rounded-ww-md border border-champagne/25 bg-champagne/[0.06] p-3">
          <div className="no-scrollbar flex gap-3 overflow-x-auto pr-4">
            {shown.map((item) => (
              <Link key={item.id} href={`/wardrobe/${item.id}`} className="flex w-[76px] shrink-0 flex-col items-center">
                <MiniTile item={item} url={urls[item.image_path]} size={76} className="shadow-ww-sm" />
                <span className="mt-1 w-full truncate text-center text-[10px] text-graphite">{itemName(item)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShoeZone({ buckets, urls, hideHeader }: { buckets: ZoneBuckets; urls: Record<string, string>; hideHeader?: boolean }) {
  const shown = buckets.available.slice(0, 4);
  return (
    <div>
      {!hideHeader && <ZoneHeader zone="shoes" buckets={buckets} />}
      {shown.length === 0 ? (
        <ZonePlaceholder buckets={buckets} emptyText="No shoes yet. Add shoes to complete more outfits." />
      ) : (
        <div className="flex gap-3 border-b-2 border-stone pb-3 pr-4">
          {shown.map((item) => (
            <Link key={item.id} href={`/wardrobe/${item.id}`} className="shrink-0">
              <MiniTile item={item} url={urls[item.image_path]} size={64} className="shadow-ww-md" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function TrayZone({ buckets, urls, hideHeader }: { buckets: ZoneBuckets; urls: Record<string, string>; hideHeader?: boolean }) {
  const shown = buckets.available.slice(0, 6);
  const trulyEmpty = buckets.all.length === 0;
  return (
    <div>
      {!hideHeader && (
        <ZoneHeader
        zone="accessories"
        buckets={buckets}
        action={
          <Link href="/wardrobe/upload" className="shrink-0 text-xs font-medium text-plum hover:underline">
            Add
          </Link>
        }
      />
      )}
      {shown.length === 0 ? (
        trulyEmpty ? (
          <div className="rounded-ww-md border border-dashed border-hairline-strong bg-stone/20 p-3">
            <p className="text-xs text-graphite">
              No accessories yet. A belt, watch, bag, dupatta or jewelry completes more looks.
            </p>
          </div>
        ) : (
          <ZonePlaceholder buckets={buckets} emptyText="No accessories yet." />
        )
      ) : (
        <div className="rounded-ww-md border border-hairline bg-stone/40 p-3">
          <div className="flex flex-wrap gap-2.5">
            {shown.map((item) => (
              <Link key={item.id} href={`/wardrobe/${item.id}`} className="shrink-0">
                <MiniTile item={item} url={urls[item.image_path]} size={52} className="shadow-ww-sm" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== Grid card =====================

const BADGE_TONE: Record<"champagne" | "plum" | "sage", string> = {
  champagne: "bg-champagne/90 text-charcoal",
  plum: "bg-plum text-bone",
  sage: "bg-sage/90 text-charcoal",
};

const AVAIL_TONE: Record<"wash" | "unavailable", string> = {
  wash: "bg-sage/25 text-[#5d7351]",
  unavailable: "bg-stone text-graphite",
};

function ItemCard({ item, url, onToggle }: { item: WardrobeItem; url?: string; onToggle: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);

  const occ = (item.occasion_tags ?? []).slice(0, 2) as Occasion[];
  const avail = availabilityBadge(item);
  const stateBadge = itemBadge(item);
  const worn = lastWornLabel(item);
  const status = statusOf(item);

  async function handleToggle() {
    setBusy(true);
    await onToggle();
    setBusy(false);
  }

  return (
    <div
      className={cn("overflow-hidden rounded-ww-md border border-hairline bg-bone shadow-ww-sm", status !== "available" && "opacity-95")}
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 280px" }}
    >
      <Link href={`/wardrobe/${item.id}`} className="group block">
        {/* Item tile — the garment sits centred on a warm surface (not a cropped catalog card). */}
        <div className="relative aspect-square bg-stone/60 p-2">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={itemName(item)}
              loading="lazy"
              decoding="async"
              className={cn("h-full w-full rounded-ww-xs object-contain transition-transform group-active:scale-[0.98]", status === "in_wash" && "opacity-70")}
            />
          ) : (
            <GarmentTile fill kind={garmentKindForItem(item)} color={colorToHex(item.color)} rounded="rounded-ww-xs" className="border-0" />
          )}
          {avail ? (
            <span className={cn("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium", AVAIL_TONE[avail.tone])}>
              {avail.label}
            </span>
          ) : stateBadge ? (
            <span className={cn("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium", BADGE_TONE[stateBadge.tone])}>
              {stateBadge.label}
            </span>
          ) : null}
        </div>
        <div className="px-2.5 pt-2.5">
          <p className="truncate text-sm font-medium text-charcoal">{itemName(item)}</p>
          <p className="truncate text-xs text-graphite">
            {[item.category, item.color].filter(Boolean).join(" · ") || "Untagged"}
          </p>
          {occ.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {occ.map((o) => (
                <Chip key={o} size="sm" className="text-graphite">{occasionLabel(o)}</Chip>
              ))}
            </div>
          )}
          {worn && <p className="mt-1 text-[11px] text-mist">{worn}</p>}
        </div>
      </Link>

      {/* Compact availability action (one-tap toggle, Phase 2) */}
      <div className="flex items-center justify-end px-2.5 pb-2.5 pt-2">
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy}
          aria-label={status === "available" ? "Mark in wash" : "Mark available"}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
            status === "available"
              ? "border-hairline text-graphite hover:bg-stone/40"
              : "border-sage/40 bg-sage/10 text-[#5d7351] hover:bg-sage/20"
          )}
        >
          {busy ? "…" : status === "available" ? "Mark in wash" : "Mark clean"}
        </button>
      </div>
    </div>
  );
}

// ===================== Empty state =====================

function EmptyState() {
  return (
    <div className="pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="ww-display text-3xl text-charcoal">Wardrobe</h1>
          <p className="mt-1 text-sm text-graphite">Your clothes, organized for better outfit decisions.</p>
        </div>
      </div>

      <div className="mt-5 space-y-4 rounded-ww-lg border border-hairline bg-bone p-4 shadow-ww-sm" aria-hidden="true">
        <div>
          <p className="ww-eyebrow text-plum">Hanging Rail</p>
          <div className="relative mt-3 pt-3.5">
            <div className="absolute left-0 right-0 top-0 h-[3px] rounded-full bg-mist/40" />
            <div className="flex gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex w-[76px] flex-col items-center">
                  <span className="h-3.5 w-px bg-mist/40" />
                  <div className="h-[76px] w-[76px] rounded-ww-sm border border-dashed border-hairline-strong bg-ivory/50" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="h-px bg-mist/40" />
        <div>
          <p className="ww-eyebrow text-plum">Folded Shelf</p>
          <div className="mt-3 h-16 rounded-ww-sm border-b-2 border-stone bg-ivory/40" />
        </div>
        <div className="h-px bg-mist/40" />
        <div>
          <p className="ww-eyebrow text-plum">Shoe Rack</p>
          <div className="mt-3 flex gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 w-16 rounded-ww-sm border border-dashed border-hairline-strong bg-ivory/50" />
            ))}
            <div className="grid h-16 w-16 place-items-center rounded-ww-sm border border-plum/40 bg-plum/[0.06] shadow-ww-sm">
              <Icon.Plus className="h-5 w-5 text-plum" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <p className="ww-eyebrow">Empty wardrobe</p>
        <h2 className="ww-display mt-2 text-2xl text-charcoal">Your cupboard is waiting.</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-graphite">
          Add a few everyday clothes first. WearWise will organize them into rails, shelves, shoes, occasion wear and accessories.
        </p>
        <div className="mx-auto mt-6 flex max-w-xs flex-col gap-2">
          <Button asChild size="lg">
            <Link href="/wardrobe/upload"><Icon.Plus className="h-4 w-4" /> Add first item</Link>
          </Button>
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-graphite">
          <Icon.Lock className="h-3 w-3" /> Private by default. No public profile. Delete items anytime.
        </p>
      </div>
    </div>
  );
}
