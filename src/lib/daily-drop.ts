import { createClient } from "@/lib/supabase/server";
import { getWeatherContext } from "@/lib/weather";
import { isWearableItem } from "@/lib/wardrobe";
import type { DailyRecommendation, Profile, WardrobeItem } from "@/lib/types";

/**
 * Daily Outfit Drop — server-side prepare + cache (Phase 2).
 *
 * prepareDailyDrop() builds ONE practical outfit from the user's own wearable
 * wardrobe and upserts it into daily_recommendations (one row per user per
 * local date). It is deterministic (no AI in this pass), idempotent, and never
 * fabricates an outfit — every path resolves to an honest status.
 *
 * PRIVACY: this function stores wardrobe item IDs only. It NEVER stores or
 * returns image paths or signed URLs. Signed URLs are resolved at render time
 * on the authenticated dashboard.
 *
 * NOT in this pass: cron, notifications, push, email, service-role writes.
 * It runs as the signed-in user (their Supabase session; RLS applies).
 */

// When the user has no saved timezone yet, fall back to the launch-market zone.
// (Architecture doc §4: MVP default tz; per-user tz already supported.)
const DEFAULT_TZ = "Asia/Kolkata";

// A usable outfit needs at least this many pieces once assembled.
const MIN_OUTFIT_ITEMS = 2;

export type PrepareStatus = "prepared" | "exists" | "disabled" | "failed";

export interface PrepareResult {
  status: PrepareStatus;
  localDate: string;
  /** Machine reason for disabled/failed/exists (e.g. 'daily_drop_disabled', 'too_few_wearable_items'). */
  reason?: string;
  /** Non-fatal warning (e.g. the default timezone was used because none was saved). */
  warning?: string;
  recommendation: DailyRecommendation | null;
}

type SupabaseServerClient = ReturnType<typeof createClient>;

/** True if `tz` is a valid IANA timezone the runtime understands. */
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a usable timezone. If the profile has a valid IANA zone we use it;
 * otherwise we fall back to DEFAULT_TZ and flag `usedFallback` so callers can
 * surface an honest warning. We NEVER guess from city and NEVER pretend a
 * missing/invalid zone is reliable.
 */
function resolveTimezone(tz: string | null | undefined): { timeZone: string; usedFallback: boolean } {
  if (tz && isValidTimeZone(tz)) return { timeZone: tz, usedFallback: false };
  return { timeZone: DEFAULT_TZ, usedFallback: true };
}

/** Resolve the user's LOCAL calendar date ('YYYY-MM-DD') for a timezone. */
export function userLocalDate(timezone: string | null | undefined, now: Date = new Date()): string {
  return localDateISO(timezone, now);
}

