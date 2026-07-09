// =====================================================================
// WearWise — Laundry / Availability logic (Phase 2)
// PURE and dependency-free (imports only the WardrobeItem type). Safe on the
// server, the client, and inside the esbuild-free engine test runner.
//
// This module owns the *rules* of the laundry system:
//   • the available ⇄ in_wash (+ archived) state machine transitions,
//   • the post-wear "where does this go?" smart defaults,
//   • the learned wash-cycle estimate (default 4d; dry-clean 14d),
//   • the soft auto-return timing (never a push — a quiet badge),
//   • the constrained-inventory honesty line for recommendations.
//
// COPY RULE (handbook §3.4): every user-facing string here must pass the
// flatmate test — a helpful flatmate, said once, quietly. Never a parent,
// never a chore app, no guilt, no nagging.
// =====================================================================
import type { AvailabilityStatus, WardrobeItem } from "@/lib/types";

// ---- constants -------------------------------------------------------

/** Default learned wash-cycle estimate, in days. */
export const DEFAULT_WASH_CYCLE_DAYS = 4;
/** Dry-clean / delicate categories rest longer before a return prompt. */
export const DRY_CLEAN_CYCLE_DAYS = 14;
/** "Ask me less": after this many dismissals the post-wear sheet goes silent. */
export const ASK_ME_LESS_THRESHOLD = 3;
/** >60% of an occasion-critical category in the wash triggers the honest note. */
export const CONSTRAINED_CATEGORY_RATIO = 0.6;

const DAY_MS = 86_400_000;

// Fabrics/garments that are dry-clean or delicate → a longer, gentler cycle.
const DRY_CLEAN_RE =
  /(saree|sari|lehenga|sherwani|silk|wool|woolen|woollen|velvet|leather|suede|blazer|suit|coat|trench|gown|tuxedo|dry ?clean|pashmina|chiffon|organza)/;

// Worn-next-to-skin pieces that usually need a wash after one wear.
const WASH_SUGGESTED_RE =
  /(t-?shirt|\btee\b|top|blouse|shirt|kurta|kurti|dress|innerwear|vest|camisole|legging|activewear|gym|workout|sock|\bgymwear\b)/;

// Outer / structural / drape / hard pieces that usually go back to the wardrobe.
const WARDROBE_SUGGESTED_RE =
  /(jean|denim|dupatta|stole|odhani|jacket|blazer|coat|cardigan|sweater|hoodie|overshirt|shrug|shawl|saree|sari|lehenga|sherwani|shoe|sneaker|trainer|loafer|boot|sandal|heel|jutti|mojari|flat|footwear|belt|watch|bag|clutch|purse|scarf|cap|hat|tie|jewel|necklace|earring|bangle|bracelet|accessor)/;

// ---- small helpers ---------------------------------------------------

function itemText(item: Pick<WardrobeItem, "category" | "sub_category" | "user_facing_name">): string {
  return [item.category, item.sub_category, item.user_facing_name]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" ")
    .toLowerCase();
}

/** Whole days since an ISO/date string; null when missing/invalid. */
export function daysSinceDate(dateStr?: string | null, now: Date = new Date()): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / DAY_MS);
}

// ---- state machine ---------------------------------------------------

/** States an item can hold. 'unavailable' is the legacy pre-Phase-2 value. */
export type LaundryState = AvailabilityStatus;

/** The partial row update for a transition — the single source of truth so
 *  in_wash_since is ALWAYS kept honest with the status (set on wash, cleared
 *  on return/archive). */
export interface LaundryTransition {
  availability_status: AvailabilityStatus;
  in_wash_since: string | null;
}

/** Move an item into the wash, stamping when it entered. */
export function toInWash(now: Date = new Date()): LaundryTransition {
  return { availability_status: "in_wash", in_wash_since: now.toISOString() };
}

/** Return an item to the wardrobe (clean and ready). */
export function toAvailable(): LaundryTransition {
  return { availability_status: "available", in_wash_since: null };
}

/** Archive an item (kept, but out of rotation). */
export function toArchived(): LaundryTransition {
  return { availability_status: "archived", in_wash_since: null };
}

/** One-tap toggle target used on item cards: available → in_wash → available. */
export function toggleWashTransition(
  current: AvailabilityStatus | null | undefined,
  now: Date = new Date()
): LaundryTransition {
  const s = current ?? "available";
  return s === "available" ? toInWash(now) : toAvailable();
}

/** Only 'available' items may feed recommendations (mirrors wardrobe.isWearableItem). */
export function isWearable(item: Pick<WardrobeItem, "availability_status">): boolean {
  return (item.availability_status ?? "available") === "available";
}

// ---- post-wear smart defaults ---------------------------------------

export type Disposition = "wash" | "wardrobe";

/**
 * The suggested destination for a just-worn item. Smart defaults from the
 * handbook: tees/kurtas → wash; jeans/dupattas/layers → wardrobe. Structural /
 * drape / hard pieces win over the wash suggestion (a denim jacket is a layer,
 * not a tee). Everything unknown stays in the wardrobe — we never over-launder.
 */
export function washDisposition(
  item: Pick<WardrobeItem, "category" | "sub_category" | "user_facing_name">
): Disposition {
  const t = itemText(item);
  if (WARDROBE_SUGGESTED_RE.test(t)) return "wardrobe";
  if (WASH_SUGGESTED_RE.test(t)) return "wash";
  return "wardrobe";
}

// ---- wash-cycle estimate + soft auto-return -------------------------

