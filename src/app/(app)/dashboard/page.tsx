import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signWardrobePaths } from "@/lib/images";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/Icon";
import type { WardrobeItem, DailyRecommendation } from "@/lib/types";
import { getWeatherContext, type WeatherContext } from "@/lib/weather";
import { userLocalDate, prepareDailyDrop } from "@/lib/daily-drop";
import { capState } from "@/lib/swap-caps";
import { validateOutfitCurrent } from "@/lib/outfit-validity";
import { computeInventoryFingerprint } from "@/lib/recommendation/fingerprint";
import { swapSlot, slotLabel } from "@/lib/engine/swap";
import { logAppEvent } from "@/lib/events";
import { DailyDropCard, type DailyDropView } from "./daily-drop-card";
import { qualifyingTodayGem, todayGemNote, gemShownKey } from "@/lib/wardrobe/today-gem";
import { constrainedCopy, isThinWardrobe, type BlockedReason } from "@/lib/recommendation/constrained-copy";
import { PrepareDropButton } from "./prepare-drop-button";
import { StreakFlame } from "@/components/wearwise/StreakFlame";
import { ViewBeacon } from "@/components/wearwise/ViewBeacon";
import { Screen } from "@/components/shell/Screen";
import { ContextStrip } from "@/components/shell/ContextStrip";

export const dynamic = "force-dynamic"; // per-user signed URLs; never cache

/**
 * Today (Phase 4B "Today v2") — the focused mobile Today screen, built on
 * the Phase 4A shell primitives (Screen/ContextStrip). Required hierarchy:
 * compact header -> context strip (date/weather/occasion) -> ONE Today's
 * Drop hero -> primary action -> secondary actions -> Why This Works -> one
 * supporting insight -> bottom nav (via Screen). No wardrobe analytics, no
 * recent-requests list, no quick-stats grid here anymore — see IDEAS.md for
 * where that content is meant to resurface (Wardrobe/Style Me, Phase 5/6).
 */
