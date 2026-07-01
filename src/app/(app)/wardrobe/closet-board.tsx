"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { GarmentTile } from "@/components/wearwise/GarmentTile";
import { OCCASIONS, type Occasion, type WardrobeItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ZONE_META,
  ZONE_ORDER,
  colorToHex,
  garmentKindForItem,
  zoneForItem,
  type Zone,
} from "@/lib/wardrobe";

type FilterKey = "all" | Zone | "needs_review";

const occasionLabel = (v: string) => OCCASIONS.find((o) => o.value === v)?.label ?? v;
const itemName = (it: WardrobeItem) => it.user_facing_name ?? it.category ?? "Untagged item";

export function ClosetBoard({
  items,
  urls,
}: {
  items: WardrobeItem[];
  urls: Record<string, string>;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const byZone = useMemo(() => {
    const m: Record<Zone, WardrobeItem[]> = { hanging: [], folded: [], shoes: [], accessories: [] };
    for (const it of items) m[zoneForItem(it)].push(it);
    return m;
  }, [items]);

  const needsReview = useMemo(
    () => items.filter((i) => i.ai_tag_status === "needs_review"),
    [items]
  );

  const zonesRepresented = ZONE_ORDER.filter((z) => byZone[z].length > 0).length;

  // Closet health — real signals only (no fake AI claims).
  const strongestOccasion = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of items) for (const o of it.occasion_tags ?? []) counts[o] = (counts[o] ?? 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? occasionLabel(top[0]) : null;
  }, [items]);

  const healthSuggestion =
    byZone.shoes.length < 2
      ? "Add a pair of shoes to complete more outfits."
      : byZone.hanging.length < 3
        ? "Add a few tops or shirts to expand your looks."
        : byZone.accessories.length < 1
          ? "A belt or watch can finish off more looks."
          : null;

  const filtered = useMemo(() => {
    let list =
      filter === "all" ? items : filter === "needs_review" ? needsReview : byZone[filter];
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
  }, [filter, query, items, needsReview, byZone]);

  // ---- Empty state ----
  if (items.length === 0) return <EmptyState />;

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: items.length },
    { key: "hanging", label: "Hanging", count: byZone.hanging.length },
    { key: "folded", label: "Folded", count: byZone.folded.length },
    { key: "shoes", label: "Shoes", count: byZone.shoes.length },
    { key: "accessories", label: "Accessories", count: byZone.accessories.length },
    { key: "needs_review", label: "Needs review", count: needsReview.length },
  ];

  return (
    <div className="space-y-5">
      <Header
        count={items.length}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen((v) => !v)}
        query={query}
        onQuery={setQuery}
      />

      {/* Closet health */}
      <section className="rounded-ww-lg border border-hairline bg-bone p-4 shadow-ww-sm">
        <p className="ww-eyebrow text-plum">Closet health</p>
        <p className="mt-1.5 font-serif text-lg leading-snug text-charcoal">
          {strongestOccasion
            ? <>Your closet is strongest for <em className="text-plum">{strongestOccasion.toLowerCase()}</em> outfits.</>
            : <>{items.length} {items.length === 1 ? "piece" : "pieces"} across {zonesRepresented} {zonesRepresented === 1 ? "zone" : "zones"}.</>}
        </p>
        {healthSuggestion && <p className="mt-1 text-sm text-graphite">{healthSuggestion}</p>}

        <div className="mt-3 flex flex-wrap gap-4 border-t border-stone pt-3">
          <Stat value={items.length} label="items" />
          <Stat value={zonesRepresented} label="outfit-ready zones" />
          {needsReview.length > 0 && <Stat value={needsReview.length} label="need review" tone="champagne" />}
        </div>
      </section>

      {/* Closet Board hero */}
      <section className="overflow-hidden rounded-ww-lg border border-hairline bg-bone p-4 shadow-ww-sm">
        <RailZone items={byZone.hanging} urls={urls} />
        <div className="my-4 h-px bg-stone" />
        <ShelfZone items={byZone.folded} urls={urls} />
        <div className="my-4 h-px bg-stone" />
        <ShoeZone items={byZone.shoes} urls={urls} />
        <div className="my-4 h-px bg-stone" />
        <TrayZone items={byZone.accessories} urls={urls} />
      </section>

      {/* Quick filters */}
      <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6">
        {filters.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className="shrink-0" aria-pressed={filter === f.key}>
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
            <ItemCard key={item.id} item={item} url={urls[item.image_path]} />
          ))}
        </div>
      )}
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
          <p className="mt-0.5 text-xs text-mist">{count} {count === 1 ? "item" : "items"} · private to you</p>
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