/** Per-item wash-cycle length: dry-clean/delicate rest longer than the base. */
export function washCycleDaysFor(
  item: Pick<WardrobeItem, "category" | "sub_category" | "user_facing_name" | "fabric">,
  baseDays: number = DEFAULT_WASH_CYCLE_DAYS
): number {
  const t = `${itemText(item)} ${(item.fabric ?? "").toLowerCase()}`;
  if (DRY_CLEAN_RE.test(t)) return DRY_CLEAN_CYCLE_DAYS;
  return baseDays;
}

/** Days an item has spent in the wash; null when not in the wash / unstamped. */
export function daysInWash(
  item: Pick<WardrobeItem, "availability_status" | "in_wash_since">,
  now: Date = new Date()
): number | null {
  if ((item.availability_status ?? "available") !== "in_wash") return null;
  return daysSinceDate(item.in_wash_since, now);
}

/**
 * True when an in-wash item has likely finished its cycle and is worth a quiet
 * "might be back?" nudge. Never a push — this only drives a badge.
 */
export function readyToReturn(
  item: Pick<WardrobeItem, "availability_status" | "in_wash_since" | "category" | "sub_category" | "user_facing_name" | "fabric">,
  baseDays: number = DEFAULT_WASH_CYCLE_DAYS,
  now: Date = new Date()
): boolean {
  const d = daysInWash(item, now);
  if (d == null) return false;
  return d >= washCycleDaysFor(item, baseDays);
}

/** How many in-wash items look ready to come back. */
export function countReadyToReturn(
  items: WardrobeItem[],
  baseDays: number = DEFAULT_WASH_CYCLE_DAYS,
  now: Date = new Date()
): number {
  return items.reduce((n, i) => (readyToReturn(i, baseDays, now) ? n + 1 : n), 0);
}

/** The quiet auto-return badge copy (flatmate test); null when nothing to say. */
export function autoReturnBadge(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "1 item might be back from laundry — mark it clean when it is."
    : `${count} items might be back from laundry — mark what's clean?`;
}

// ---- constrained-inventory honesty note (recommendations) -----------

/** Coarse core-category bucket for wash-pressure reasoning (engine-independent). */
export type CoreCategory = "top" | "bottom" | "one_piece" | "ethnic" | "footwear" | "layer" | "accessory" | "other";

export function coreCategoryOf(
  item: Pick<WardrobeItem, "category" | "sub_category" | "user_facing_name">
): CoreCategory {
  const t = itemText(item);
  if (/(saree|sari|lehenga|kurta|kurti|anarkali|sherwani|churidar|salwar|dupatta)/.test(t)) return "ethnic";
  if (/(shoe|sneaker|trainer|loafer|boot|sandal|heel|jutti|mojari|flat|footwear)/.test(t)) return "footwear";
  if (/(dress|gown|jumpsuit|saree|sari)/.test(t)) return "one_piece";
  if (/(jacket|blazer|coat|cardigan|sweater|hoodie|overshirt|shrug|shawl|outerwear)/.test(t)) return "layer";
  if (/(belt|watch|bag|clutch|purse|scarf|cap|hat|tie|jewel|necklace|earring|bangle|bracelet|accessor)/.test(t)) return "accessory";
  if (/(jean|denim|trouser|chino|pant|legging|palazzo|jogger|skirt|short|bottom)/.test(t)) return "bottom";
  if (/(t-?shirt|\btee\b|top|blouse|shirt|kurti)/.test(t)) return "top";
  return "other";
}

// Categories whose depletion actually threatens an outfit for a given occasion.
const OCCASION_CRITICAL: CoreCategory[] = ["top", "bottom", "one_piece", "ethnic"];

export interface WashPressure {
  category: CoreCategory;
  total: number;
  inWash: number;
  ratio: number;
}

/** Wash pressure per core category across the full wardrobe (in_wash / total). */
export function washPressureByCategory(items: WardrobeItem[]): WashPressure[] {
  const totals = new Map<CoreCategory, { total: number; inWash: number }>();
  for (const it of items) {
    const c = coreCategoryOf(it);
    const rec = totals.get(c) ?? { total: 0, inWash: 0 };
    rec.total += 1;
    if ((it.availability_status ?? "available") === "in_wash") rec.inWash += 1;
    totals.set(c, rec);
  }
  return [...totals.entries()].map(([category, r]) => ({
    category,
    total: r.total,
    inWash: r.inWash,
    ratio: r.total > 0 ? r.inWash / r.total : 0,
  }));
}

/**
 * One honest line when an occasion-critical category is mostly in the wash, so
 * the user understands *why* today's pick is what it is. Returns null when the
 * wardrobe isn't constrained. Never apologetic, never guilt — just the truth.
 */
export function constrainedInventoryNote(
  items: WardrobeItem[],
  occasionLabel?: string | null
): string | null {
  const pressured = washPressureByCategory(items)
    .filter((p) => OCCASION_CRITICAL.includes(p.category) && p.total >= 2 && p.ratio > CONSTRAINED_CATEGORY_RATIO)
    // Only meaningful if at least one of that category is still clean to build with.
    .filter((p) => p.inWash < p.total)
    .sort((a, b) => b.ratio - a.ratio);
  if (pressured.length === 0) return null;
  const where = occasionLabel ? `${occasionLabel.toLowerCase()} picks` : "usual picks";
  return `Most of your ${where} are in the wash — this is the best clean combination today.`;
}