export default async function DashboardPage() {
  const { user, supabase, profile } = await requireProfile();
  if (!profile?.onboarded) redirect("/onboarding");

  const [
    { count: itemCount },
    { data: streakRow },
  ] = await Promise.all([
    supabase.from("wardrobe_items").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    // Streak (Module C) — read-own via RLS; check-in happens client-side.
    supabase.from("streaks").select("current_count").eq("user_id", user.id).maybeSingle(),
  ]);

  const items = itemCount ?? 0;
  const firstName = profile?.full_name?.split(" ")[0];
  const initial = (firstName ?? "W").charAt(0).toUpperCase();

  // Honest weather context (null when no API key or no city).
  const weather = await getWeatherContext(profile?.city);

  // Single-Hero contract: the dashboard ALWAYS ensures exactly one Today's Drop
  // (get-or-create + validate), independent of the cron and of the notification
  // opt-in. It never falls back to the legacy pick card. One create/regenerate
  // attempt per request; fail closed to an honest constrained state otherwise.
  const todayDrop = await ensureTodayDrop(user.id, profile?.timezone ?? null, supabase, items);
  // A genuinely absent profile routes to onboarding (never a wardrobe dead-end).
  if (todayDrop.setupRequired) redirect("/onboarding");

  // One state label for telemetry — never rendered, just makes today_viewed /
  // today_constrained_viewed comparable across users (§ Phase 4B telemetry).
  const state = todayDrop.technical
    ? "technical"
    : !todayDrop.view
      ? (todayDrop.needsWardrobe ? "needs_wardrobe" : "constrained")
      : todayDrop.view.missingSlots.length > 0
        ? "partial"
        : "complete";

  return (
    <Screen
      contextStrip={
        <ContextStrip>
          <span className="ww-eyebrow text-graphite">{dateLabel()}</span>
          <span aria-hidden="true" className="text-mist">·</span>
          <WeatherChip weather={weather} />
          {todayDrop.view?.occasionContext && (
            <>
              <span aria-hidden="true" className="text-mist">·</span>
              <span className="truncate text-graphite">{capitalize(todayDrop.view.occasionContext)}</span>
            </>
          )}
        </ContextStrip>
      }
    >
      <ViewBeacon event="today_viewed" props={{ state, item_count: items }} />

      {/* Compact header: greeting + streak + avatar, one row */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <h1 className="ww-display text-[1.5rem] leading-tight text-charcoal">
          {greeting()},{" "}
          <em className="text-plum">{firstName ? `${firstName}.` : "there."}</em>
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <StreakFlame initialCount={streakRow?.current_count ?? 0} />
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone font-serif text-sm text-charcoal"
          >
            {initial}
          </span>
        </div>
      </div>

      {/* SINGLE PRIMARY RECOMMENDATION — Today's Drop, and only Today's Drop.
          The legacy pick render path has been removed from the dashboard
          so two heroes can never compete. When no valid drop can be formed we
          show one honest constrained state (or the build-wardrobe onboarding) —
          never the legacy pick card. */}
      {todayDrop.view ? (
        <DailyDropCard drop={todayDrop.view} postwearEnabled={profile?.postwear_sheet_enabled ?? true} />
      ) : todayDrop.needsWardrobe ? (
        <>
          <ViewBeacon event="today_constrained_viewed" props={{ reason: "needs_wardrobe", item_count: items }} />
          <Card className="mt-5 border-plum/20 bg-plum/[0.05] p-5">
            <p className="font-medium text-charcoal">Build your wardrobe first</p>
            <p className="mt-1 text-sm text-graphite">
              Add at least 10 items so WearWise can prepare your daily outfit. You have {items} so far.
            </p>
            <Button asChild className="mt-4" size="full">
              <Link href="/wardrobe/upload"><Icon.Plus className="h-4 w-4" /> Add clothes to get your first outfit</Link>
            </Button>
          </Card>
        </>
      ) : todayDrop.technical ? (
        <>
          <ViewBeacon event="today_constrained_viewed" props={{ reason: "technical", item_count: items }} />
          <Card className="mt-5 border-champagne/30 bg-champagne/[0.08] p-4">
            <p className="font-medium text-charcoal">Something went wrong on our side</p>
            <p className="mt-1 text-sm text-graphite">
              We couldn&apos;t load your profile just now — this is a temporary problem, not your wardrobe. Please try again in a moment.
            </p>
            <PrepareDropButton compact />
          </Card>
        </>
      ) : (
        <>
          <ViewBeacon event="today_constrained_viewed" props={{ reason: "failed", item_count: items }} />
          <Card className="mt-5 border-champagne/30 bg-champagne/[0.08] p-4">
            <p className="font-medium text-charcoal">We couldn&apos;t prepare today&apos;s outfit</p>
            <p className="mt-1 text-sm text-graphite">
              {todayDrop.failed ?? "We couldn't prepare today's outfit from your available wardrobe."}
            </p>
            {/* Retry — regenerates from current available inventory (no legacy fallback). */}
            <PrepareDropButton compact />
          </Card>
        </>
      )}
    </Screen>
  );
}

function WeatherChip({ weather }: { weather: WeatherContext | null }) {
  const rainy = weather?.category === "rainy" || weather?.category === "humid" || weather?.category === "windy";
  const WIcon = rainy ? Icon.Cloud : Icon.Sun;
  return (
    <span className="inline-flex min-w-0 items-center gap-1 truncate">
      <WIcon className={`h-3.5 w-3.5 shrink-0 ${weather ? "text-champagne" : "text-mist"}`} />
      <span className="truncate text-graphite">
        {weather ? `${weather.tempC}° · ${weather.summary}` : "Weather unavailable"}
      </span>
    </span>
  );
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function dateLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

// ===================== Today's Drop (single-hero get-or-create) =====================

/** Map a generation failure to the dashboard's ONE honest constrained state.
 *  Thin/empty wardrobe -> onboarding (needsWardrobe); anything else -> retryable. */
function constrainedResult(
  reason: string | undefined,
  itemCount: number,
  message?: string,
  blocked?: { names: string[]; reason: BlockedReason | null },
): { failed: string; needsWardrobe?: boolean } {
  if (isThinWardrobe(reason, itemCount)) {
    return { failed: "Add a few clothes and your daily outfit will appear here.", needsWardrobe: true };
  }
  // Honest: WHAT became unusable + WHY no replacement exists (engine reason).
  return {
    failed: constrainedCopy({
      failReason: reason,
      message,
      blockedNames: blocked?.names,
      blockedReason: blocked?.reason ?? null,
    }),
  };
}

/**
 * Read today's cached daily_recommendation for the user's local date and shape
 * it for the client card. Signs private image paths at render time (never
 * stored). Returns { view } for a usable drop, { failed } for an honest
 * failure message, or null when there is no drop for today.
 */
async function ensureTodayDrop(
  userId: string,
  timezone: string | null,
  supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"],
  itemCount: number,
): Promise<{ view?: DailyDropView; failed?: string; needsWardrobe?: boolean; technical?: boolean; setupRequired?: boolean }> {
  const localDate = userLocalDate(timezone);
  const [{ data }, { data: invRows }] = await Promise.all([
    supabase
      .from("daily_recommendations")
      .select("*")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .maybeSingle(),
    // Minimal columns for the canonical inventory fingerprint (locked decision 5).
    supabase
      .from("wardrobe_items")
      .select("id, availability_status, category, sub_category, cultural_tag, formality, ai_tag_status, occasion_tags, user_facing_name")
      .eq("user_id", userId),
  ]);
  const currentFingerprint = computeInventoryFingerprint((invRows ?? []) as WardrobeItem[]);

  // ---------------------------------------------------------------------------
  // SINGLE-WRITE CONTRACT (Phase 3 hotfix 4): a dashboard request performs AT
  // MOST ONE write-producing recommendation action — either ONE create (missing
  // row) OR ONE regenerate (pre-existing stale row), never both. `writeAttempted`
  // makes this explicit and guards against future refactors. A newly created or
  // regenerated outfit is STILL validated below (validation is never skipped); if
  // it lost the create/validate race and is stale, the request FAILS CLOSED
  // rather than writing a second time.
  // ---------------------------------------------------------------------------
  let blockedFromStale: { names: string[]; reason: BlockedReason | null } | undefined;
  let rec = (data as DailyRecommendation | null) ?? null;
  let source: "existing" | "created" | "regenerated" = rec ? "existing" : "created";
  let writeAttempted = false;

  if (!rec) {
    // MISSING ROW -> exactly one create. Idempotent upsert on (user_id, local_date).
    writeAttempted = true;
    const created = await prepareDailyDrop(userId, { supabase, ignoreOptIn: true });
    if (created.status === "error") return { technical: true };        // retryable, NOT wardrobe
    if (created.status === "setup_required") return { setupRequired: true };
    if (!created.recommendation) return constrainedResult(created.reason, itemCount);
    rec = created.recommendation;
  } else {
    // FRESHNESS POLICY (locked decision 5) — regenerate AT MOST once when:
    //  A) a selected item is no longer valid (availability/hard-filter); OR
    //  B) the stored result is partial/constrained/failed AND the canonical
    //     inventory fingerprint changed (covers upload/restore/retag/delete for
    //     EVERY slot — no footwear special case); OR
    //  (migration) the row predates authoritative metadata (unknown status).
    // A COMPLETE row whose selected items all remain valid is NEVER replaced just
    // because an unrelated item was added (policy C — no churn).
    const existingIds = rec.selected_item_ids ?? [];
    let selectedInvalid = false;
    if (rec.status !== "failed" && existingIds.length > 0) {
      const v = await validateOutfitCurrent(supabase, userId, existingIds);
      selectedInvalid = !v.valid;
      if (!v.valid && v.invalid.length > 0) {
        // Owner-private garment names, used ONLY for on-screen copy (never analytics).
        const nameById = new Map(
          ((invRows ?? []) as WardrobeItem[]).map((r) => [r.id, r.user_facing_name ?? r.category ?? "piece"]),
        );
        blockedFromStale = {
          names: v.invalid.map((iv) => String(nameById.get(iv.itemId) ?? "piece")),
          reason: v.invalid[0].reason as BlockedReason,
        };
      }
    }
    const authorityUnknown = rec.outfit_status == null;
    const nonComplete =
      rec.status === "failed" || rec.outfit_status === "partial" || rec.outfit_status === "constrained";
    const staleByFingerprint = nonComplete && rec.inventory_fingerprint !== currentFingerprint;

    if (!writeAttempted && (selectedInvalid || authorityUnknown || staleByFingerprint)) {
      writeAttempted = true;
      await logAppEvent("stale_outfit_blocked", userId, {
        surface: "daily_drop",
        reason: selectedInvalid ? "selected_invalid" : staleByFingerprint ? "inventory_changed" : "authority_unknown",
      });
      // ignoreOptIn: the Today hero must regenerate regardless of the PUSH
      // notification opt-in (the create path already bypasses it). Without this
      // a user with daily_drop_enabled=false got status:"disabled" + NO write,
      // silently leaving the stale outfit on screen.
      const regenerated = await prepareDailyDrop(userId, { force: true, supabase, ignoreOptIn: true });
      await logAppEvent("stale_outfit_regenerated", userId, { status: regenerated.status });
      // Honest handling of non-writing outcomes (never silently keep the stale row).
      if (regenerated.status === "error") return { technical: true };
      if (regenerated.status === "setup_required") return { setupRequired: true };
      if (regenerated.recommendation) { rec = regenerated.recommendation; source = "regenerated"; }
    }
  }

  if (rec.status === "failed") {
    return constrainedResult(rec.fail_reason ?? undefined, itemCount, rec.reasoning ?? undefined, blockedFromStale);
  }

  // FINAL availability validation — ALWAYS runs on the selected IDs for existing,
  // created, AND regenerated results (never skipped for a freshly created row).
  // A created/regenerated outfit that became stale during the create/validate
  // race FAILS CLOSED here; it is NOT regenerated again (writeAttempted spent).
  const ids = rec.selected_item_ids ?? [];
  const validity = await validateOutfitCurrent(supabase, userId, ids);
  if (ids.length === 0 || !validity.valid) {
    if (source !== "existing") {
      await logAppEvent("stale_outfit_blocked", userId, {
        surface: `daily_drop_${source}`, reason: validity.invalid[0]?.reason ?? "stale",
      });
    }
    return constrainedResult(rec.fail_reason ?? undefined, itemCount, rec.reasoning ?? undefined, blockedFromStale);
  }

  const members: WardrobeItem[] = validity.items;
  const byId = new Map(members.map((m) => [m.id, m]));
  const urls = await signWardrobePaths(members.map((m) => m.image_path));

  const items = ids
    .map((id) => byId.get(id))
    .filter((m): m is WardrobeItem => Boolean(m))
    .map((m) => {
      const sl = swapSlot(m);
      return {
        id: m.id,
        label: m.user_facing_name ?? m.category ?? "Item",
        sub: [m.category, m.color].filter(Boolean).join(" · ") || null,
        image: urls[m.image_path] ?? null,
        lastWornAt: m.last_worn_at,
        category: m.category,
        slot: sl ? slotLabel(sl) : null,
      };
    });

  // If every item from today's pick has since been deleted, don't show an empty
  // card — surface an honest, non-blaming note instead.
  if (ids.length > 0 && items.length === 0) {
    return {
      failed:
        "Some pieces from today's pick are no longer in your wardrobe. Prepare a fresh outfit to update it.",
    };
  }

  // Phase 3: Why-This-Works lines come straight from the stored scoring
  // factors (1:1, never free-generated). Cap snapshot + undo availability drive
  // the SwapSheet. A "session" ~= a drop day, so the row count is the ordinal.
  const factor = (rec.factor_breakdown ?? {}) as { whyThisWorks?: unknown };
  const whyThisWorks = Array.isArray(factor.whyThisWorks)
    ? (factor.whyThisWorks as unknown[]).filter((w): w is string => typeof w === "string").slice(0, 3)
    : [];
  const { count: dropCount } = await supabase
    .from("daily_recommendations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const capS = capState({
    swapsUsed: rec.swaps_used ?? 0,
    optionsUsed: rec.options_used ?? 0,
    sessionOrdinal: dropCount ?? 1,
  });
  const cap = {
    swapRemaining: Number.isFinite(capS.swapRemaining) ? capS.swapRemaining : null,
    optionRemaining: Number.isFinite(capS.optionRemaining) ? capS.optionRemaining : null,
    sessionExempt: capS.sessionExempt,
  };
  const hasUndo = Array.isArray(rec.pre_swap_item_ids) && rec.pre_swap_item_ids.length > 0;

  // Phase 4: authoritative completeness comes from the engine-persisted columns
  // (locked decision 7), NEVER inferred from the item list. Slot labels for the
  // UI badge map footwear -> "Shoes".
  const missingSlots = (rec.missing_slots ?? []).map((slot) =>
    slot === "footwear" ? "Shoes" : slot.charAt(0).toUpperCase() + slot.slice(1)
  );
  const partialReason = rec.partial_reason ?? null;

  // Today Quiet-Gem (F2/F4): ONLY on a COMPLETE authoritative outfit that passed
  // the final validation above; participation is proven by membership in this
  // validated outfit. Cooling / unavailable / review-blocked gems are excluded
  // by qualifyingTodayGem. Never reuses the Wardrobe page's gem result.
  const gemCooldownUntil: Record<string, string | null> = {};
  for (const m of members) if (m.gem_cooldown_until) gemCooldownUntil[m.id] = m.gem_cooldown_until;
  const todayGem =
    rec.outfit_status === "complete" && missingSlots.length === 0
      ? qualifyingTodayGem({ outfitItemIds: ids, outfitComplete: true, items: members, now: new Date(), cooldownUntil: gemCooldownUntil })
      : null;
  const gem = todayGem
    ? { itemId: todayGem.id, note: todayGemNote(todayGem, new Date()), renderKey: gemShownKey(rec.id, ids, todayGem.id) }
    : null;

  const view: DailyDropView = {
    id: rec.id,
    status: rec.status,
    occasionContext: rec.occasion_context,
    weatherSummary: rec.weather_summary,
    reasoning: rec.reasoning,
    dailyInsight: rec.daily_insight,
    itemIds: ids,
    items,
    whyThisWorks,
    cap,
    hasUndo,
    missingSlots,
    partialReason,
    confidence: rec.confidence ?? null,
    isDualPick: rec.is_dual_pick ?? false,
    gem,
  };
  return { view };
}