/** Resolve the user's LOCAL calendar date ('YYYY-MM-DD') for a timezone. */
function localDateISO(timezone: string | null | undefined, now: Date = new Date()): string {
  const { timeZone } = resolveTimezone(timezone);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// ---------------------------------------------------------------------------
// Role classification — readable predicates over category / sub-category /
// name / style / notes. Kept general: Western AND Indian/traditional wardrobes
// both work; nothing here is over-fit to one culture.
// ---------------------------------------------------------------------------

/** All the free-text signals we can match a garment against, lower-cased. */
function itemText(item: WardrobeItem): string {
  return [item.user_facing_name, item.sub_category, item.category, item.style, item.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isShoeLike(t: string): boolean {
  return /(footwear|shoe|heel|flat|sandal|loafer|mule|boot|sneaker|trainer|pump|espadrille|oxford|derby|ballet|jutti|juti|mojari|mojri|kolhapuri)/.test(t);
}
function isSareeLike(t: string): boolean {
  return /(saree|sari)\b/.test(t);
}
function isDressLike(t: string): boolean {
  // Western one-piece + long ethnic one-piece (anarkali, gown) that need no bottom.
  return /(dress|gown|jumpsuit|frock|maxi|midi|bodycon|shift|anarkali)/.test(t);
}
function isLayerLike(t: string): boolean {
  return /(jacket|blazer|coat|overshirt|cardigan|shrug|hoodie|sweatshirt|sweater|pullover|knit|nehru|waistcoat|gilet)/.test(t);
}
function isAccessoryLike(t: string): boolean {
  return /(belt|watch|jewel|bag|clutch|earring|stud|scarf|dupatta|stole|odhani|sunglass|necklace|bangle|tie|brooch|hat|cap|pocket square)/.test(t);
}
function isBottomLike(t: string): boolean {
  return /(jean|denim|trouser|chino|pant|legging|palazzo|skirt|jogger|short|dhoti|culotte|capri|bottom|salwar|churidar|patiala|ghagra|lehenga|sharara|garara)/.test(t);
}
function isTopLike(t: string): boolean {
  return /(top|shirt|tee|t-?shirt|blouse|kurta|kurti|tunic|camisole|cami|crop|polo|henley|choli)/.test(t);
}
/** Marks an item as ethnic/traditional — used to label the outfit + add a dupatta. */
function isTraditionalLike(t: string): boolean {
  return /(kurta|kurti|saree|sari|lehenga|choli|anarkali|sherwani|salwar|churidar|dupatta|patiala|ghagra|kalidar|angrakha|jutti|mojari|dhoti|nehru|sharara|garara|kanjivaram|banarasi)/.test(t);
}

type Role = "top" | "bottom" | "dress" | "saree" | "shoes" | "layer" | "accessory" | "other";

/**
 * Classify a wardrobe item into an outfit role. Order matters: footwear and
 * one-piece garments are checked before separates so, e.g., a "saree" is a core
 * piece and "juttis" are shoes rather than being mis-bucketed.
 */
function roleForItem(item: WardrobeItem): Role {
  const t = itemText(item);
  if (isShoeLike(t)) return "shoes";
  if (isSareeLike(t)) return "saree";
  if (/(dupatta|stole|odhani)/.test(t)) return "accessory"; // traditional drape → accessory
  if (isDressLike(t)) return "dress";
  if (isLayerLike(t)) return "layer";
  if (isBottomLike(t)) return "bottom";
  if (isTopLike(t)) return "top";
  if (isAccessoryLike(t)) return "accessory";
  return "other";
}

/** Auto-tag states that are safe to style with (have real metadata). */
function isUsableItem(item: WardrobeItem): boolean {
  return item.ai_tag_status !== "analyzing" && item.ai_tag_status !== "failed";
}

/** Least-recently-worn first (never-worn counts as longest unworn). */
function byLeastRecentlyWorn(a: WardrobeItem, b: WardrobeItem): number {
  const av = a.last_worn_at ? Date.parse(a.last_worn_at) : 0;
  const bv = b.last_worn_at ? Date.parse(b.last_worn_at) : 0;
  return av - bv;
}

function labelOf(item: WardrobeItem): string {
  return item.user_facing_name || [item.color, item.category].filter(Boolean).join(" ") || item.category || "an item";
}

/** Days since an item was last worn; null if never recorded. */
function daysSinceWorn(item: WardrobeItem): number | null {
  if (!item.last_worn_at) return null;
  return Math.floor((Date.now() - Date.parse(item.last_worn_at)) / 86_400_000);
}

/** Natural-language join: [a] -> "a"; [a,b] -> "a and b"; [a,b,c] -> "a, b, and c". */
function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

type CoreKind = "western" | "dress" | "traditional" | null;

interface OutfitPlan {
  items: WardrobeItem[];
  core: CoreKind;
  shoesAvailable: boolean;
  shoesIncluded: boolean;
  layerIncluded: boolean;
}

/**
 * Deterministically assemble one practical outfit from wearable items.
 * Handles Western (top+bottom), one-piece dresses, and traditional looks
 * (kurta+bottom(+dupatta), saree(+blouse), lehenga+choli). Least-recently-worn
 * pieces are preferred within each role.
 */
function assembleOutfit(wearable: WardrobeItem[], preferLayer: boolean): OutfitPlan {
  const buckets: Record<Role, WardrobeItem[]> = {
    top: [], bottom: [], dress: [], saree: [], shoes: [], layer: [], accessory: [], other: [],
  };
  for (const item of wearable) buckets[roleForItem(item)].push(item);
  for (const role of Object.keys(buckets) as Role[]) buckets[role].sort(byLeastRecentlyWorn);

  const chosen: WardrobeItem[] = [];
  let core: CoreKind = null;

  if (buckets.top.length > 0 && buckets.bottom.length > 0) {
    // Western separates OR traditional kurta+bottom (lehenga+choli lands here too).
    const top = buckets.top[0];
    const bottom = buckets.bottom[0];
    chosen.push(top, bottom);
    core = isTraditionalLike(itemText(top)) || isTraditionalLike(itemText(bottom)) ? "traditional" : "western";
  } else if (buckets.dress.length > 0) {
    chosen.push(buckets.dress[0]);
    core = isTraditionalLike(itemText(buckets.dress[0])) ? "traditional" : "dress";
  } else if (buckets.saree.length > 0) {
    chosen.push(buckets.saree[0]);
    core = "traditional";
    if (buckets.top.length > 0) chosen.push(buckets.top[0]); // saree blouse if present
  }

  const shoesAvailable = buckets.shoes.length > 0;
  let shoesIncluded = false;
  let layerIncluded = false;

  if (core) {
    if (shoesAvailable) {
      chosen.push(buckets.shoes[0]);
      shoesIncluded = true;
    }
    // Layer only when weather suggests it (cool/rainy/windy).
    if (preferLayer && buckets.layer.length > 0) {
      chosen.push(buckets.layer[0]);
      layerIncluded = true;
    }
    // Accessory: don't force a weak one. For traditional looks, a dupatta/stole
    // genuinely completes the outfit, so add it when present.
    if (core === "traditional") {
      const drape = buckets.accessory.find((a) => /(dupatta|stole|odhani)/.test(itemText(a)));
      if (drape && !chosen.includes(drape)) chosen.push(drape);
    }
  }

  return { items: chosen, core, shoesAvailable, shoesIncluded, layerIncluded };
}

interface ReasoningOpts {
  core: CoreKind;
  weatherAvailable: boolean;
  weatherAdvice: string | null;
  layerIncluded: boolean;
  shoesIncluded: boolean;
  laundryExcluded: number;
}

/** Build honest, specific "why it works" copy from the real chosen items. */
function buildReasoning(items: WardrobeItem[], opts: ReasoningOpts): string {
  const list = joinLabels(items.map(labelOf));
  const parts: string[] = [`This look pairs ${list}, all available in your wardrobe right now.`];

  if (opts.weatherAvailable) {
    if (opts.layerIncluded) {
      parts.push(opts.weatherAdvice ? `It's cooler out, so a layer was added — ${lower(opts.weatherAdvice)}` : "It's cooler out, so a layer was added.");
    } else if (opts.weatherAdvice) {
      parts.push(opts.weatherAdvice);
    }
  } else {
    parts.push("Weather isn't available right now, so this is based on your wardrobe and the day.");
  }

  if (!opts.shoesIncluded) {
    parts.push("No footwear was available, so add a pair of shoes to finish it.");
  }
  if (opts.laundryExcluded > 0) {
    parts.push(`${opts.laundryExcluded} item${opts.laundryExcluded === 1 ? "" : "s"} in the wash ${opts.laundryExcluded === 1 ? "was" : "were"} skipped.`);
  }
  return parts.join(" ");
}

function lower(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** One calm insight line from real signals (respects the quiet-gems preference). */
function buildInsight(items: WardrobeItem[], showQuietGems: boolean): string {
  if (showQuietGems) {
    const gem = items
      .map((i) => ({ i, d: daysSinceWorn(i) }))
      .filter((x) => x.d === null || x.d >= 21)
      .sort((a, b) => (b.d ?? 9999) - (a.d ?? 9999))[0];
    if (gem) {
      const name = labelOf(gem.i);
      return gem.d === null
        ? `Brings back ${name}, which you haven't worn yet — a fresh way to use your wardrobe.`
        : `Brings back ${name}, quiet for ${gem.d} days — a good day to wear it again.`;
    }
  }
  return `A fresh combination from ${items.length} of your wearable pieces.`;
}

/** Rows persisted to daily_recommendations (item IDs only — never URLs). */
interface UpsertInput {
  user_id: string;
  local_date: string;
  status: DailyRecommendation["status"];
  selected_item_ids: string[];
  weather_summary: string | null;
  occasion_context: string;
  reasoning: string | null;
  daily_insight: string | null;
  fail_reason: string | null;
}

async function upsertRecommendation(
  supabase: SupabaseServerClient,
  input: UpsertInput
): Promise<DailyRecommendation | null> {
  // Reset lifecycle timestamps: a freshly (re)prepared or failed row is a new
  // state for the day, so any prior opened/worn/skipped stamps no longer apply.
  const { data, error } = await supabase
    .from("daily_recommendations")
    .upsert(
      { ...input, opened_at: null, worn_at: null, skipped_at: null, updated_at: new Date().toISOString() },
      { onConflict: "user_id,local_date" }
    )
    .select("*")
    .single();
  if (error) return null;
  return data as DailyRecommendation;
}

export async function prepareDailyDrop(
  userId: string,
  options: { localDate?: string; force?: boolean } = {}
): Promise<PrepareResult> {
  const supabase = createClient();
  const force = options.force ?? false;

  // ---- Load profile (drives timezone, opt-in, weather + quiet-gem prefs) ----
  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", userId).single();
  const profile = profileData as Profile | null;

  // Resolve timezone honestly: use the saved zone if valid, else a fallback
  // that is flagged as a warning (never silently pretend it's reliable).
  const tzInfo = resolveTimezone(profile?.timezone);
  const tzWarning = tzInfo.usedFallback ? "timezone_missing_or_invalid_default_used" : undefined;
  const localDate = options.localDate ?? localDateISO(profile?.timezone);

  if (!profile) {
    return { status: "failed", localDate, reason: "no_profile", warning: tzWarning, recommendation: null };
  }

  // ---- Opt-in gate: never prepare for a disabled user (wins over any cache) ----
  if (!profile.daily_drop_enabled) {
    return { status: "disabled", localDate, reason: "daily_drop_disabled", warning: tzWarning, recommendation: null };
  }

  // ---- Idempotency: return the existing row unless forced ----
  const { data: existing } = await supabase
    .from("daily_recommendations")
    .select("*")
    .eq("user_id", userId)
    .eq("local_date", localDate)
    .maybeSingle();

  if (existing && !force) {
    const rec = existing as DailyRecommendation;
    return {
      status: rec.status === "failed" ? "failed" : "exists",
      localDate,
      reason: rec.fail_reason ?? undefined,
      warning: tzWarning,
      recommendation: rec,
    };
  }

  // ---- Load wardrobe ----
  const { data: itemData } = await supabase.from("wardrobe_items").select("*").eq("user_id", userId);
  const allItems = (itemData ?? []) as WardrobeItem[];

  const failWith = async (reason: string, message: string): Promise<PrepareResult> => {
    const rec = await upsertRecommendation(supabase, {
      user_id: userId,
      local_date: localDate,
      status: "failed",
      selected_item_ids: [],
      weather_summary: null,
      occasion_context: "daily",
      reasoning: message,
      daily_insight: null,
      fail_reason: reason,
    });
    return { status: "failed", localDate, reason, warning: tzWarning, recommendation: rec };
  };

  if (allItems.length === 0) {
    return failWith("no_wardrobe", "No clothes yet — add a few pieces to get your first outfit.");
  }

  // Exclude in-wash / unavailable and un-taggable (analyzing/failed) items.
  const wearable = allItems.filter((i) => isWearableItem(i) && isUsableItem(i));
  const laundryExcluded = allItems.filter((i) => !isWearableItem(i)).length;

  if (wearable.length < MIN_OUTFIT_ITEMS) {
    return failWith(
      "too_few_wearable_items",
      "Not enough wearable items right now — add clothes or mark some available to prepare an outfit."
    );
  }

  // ---- Weather (only if enabled + city set; optional, never blocks) ----
  let weatherSummary: string | null = null;
  let weatherAdvice: string | null = null;
  let weatherAvailable = false;
  let preferLayer = false;
  if (profile.weather_advice_enabled && profile.city) {
    const weather = await getWeatherContext(profile.city);
    if (weather) {
      weatherAvailable = true;
      weatherSummary = `${weather.tempC}° · ${weather.summary}`;
      weatherAdvice = weather.advice;
      preferLayer = weather.category === "rainy" || weather.category === "windy" || weather.tempC < 20;
    }
  }

  // ---- Assemble a practical outfit ----
  const plan = assembleOutfit(wearable, preferLayer);

  if (!plan.core) {
    return failWith(
      "outfit_roles_incomplete",
      "Couldn't build a complete outfit from what's available — add a top and a bottom, or a dress, then try again."
    );
  }
  if (plan.items.length < MIN_OUTFIT_ITEMS) {
    // A lone core piece with nothing to complete it. If the only gap is shoes,
    // say so specifically; otherwise it's a general roles gap.
    if (!plan.shoesAvailable) {
      return failWith("no_footwear_available", "Add a pair of shoes (or a few more pieces) to complete today's outfit.");
    }
    return failWith("outfit_roles_incomplete", "Add a few more wearable pieces to complete today's outfit.");
  }

  const rec = await upsertRecommendation(supabase, {
    user_id: userId,
    local_date: localDate,
    status: "prepared",
    selected_item_ids: plan.items.map((i) => i.id),
    weather_summary: weatherSummary,
    occasion_context: plan.core === "traditional" ? "traditional" : "daily",
    reasoning: buildReasoning(plan.items, {
      core: plan.core,
      weatherAvailable,
      weatherAdvice,
      layerIncluded: plan.layerIncluded,
      shoesIncluded: plan.shoesIncluded,
      laundryExcluded,
    }),
    daily_insight: buildInsight(plan.items, profile.show_quiet_gems),
    fail_reason: null,
  });

  if (!rec) {
    // The outfit was fine but the write failed — stay honest, don't fake success.
    return { status: "failed", localDate, reason: "db_error", warning: tzWarning, recommendation: null };
  }

  return { status: "prepared", localDate, warning: tzWarning, recommendation: rec };
}
