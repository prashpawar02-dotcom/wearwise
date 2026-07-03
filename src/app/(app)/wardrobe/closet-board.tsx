"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { GarmentTile } from "@/components/wearwise/GarmentTile";
import { OCCASIONS, type AvailabilityStatus, type Occasion, type WardrobeItem } from "@/lib/types";
import { cn } from "@/lib/utils";
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

type FilterKey = "all" | Zone | "in_wash" | "needs_review";

const occasionLabel = (v: string) => OCCASIONS.find((o) => o.value === v)?.label ?? v;
const itemName = (it: WardrobeItem) => it.user_facing_name ?? it.category ?? "Untagged item";
const statusOf = (it: WardrobeItem): AvailabilityStatus =>
  (it.availability_status ?? "available") as AvailabilityStatus;

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

  const inWash = useMemo(() => items.filter((i) => statusOf(i) === "in_wash"), [items]);

  // Category zones show everything except items set aside in the wash.
  const byZone = useMemo(() => {
    const m: Record<Zone, WardrobeItem[]> = { hanging: [], folded: [], occasion: [], shoes: [], accessories: [] };
    for (const it of items) {
      if (statusOf(it) === "in_wash") continue;
      m[zoneForItem(it)].push(it);
    }
    return m;
  }, [items]);

  const needsReview = useMemo(() => items.filter((i) => i.ai_tag_status === "needs_review"), [items]);
  const zonesRepresented = ZONE_ORDER.filter((z) => byZone[z].length > 0).length;

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
          ? "Add 1 accessory to unlock more complete looks."
          : null;

  const filtered = useMemo(() => {
    let list: WardrobeItem[];
    if (filter === "all") list = items;
    else if (filter === "in_wash") list = inWash;
    else if (filter === "needs_review") list = needsReview;
    else list = byZone[filter];

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
  }, [filter, query, items, inWash, needsReview, byZone]);

  if (items.length === 0) return <EmptyState />;

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: items.length },
    { key: "hanging", label: "Hanging", count: byZone.hanging.length },
    { key: "folded", label: "Folded", count: byZone.folded.length },
    { key: "occasion", label: "Occasion", count: byZone.occasion.length },
    { key: "shoes", label: "Shoes", count: byZone.shoes.length },
    { key: "accessories", label: "Accessories", count: byZone.accessories.length },
    { key: "in_wash", label: "In wash", count: inWash.length },
    { key: "needs_review", label: "Needs review", count: needsReview.length },
  ];

  return (
    <div className="space-y-5 pb-8">
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
        {inWash.length > 0 && (
          <p className="mt-1 text-sm text-graphite">
            {inWash.length} {inWash.length === 1 ? "item is" : "items are"} in the wash and excluded from today&apos;s suggestions.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-4 border-t border-stone pt-3">
          <Stat value={items.length} label="items" />
          <Stat value={zonesRepresented} label="outfit-ready zones" />
          {needsReview.length > 0 && <Stat value={needsReview.length} label="need review" tone="champagne" />}
        </div>
      </section>

      {/* Closet Board hero */}
      <section className="overflow-hidden rounded-ww-lg border border-hairline bg-bone p-4 shadow-ww-sm">
        <RailZone items={byZone.hanging} urls={urls} />
        <ZoneDivider />
        <ShelfZone items={byZone.folded} urls={urls} />
        <ZoneDivider />
        <OccasionZone items={byZone.occasion} urls={urls} />
        <ZoneDivider />
        <ShoeZone items={byZone.shoes} urls={urls} />
        <ZoneDivider />
        <TrayZone items={byZone.accessories} urls={urls} />
        {inWash.length > 0 && (
          <>
            <ZoneDivider />
            <LaundryZone items={inWash} urls={urls} />
          </>
        )}
      </section>

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

// ===================== Board zones =====================

function ZoneDivider() {
  return <div className="my-5 h-px bg-mist/40" aria-hidden="true" />;
}

function ZoneHead({ zone, action }: { zone: Zone; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <div>
        <p className="ww-eyebrow text-plum">{ZONE_META[zone].title}</p>
        <p className="text-xs text-graphite">{ZONE_META[zone].subtitle}</p>
      </div>
      {action}
    </div>
  );
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
        <p className="py-2 text-xs text-mist">No hanging pieces yet.</p>
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

function ShelfZone({ items, urls }: { items: WardrobeItem[]; urls: Record<string, string> }) {
  const shown = items.slice(0, 5);
  return (
    <div>
      <ZoneHead zone="folded" />
      {shown.length === 0 ? (
        <p className="py-2 text-xs text-mist">Nothing folded yet.</p>
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

function OccasionZone({ items, urls }: { items: WardrobeItem[]; urls: Record<string, string> }) {
  const shown = items.slice(0, 6);
  return (
    <div>
      <ZoneHead zone="occasion" />
      {shown.length === 0 ? (
        <p className="py-2 text-xs text-mist">No festive, ethnic or formal pieces yet.</p>
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

function ShoeZone({ items, urls }: { items: WardrobeItem[]; urls: Record<string, string> }) {
  const shown = items.slice(0, 4);
  return (
    <div>
      <ZoneHead zone="shoes" />
      {shown.length === 0 ? (
        <p className="py-2 text-xs text-mist">No shoes yet.</p>
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

function TrayZone({ items, urls }: { items: WardrobeItem[]; urls: Record<string, string> }) {
  const shown = items.slice(0, 6);
  return (
    <div>
      <ZoneHead
        zone="accessories"
        action={
          <Link href="/wardrobe/upload" className="shrink-0 text-xs font-medium text-plum hover:underline">
            Add accessory
          </Link>
        }
      />
      {shown.length === 0 ? (
        <div className="rounded-ww-md border border-dashed border-hairline-strong bg-stone/30 p-3">
          <p className="text-xs text-graphite">
            No accessories yet. Add a belt, watch, bag, dupatta, or jewelry to complete more looks.
          </p>
          <Button asChild size="sm" variant="secondary" className="mt-2.5">
            <Link href="/wardrobe/upload"><Icon.Plus className="h-3.5 w-3.5" /> Add accessory</Link>
          </Button>
        </div>
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

function LaundryZone({ items, urls }: { items: WardrobeItem[]; urls: Record<string, string> }) {
  const shown = items.slice(0, 8);
  return (
    <div>
      <div className="mb-3">
        <p className="ww-eyebrow text-plum">Laundry / In Wash</p>
        <p className="text-xs text-graphite">In wash · excluded from today&apos;s suggestions.</p>
      </div>
      <div className="rounded-ww-md border border-stone bg-stone/30 p-3">
        <div className="no-scrollbar flex gap-3 overflow-x-auto pr-4">
          {shown.map((item) => (
            <Link key={item.id} href={`/wardrobe/${item.id}`} className="flex w-[64px] shrink-0 flex-col items-center">
              <MiniTile item={item} url={urls[item.image_path]} size={64} className="opacity-70" />
              <span className="mt-1 w-full truncate text-center text-[10px] text-graphite">{itemName(item)}</span>
            </Link>
          ))}
        </div>
      </div>
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

function ItemCard({ item, url }: { item: WardrobeItem; url?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const occ = (item.occasion_tags ?? []).slice(0, 2) as Occasion[];
  const avail = availabilityBadge(item);
  const stateBadge = itemBadge(item);
  const worn = lastWornLabel(item);
  const status = statusOf(item);

  async function setAvailability(next: AvailabilityStatus) {
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    // Owner-scoped update; RLS also enforces ownership.
    await supabase
      .from("wardrobe_items")
      .update({ availability_status: next })
      .eq("id", item.id)
      .eq("user_id", user.id);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className={cn("overflow-hidden rounded-ww-md border border-hairline bg-bone shadow-ww-sm", status !== "available" && "opacity-95")}>
      <Link href={`/wardrobe/${item.id}`} className="group block">
        <div className="relative aspect-[4/5] bg-stone">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={itemName(item)}
              className={cn("h-full w-full object-cover transition-transform group-active:scale-[0.98]", status === "in_wash" && "opacity-80")}
            />
          ) : (
            <GarmentTile fill kind={garmentKindForItem(item)} color={colorToHex(item.color)} rounded="rounded-none" className="border-0" />
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

      {/* Availability action */}
      <div className="px-2.5 pb-2.5 pt-2">
        {status === "available" ? (
          <button
            type="button"
            onClick={() => setAvailability("in_wash")}
            disabled={busy}
            className="min-h-[40px] w-full rounded-ww-sm border border-hairline bg-ivory/60 text-xs font-medium text-graphite transition-colors hover:bg-stone/40 disabled:opacity-60"
          >
            {busy ? "…" : "Mark in wash"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setAvailability("available")}
            disabled={busy}
            className="min-h-[40px] w-full rounded-ww-sm border border-sage/40 bg-sage/10 text-xs font-medium text-[#5d7351] transition-colors hover:bg-sage/20 disabled:opacity-60"
          >
            {busy ? "…" : "Mark available"}
          </button>
        )}
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
