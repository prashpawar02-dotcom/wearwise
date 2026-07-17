import { createClient } from "@/lib/supabase/server";
import { getWeatherContext } from "@/lib/weather";
import { isWearableItem } from "@/lib/wardrobe";
import { constrainedInventoryNote, DEFAULT_WASH_CYCLE_DAYS, daysSinceDate } from "@/lib/laundry";
import { resolveTimezone, localDateISO } from "@/lib/time/timezone";
import { classifyProfileResult } from "@/lib/recommendation/profile-guard";
import { recommendOutfits } from "@/lib/engine/recommend";
import { loadEngineContext } from "@/lib/engine/loadContext";
import { resolveEngineOccasion, contextForOccasion } from "@/lib/engine/occasion";
import { engineRole } from "@/lib/engine/classify";
import { lockAndReplaceCandidates } from "@/lib/engine/swap";
import { computeInventoryFingerprint } from "@/lib/recommendation/fingerprint";
import { freshAuthoritativeColumns } from "@/lib/recommendation/persist";
import type { RecommendationResult } from "@/lib/engine/types";
import type { DailyRecommendation, Profile, WardrobeItem } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Timezone helpers now live in a pure module; re-export for existing importers.
export { userLocalDate } from "@/lib/time/timezone";

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

// A usable outfit needs at least this many pieces once assembled.
const MIN_OUTFIT_ITEMS = 2;

export type PrepareStatus = "prepared" | "exists" | "disabled" | "failed" | "error" | "setup_required";

export interface PrepareResult {
  status: PrepareStatus;
  localDate: string;
  /** Machine reason for disabled/failed/exists (e.g. 'daily_drop_disabled', 'too_few_wearable_items'). */
  reason?: string;
  /** Non-fatal warning (e.g. the default timezone was used because none was saved). */
  warning?: string;
  recommendation: DailyRecommendation | null;
}

// Either the session-scoped SSR client (manual/authenticated flow) or the
// service-role admin client (server-controlled cron flow). Both expose the same
// query surface used here; all queries are explicitly scoped by user_id.
type DbClient = SupabaseClient;