// ===================== Board zones =====================

function ZoneHead({ zone }: { zone: Zone }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between">
      <div>
        <p className="ww-eyebrow text-plum">{ZONE_META[zone].title}</p>
        <p className="text-xs text-graphite">{ZONE_META[zone].subtitle}</p>
      </div>
    </div>
  );
}

function ZoneEmpty({ text }: { text: string }) {
  return <p className="py-2 text-xs text-mist">{text}</p>;
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
    <GarmentTile
      kind={garmentKindForItem(item)}
      color={colorToHex(item.color)}
      size={size}
      rounded={rounded}
      className={className}
    />
  );
}

function RailZone({ items, urls }: { items: WardrobeItem[]; urls: Record<string, string> }) {
  const shown = items.slice(0, 5);
  return (
    <div>
      <ZoneHead zone="hanging" />
      {shown.length === 0 ? (
        <ZoneEmpty text="No hanging pieces yet." />
      ) : (
        <div className="relative pt-3">
          {/* rail line */}
          <div className="absolute left-0 right-0 top-0 h-0.5 rounded-full bg-mist/50" aria-hidden="true" />
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {shown.map((item) => (
              <Link key={item.id} href={`/wardrobe/${item.id}`} className="flex w-16 shrink-0 flex-col items-center">
                <span className="h-3 w-px bg-mist/60" aria-hidden="true" />
                <MiniTile item={item} url={urls[item.image_path]} size={64} />
                <span className="mt-1 w-full truncate text-center text-[10px] text-graphite">{itemName(item)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShelfZone({ items, urls }: { items: WardrobeItem[]; urls: Record<string, string> }) {
  const shown = items.slice(0, 5);
  return (
    <div>
      <ZoneHead zone="folded" />
      {shown.length === 0 ? (
        <ZoneEmpty text="Nothing folded yet." />
      ) : (
        <div className="rounded-ww-sm border-y border-stone bg-ivory/40 px-1 py-2">
          <div className="flex items-end">
            {shown.map((item, i) => (
              <Link
                key={item.id}
                href={`/wardrobe/${item.id}`}
                className={cn("shrink-0", i > 0 && "-ml-2")}
                style={{ zIndex: shown.length - i }}
              >
                <MiniTile item={item} url={urls[item.image_path]} size={56} rounded="rounded-ww-xs" className="ring-2 ring-bone" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShoeZone({ items, urls }: { items: WardrobeItem[]; urls: Record<string, string> }) {
  const shown = items.slice(0, 4);
  return (
    <div>
      <ZoneHead zone="shoes" />
      {shown.length === 0 ? (
        <ZoneEmpty text="No shoes yet." />
      ) : (
        <div className="flex gap-3 border-t border-stone pt-3">
          {shown.map((item) => (
            <Link key={item.id} href={`/wardrobe/${item.id}`} className="shrink-0">
              <MiniTile item={item} url={urls[item.image_path]} size={56} className="shadow-ww-md" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function TrayZone({ items, urls }: { items: WardrobeItem[]; urls: Record<string, string> }) {
  const shown = items.slice(0, 6);
  return (
    <div>
      <ZoneHead zone="accessories" />
      {shown.length === 0 ? (
        <ZoneEmpty text="No accessories yet." />
      ) : (
        <div className="rounded-ww-md border border-hairline bg-stone/40 p-2.5">
          <div className="flex flex-wrap gap-2">
            {shown.map((item) => (
              <Link key={item.id} href={`/wardrobe/${item.id}`} className="shrink-0">
                <MiniTile item={item} url={urls[item.image_path]} size={44} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== Grid card =====================

function ItemCard({ item, url }: { item: WardrobeItem; url?: string }) {
  const occ = (item.occasion_tags ?? []).slice(0, 2) as Occasion[];
  const needsReview = item.ai_tag_status === "needs_review";
  const analyzing = item.ai_tag_status === "analyzing";

  return (
    <Link href={`/wardrobe/${item.id}`} className="group overflow-hidden rounded-ww-md border border-hairline bg-bone shadow-ww-xs">
      <div className="relative aspect-[3/4] bg-stone">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={itemName(item)}
            className="h-full w-full object-cover transition-transform group-active:scale-[0.98]"
          />
        ) : (
          <GarmentTile fill kind={garmentKindForItem(item)} color={colorToHex(item.color)} rounded="rounded-none" className="border-0" />
        )}
        {(needsReview || analyzing) && (
          <span className="absolute left-2 top-2 rounded-full bg-champagne/90 px-2 py-0.5 text-[10px] font-medium text-charcoal">
            {analyzing ? "Analyzing…" : "Needs review"}
          </span>
        )}
      </div>
      <div className="p-2.5">
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
      </div>
    </Link>
  );
}

// ===================== Empty state =====================

function EmptyState() {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="ww-display text-3xl text-charcoal">Wardrobe</h1>
          <p className="mt-1 text-sm text-graphite">Your clothes, organized for better outfit decisions.</p>
        </div>
      </div>

      {/* Soft empty Closet Board illustration */}
      <div className="mt-5 space-y-4 rounded-ww-lg border border-hairline bg-bone p-4 shadow-ww-sm" aria-hidden="true">
        <div>
          <p className="ww-eyebrow text-plum">Hanging Rail</p>
          <div className="relative mt-3 pt-3">
            <div className="absolute left-0 right-0 top-0 h-0.5 rounded-full bg-mist/40" />
            <div className="flex gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex w-16 flex-col items-center">
                  <span className="h-3 w-px bg-mist/40" />
                  <div className="h-16 w-16 rounded-ww-sm border border-dashed border-hairline-strong bg-ivory/50" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="h-px bg-stone" />
        <div>
          <p className="ww-eyebrow text-plum">Folded Shelf</p>
          <div className="mt-3 h-12 rounded-ww-sm border-y border-stone bg-ivory/40" />
        </div>
        <div className="h-px bg-stone" />
        <div>
          <p className="ww-eyebrow text-plum">Shoe Rack</p>
          <div className="mt-3 flex gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 w-14 rounded-ww-sm border border-dashed border-hairline-strong bg-ivory/50" />
            ))}
            {/* one glowing add tile */}
            <div className="grid h-14 w-14 place-items-center rounded-ww-sm border border-plum/40 bg-plum/[0.06] shadow-ww-sm">
              <Icon.Plus className="h-5 w-5 text-plum" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <p className="ww-eyebrow">Empty wardrobe</p>
        <h2 className="ww-display mt-2 text-2xl text-charcoal">Your cupboard is waiting.</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-graphite">
          Add a few everyday clothes first. WearWise will organize them into rails, shelves, shoes and accessories.
        </p>
        <div className="mx-auto mt-6 flex max-w-xs flex-col gap-2">
          <Button asChild size="lg">
            <Link href="/wardrobe/upload"><Icon.Plus className="h-4 w-4" /> Add first item</Link>
          </Button>
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-graphite">
          <Icon.Lock className="h-3 w-3" /> Your wardrobe is private by default. Delete items anytime.
        </p>
      </div>
    </div>
  );
}
