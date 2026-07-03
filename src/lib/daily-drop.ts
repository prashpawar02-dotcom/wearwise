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
  /** Machine reason for disabled/failed/exists (e.g. 'daily_drop_disabled', 'too_few_items'). */
  reason?: string;
  recommendation: DailyRecommendation | null;
}

type SupabaseServerClient = ReturnType<typeof createClient>;

/** Resolve the user's LOCAL calendar date ('YYYY-MM-DD') for a timezone. */
export function userLocalDate(timezone: string | null | undefined, now: Date = new Date()): string {
  return localDateISO(timezone, now);
}

/** Resolve the user's LOCAL calendar date ('YYYY-MM-DD') for a timezone. */
function localDateISO(timezone: string | null | undefined, now: Date = new Date()): string {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  try {
    return fmt(timezone || DEFAULT_TZ);
  } catch {
    return fmt(DEFAULT_TZ);
  }
}

type Role = "top" | "bottom" | "dress" | "shoes" | "layer" | "accessory" | "other";

/** Classify a wardrobe item into an outfit role from its category/sub-category. */
function roleForItem(item: WardrobeItem): Role {
  const c = `${item.sub_category ?? ""} ${item.category ?? ""}`.toLowerCase();
  if (/(saree|sari|gown|dress|anarkali|lehenga|jumpsuit)/.test(c)) return "dress";
  if (/(footwear|shoe|heel|flat|sandal|loafer|mule|boot|sneaker|trainer)/.test(c)) return "shoes";
  if (/(jean|denim|trouser|chino|pant|legging|palazzo|skirt|jogger|short|bottom)/.test(c)) return "bottom";
  if (/(outerwear|jacket|blazer|coat|overshirt|cardigan)/.test(c)) return "layer";
  if (/(belt|watch|accessory|jewel|bag|clutch|earring|stud|scarf|dupatta|sunglass)/.test(c)) return "accessory";
  if (/(top|shirt|tee|t-?shirt|blouse|kurta|kurti|sweater|knit|pullover|tunic)/.test(c)) return "top";
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

interface OutfitPlan {
  items: WardrobeItem[];
  hasCore: boolean; // top+bottom or a dress present
}

/** Deterministically assemble one practical outfit from wearable items. */
function assembleOutfit(wearable: WardrobeItem[], preferLayer: boolean): OutfitPlan {
  const buckets: Record<Role, WardrobeItem[]> = {
    top: [], bottom: [], dress: [], shoes: [], layer: [], accessory: [], other: [],
  };
  for (const item of wearable) buckets[roleForItem(item)].push(item);
  for (const role of Object.keys(buckets) as Role[]) buckets[role].sort(byLeastRecentlyWorn);

  const chosen: WardrobeItem[] = [];
  const haveTopBottom = buckets.top.length > 0 && buckets.bottom.length > 0;

  if (haveTopBottom) {
    chosen.push(buckets.top[0], buckets.bottom[0]);
  } else if (buckets.dress.length > 0) {
    chosen.push(buckets.dress[0]);
  }

  const hasCore = chosen.length > 0;
  if (hasCore) {
    if (buckets.shoes.length > 0) chosen.push(buckets.shoes[0]);
    if (preferLayer && buckets.layer.length > 0) chosen.push(buckets.layer[0]);
    if (buckets.accessory.length > 0) chosen.push(buckets.accessory[0]);
    // If we still only have a lone dress, try to round it out with a layer.
    if (chosen.length < MIN_OUTFIT_ITEMS && buckets.layer.length > 0 && !chosen.includes(buckets.layer[0])) {
      chosen.push(buckets.layer[0]);
    }
  }

  return { items: chosen, hasCore };
}

/** Build honest "why it works" copy from the real chosen items + weather. */
function buildReasoning(items: WardrobeItem[], weatherAdvice: string | null): string {
  const labels = items.map(labelOf);
  let base: string;
  if (labels.length >= 2) {
    base = `${labels[0]} with ${labels.slice(1).join(", ")} — an easy, put-together look from pieces you already own.`;
  } else if (labels.length === 1) {
    base = `${labels[0]} — a simple, ready-to-wear choice from your wardrobe.`;
  } else {
    base = "A practical look from your wardrobe.";
  }
  return weatherAdvice
    ? `${base} ${weatherAdvice}`
    : `${base} Weather is unavailable right now, so this is based on your wardrobe and the day.`;
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
  const { data, error } = await supabase
    .from("daily_recommendations")
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "user_id,local_date" })
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

  const localDate = options.localDate ?? localDateISO(profile?.timezone);

  if (!profile) {
    return { status: "failed", localDate, reason: "no_profile", recommendation: null };
  }

  // ---- Opt-in gate: never prepare for a disabled user ----
  if (!profile.daily_drop_enabled) {
    return { status: "disabled", localDate, reason: "daily_drop_disabled", recommendation: null };
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
    return { status: "failed", localDate, reason, recommendation: rec };
  };

  if (allItems.length === 0) {
    return failWith("no_wardrobe", "No clothes yet — add a few pieces to get tomorrow's outfit.");
  }

  // Exclude in-wash / unavailable and un-taggable (analyzing/failed) items.
  const wearable = allItems.filter((i) => isWearableItem(i) && isUsableItem(i));
  if (wearable.length < MIN_OUTFIT_ITEMS) {
    return failWith(
      "too_few_items",
      "Not enough wearable items right now — add clothes or mark some available to improve tomorrow's pick."
    );
  }

  // ---- Weather (only if enabled + city set; optional, never blocks) ----
  let weatherSummary: string | null = null;
  let weatherAdvice: string | null = null;
  let preferLayer = false;
  if (profile.weather_advice_enabled && profile.city) {
    const weather = await getWeatherContext(profile.city);
    if (weather) {
      weatherSummary = `${weather.tempC}° · ${weather.summary}`;
      weatherAdvice = weather.advice;
      preferLayer = weather.category === "rainy" || weather.category === "windy" || weather.tempC < 20;
    }
  }

  // ---- Assemble a practical outfit ----
  const plan = assembleOutfit(wearable, preferLayer);
  if (!plan.hasCore || plan.items.length < MIN_OUTFIT_ITEMS) {
    return failWith(
      "too_few_items",
      "Couldn't build a full outfit from what's available — add a top, bottom, or shoes to unlock daily picks."
    );
  }

  const rec = await upsertRecommendation(supabase, {
    user_id: userId,
    local_date: localDate,
    status: "prepared",
    selected_item_ids: plan.items.map((i) => i.id),
    weather_summary: weatherSummary,
    occasion_context: "daily",
    reasoning: buildReasoning(plan.items, weatherAdvice),
    daily_insight: buildInsight(plan.items, profile.show_quiet_gems),
    fail_reason: null,
  });

  if (!rec) {
    // The outfit was fine but the write failed — stay honest, don't fake success.
    return { status: "failed", localDate, reason: "db_error", recommendation: null };
  }

  return { status: "prepared", localDate, recommendation: rec };
}