/** Auto-tag states that are safe to style with (have real metadata). */
function isUsableItem(item: WardrobeItem): boolean {
  return item.ai_tag_status !== "analyzing" && item.ai_tag_status !== "failed";
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


interface ReasoningOpts {
  core: CoreKind;
  weatherAvailable: boolean;
  weatherAdvice: string | null;
  layerIncluded: boolean;
  shoesIncluded: boolean;
  laundryExcluded: number;
  /** Honest constrained-inventory line (Phase 2); replaces the generic skip
   *  line when an occasion-critical category is mostly in the wash. */
  constrainedNote?: string | null;
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

  // Footwear-missing copy is owned by the UI reason-code map (locked decision 11),
  // never asserted here.
  // Prefer the specific constrained-inventory honesty line when the wardrobe is
  // laundry-pressured; otherwise fall back to the plain skip count.
  if (opts.constrainedNote) {
    parts.push(opts.constrainedNote);
  } else if (opts.laundryExcluded > 0) {
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
  /** Pre-computed "another option" candidates (Module B cache; ids only). */
  alt_item_ids?: string[][];
  alt_cursor?: number;
  /** Engine v2 (migration 0020): stored factor contributions + confidence. */
  confidence?: number | null;
  factor_breakdown?: Record<string, unknown> | null;
  is_dual_pick?: boolean;
  engine_version?: string | null;
  /** Authoritative metadata (migration 0026): completeness + honest reason + freshness. */
  outfit_status?: string | null;
  missing_slots?: string[];
  partial_reason?: string | null;
  inventory_fingerprint?: string | null;
  /** Phase 3 (migration 0022): swap infra. */
  swap_candidates?: Record<string, string[]>;
  base_item_ids?: string[];
  pre_swap_item_ids?: string[] | null;
  swaps_used?: number;
  options_used?: number;
}

async function upsertRecommendation(
  supabase: DbClient,
  input: UpsertInput
): Promise<DailyRecommendation | null> {
  // Reset lifecycle timestamps: a freshly (re)prepared or failed row is a new
  // state for the day, so any prior opened/worn/skipped stamps no longer apply.
  const { data, error } = await supabase
    .from("daily_recommendations")
    .upsert(
      {
        ...input,
        opened_at: null, worn_at: null, skipped_at: null,
        // Phase 3: a fresh/re-prepared drop starts the day with no swaps/options
        // used and nothing to undo. Explicit so a forced re-prepare resets caps.
        swaps_used: input.swaps_used ?? 0,
        options_used: input.options_used ?? 0,
        pre_swap_item_ids: input.pre_swap_item_ids ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,local_date" }
    )
    .select("*")
    .single();
  if (error) return null;
  return data as DailyRecommendation;
}

export async function prepareDailyDrop(
  userId: string,
  options: {
    localDate?: string;
    force?: boolean;
    /** Injected client: session client for manual, admin client for cron. */
    supabase?: DbClient;
    /** Provenance, for logging/analytics later. Does not change behavior. */
    source?: "manual" | "cron";
    /** Dashboard get-or-create: bypass the per-user notification opt-in so the
     *  Today's Drop hero always exists on the dashboard (push/cron still respect
     *  the opt-in). */
    ignoreOptIn?: boolean;
  } = {}
): Promise<PrepareResult> {
  // Default to the session-scoped server client (manual/authenticated path).
  // The cron path injects the service-role admin client. Either way, every
  // query below is explicitly scoped by userId.
  const supabase: DbClient = options.supabase ?? (createClient() as unknown as DbClient);
  const force = options.force ?? false;

  // ---- Load profile (drives timezone, opt-in, weather + quiet-gem prefs) ----
  // maybeSingle() so a zero-row read is a clean null (not a PGRST116 error), and
  // we classify the result so a QUERY FAILURE (config / RLS / JWT / PostgREST /
  // connection) is NEVER mislabelled as a missing profile (locked hardening).
  const profileRes = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const profileClass = classifyProfileResult(profileRes);
  const profile = (profileRes.data ?? null) as Profile | null;

  // Resolve timezone honestly (legacy aliases like Asia/Calcutta are normalized,
  // so a valid saved zone never triggers a false fallback warning).
  const tzInfo = resolveTimezone(profile?.timezone);
  const tzWarning = tzInfo.usedFallback ? "timezone_missing_or_invalid_default_used" : undefined;
  const localDate = options.localDate ?? localDateISO(profile?.timezone);

  if (profileClass.status === "profile_query_failed") {
    // TECHNICAL failure — retryable, never "no_profile". Safe server log only
    // (code/message/details/hint; no tokens). No timezone warning: it is a
    // symptom of the failed load, not a real zone problem.
    console.error("[prepareDailyDrop] profile query failed", {
      userId,
      code: profileRes.error?.code ?? null,
      message: profileRes.error?.message ?? null,
      details: profileRes.error?.details ?? null,
      hint: profileRes.error?.hint ?? null,
    });
    return { status: "error", localDate, reason: "profile_query_failed", recommendation: null };
  }
  if (!profile) {
    // Confirmed zero rows with no query error → the user needs setup/onboarding.
    return { status: "setup_required", localDate, reason: "profile_missing", warning: tzWarning, recommendation: null };
  }

  // ---- Opt-in gate: never prepare for a disabled user (wins over any cache),
  //      UNLESS the caller explicitly bypasses it (dashboard get-or-create). ----
  if (!profile.daily_drop_enabled && !options.ignoreOptIn) {
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

  const failWith = async (
    reason: string,
    message: string,
    result?: RecommendationResult,
  ): Promise<PrepareResult> => {
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
      // Authoritative constrained metadata so reads treat this as fresh, not "unknown".
      outfit_status: "constrained",
      missing_slots: result?.missingSlots ?? [],
      partial_reason: result?.partialReasonCode ?? null,
      inventory_fingerprint: computeInventoryFingerprint(allItems),
      engine_version: "v2",
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
  let weatherTempC: number | null = null;
  let weatherIsRaining = false;
  if (profile.weather_advice_enabled && profile.city) {
    const weather = await getWeatherContext(profile.city);
    if (weather) {
      weatherAvailable = true;
      weatherSummary = `${weather.tempC}° · ${weather.summary}`;
      weatherAdvice = weather.advice;
      weatherTempC = weather.tempC;
      weatherIsRaining = weather.category === "rainy";
    }
  }

  // ---- Resolve occasion + canonical engine context (locked decisions 3, 4) ----
  // Today generation runs through the SAME authoritative pipeline as Admin QA:
  // loadEngineContext (per-user prefs + config + live weather) under the
  // canonically-resolved occasion. No Today-only assembler remains.
  const occasion = resolveEngineOccasion(profile.default_occasion);
  const engineCtx = await loadEngineContext({
    supabase,
    userId,
    occasion,
    weather: { tempC: weatherTempC, isRaining: weatherIsRaining },
  });

  // ---- Authoritative generation via the deterministic v2 engine ----
  const result = recommendOutfits(allItems, engineCtx, 3);
  const hero = result.hero;
  if (!hero) {
    // Genuinely constrained: no complete or honest-partial outfit can be formed.
    const reason =
      result.failReason === "no_wearable_items" ? "too_few_wearable_items" : "outfit_roles_incomplete";
    const message =
      reason === "too_few_wearable_items"
        ? "Not enough wearable items right now — add clothes or mark some available to prepare an outfit."
        : "We couldn't build a full outfit from what's available today — add a top and a bottom, or a dress, then try again.";
    return failWith(reason, message, result);
  }

  const heroItems = hero.items;
  const shoesIncluded = heroItems.some((i) => engineRole(i) === "footwear");
  const layerIncluded = heroItems.some((i) => engineRole(i) === "outerwear");

  // ---- Module B: alternates are engine BACKUPS — whole valid outfits with
  // distinct cores. They may legitimately REUSE footwear/bottom (locked
  // decision 9); we never blacklist every current item.
  const altSets: string[][] = result.backups.map((b) => b.itemIds);

  // ---- Phase 3: precompute up to 5 lock-and-replace candidates per hero piece.
  const swapCandidatesMap: Record<string, string[]> = {};
  for (const it of heroItems) {
    const res = lockAndReplaceCandidates(allItems, heroItems, it, engineCtx, 5);
    swapCandidatesMap[it.id] = res.status === "ok" ? res.candidates.map((c) => c.id) : [];
  }

  // Constrained-inventory honesty line (Phase 2): once per wash-cycle.
  const occasionWordForNote = occasion === "ethnic" ? "ethnic" : "everyday";
  const rawConstrained = constrainedInventoryNote(allItems, occasionWordForNote);
  const washCycle = profile.wash_cycle_days ?? DEFAULT_WASH_CYCLE_DAYS;
  const daysSinceWashNote = daysSinceDate(profile.laundry_wash_note_at ?? null);
  const constrainedNote =
    rawConstrained && (daysSinceWashNote == null || daysSinceWashNote >= washCycle) ? rawConstrained : null;

  const fingerprint = computeInventoryFingerprint(allItems);

  const rec = await upsertRecommendation(supabase, {
    user_id: userId,
    local_date: localDate,
    status: "prepared",
    selected_item_ids: heroItems.map((i) => i.id),
    // Authoritative engine-owned metadata (locked decision 7) — never re-derived.
    ...freshAuthoritativeColumns(result, fingerprint),
    // Phase 3: precomputed swap candidates + pristine base outfit (ids only).
    swap_candidates: swapCandidatesMap,
    base_item_ids: heroItems.map((i) => i.id),
    swaps_used: 0,
    options_used: 0,
    pre_swap_item_ids: null,
    alt_item_ids: altSets,
    alt_cursor: 0,
    weather_summary: weatherSummary,
    occasion_context: contextForOccasion(occasion),
    reasoning: buildReasoning(heroItems, {
      core: null,
      weatherAvailable,
      weatherAdvice,
      layerIncluded,
      shoesIncluded,
      laundryExcluded,
      constrainedNote,
    }),
    daily_insight: buildInsight(heroItems, profile.show_quiet_gems),
    fail_reason: null,
  });

  if (!rec) {
    // The outfit was fine but the write failed — stay honest, don't fake success.
    return { status: "failed", localDate, reason: "db_error", warning: tzWarning, recommendation: null };
  }

  // Record that we surfaced the constrained note this cycle (throttle → no nag).
  if (constrainedNote) {
    await supabase
      .from("profiles")
      .update({ laundry_wash_note_at: new Date().toISOString() })
      .eq("id", userId);
  }

  return { status: "prepared", localDate, warning: tzWarning, recommendation: rec };
}
