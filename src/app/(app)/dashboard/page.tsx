import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signWardrobePaths } from "@/lib/images";
import { BottomNav } from "@/components/nav/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { OCCASIONS, type WardrobeItem, type DailyRecommendation } from "@/lib/types";
import { getWeatherContext, type WeatherContext } from "@/lib/weather";
import { userLocalDate, prepareDailyDrop } from "@/lib/daily-drop";
import { capState } from "@/lib/swap-caps";
import { validateOutfitCurrent } from "@/lib/outfit-validity";
import { swapSlot, slotLabel } from "@/lib/engine/swap";
import { logAppEvent } from "@/lib/events";
import { DailyDropCard, type DailyDropView } from "./daily-drop-card";
import { PrepareDropButton } from "./prepare-drop-button";
import { StreakFlame } from "@/components/wearwise/StreakFlame";

export const dynamic = "force-dynamic"; // per-user signed URLs; never cache

const occasionLabel = (v: string) => OCCASIONS.find((o) => o.value === v)?.label ?? v;

export default async function DashboardPage() {
  const { user, supabase, profile } = await requireProfile();
  if (!profile?.onboarded) redirect("/onboarding");

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const [
    { count: itemCount },
    { data: requests },
    { data: worn },
    { count: weeklyWorn },
    { data: quietGemRows },
    { data: streakRow },
  ] = await Promise.all([
    supabase.from("wardrobe_items").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("outfit_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
    supabase.from("worn_history").select("*").eq("user_id", user.id).order("worn_on", { ascending: false }).limit(1),
    // Real signals for the daily insight card (owner-scoped, no faked data).
    supabase.from("worn_history").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("worn_on", sevenDaysAgo),
    supabase
      .from("wardrobe_items")
      .select("user_facing_name, category, last_worn_at")
      .eq("user_id", user.id)
      .not("last_worn_at", "is", null)
      .order("last_worn_at", { ascending: true })
      .limit(1),
    // Streak (Module C) — read-own via RLS; check-in happens client-side.
    supabase.from("streaks").select("current_count").eq("user_id", user.id).maybeSingle(),
  ]);

  const items = itemCount ?? 0;
  const firstName = profile?.full_name?.split(" ")[0];
  const initial = (firstName ?? "W").charAt(0).toUpperCase();

  const dailyInsight = buildDailyInsight({
    quietGem: (quietGemRows?.[0] as QuietGemRow | undefined) ?? null,
    weeklyWorn: weeklyWorn ?? 0,
    itemsCount: items,
  });

  // Honest weather context (null when no API key or no city).
  const weather = await getWeatherContext(profile?.city);

  // Single-Hero contract: the dashboard ALWAYS ensures exactly one Today's Drop
  // (get-or-create + validate), independent of the cron and of the notification
  // opt-in. It never falls back to the legacy pick card. One create/regenerate
  // attempt per request; fail closed to an honest constrained state otherwise.
  const todayDrop = await ensureTodayDrop(user.id, profile?.timezone ?? null, supabase, items);

  return (
    <main className="min-h-dvh pb-28">
      <div className="animate-fade-in px-6 pt-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="ww-eyebrow mb-1">{dateLabel()}</p>
            <h1 className="ww-display text-[1.7rem] text-charcoal">
              {greeting()},{" "}
              <em className="text-plum">{firstName ? `${firstName}.` : "there."}</em>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StreakFlame initialCount={streakRow?.current_count ?? 0} />
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-stone font-serif text-base text-charcoal"
            >
              {initial}
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm text-graphite">
          {todayDrop.view
            ? "Here's your outfit for today."
            : items >= 10
              ? "We're putting today's outfit together from your wardrobe."
              : "Let's set up your wardrobe so your daily picks can begin."}
        </p>

        {/* Real weather context (honest fallback when unavailable) */}
        <WeatherStrip weather={weather} />

        {/* SINGLE PRIMARY RECOMMENDATION — Today's Drop, and only Today's Drop.
            The legacy pick render path has been removed from the dashboard
            so two heroes can never compete. When no valid drop can be formed we
            show one honest constrained state (or the build-wardrobe onboarding) —
            never the legacy pick card. */}
        {todayDrop.view ? (
          <DailyDropCard drop={todayDrop.view} postwearEnabled={profile?.postwear_sheet_enabled ?? true} />
        ) : todayDrop.needsWardrobe ? (
          <Card className="mt-5 border-plum/20 bg-plum/[0.05] p-5">
            <p className="font-medium text-charcoal">Build your wardrobe first</p>
            <p className="mt-1 text-sm text-graphite">
              Add at least 10 items so WearWise can prepare your daily outfit. You have {items} so far.
            </p>
            <Button asChild className="mt-4" size="full">
              <Link href="/wardrobe/upload"><Icon.Plus className="h-4 w-4" /> Add clothes to get your first outfit</Link>
            </Button>
          </Card>
        ) : (
          <Card className="mt-5 border-champagne/30 bg-champagne/[0.08] p-4">
            <p className="font-medium text-charcoal">We couldn&apos;t prepare today&apos;s outfit</p>
            <p className="mt-1 text-sm text-graphite">
              {todayDrop.failed ?? "We couldn't prepare today's outfit from your available wardrobe."}
            </p>
            {/* Retry — regenerates from current available inventory (no legacy fallback). */}
            <PrepareDropButton compact />
          </Card>
        )}

        {/* Daily insight / surprise — safe, real signals only */}
        <DailyInsight text={dailyInsight} />

        {/* Quick stats */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link href="/wardrobe">
            <Card className="h-full p-5">
              <Icon.Hanger className="h-5 w-5 text-plum" />
              <span className="mt-1 block text-2xl font-semibold text-charcoal">{items}</span>
              <span className="text-sm text-graphite">items in wardrobe</span>
            </Card>
          </Link>
          <Link href="/occasion/new">
            <Card className="h-full p-5">
              <Icon.Sparkle className="h-5 w-5 text-champagne" />
              <span className="mt-1 block text-2xl font-semibold text-charcoal">{requests?.length ?? 0}</span>
              <span className="text-sm text-graphite">recent requests</span>
            </Card>
          </Link>
        </div>

        {/* Recent requests */}
        {requests && requests.length > 0 && (
          <section className="mt-8">
            <h2 className="font-serif text-lg font-semibold text-charcoal">Recent requests</h2>
            <div className="mt-3 space-y-2">
              {requests.map((r) => (
                <Link key={r.id} href={`/outfits/${r.id}`}>
                  <Card className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium text-charcoal">{occasionLabel(r.occasion)}</p>
                      <p className="text-xs text-graphite">{new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                    <Chip tone={r.status === "fulfilled" ? "sage" : "champagne"} size="sm">
                      {r.status === "fulfilled" ? "Ideas ready" : "Curating"}
                    </Chip>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {worn && worn.length > 0 && (
          <p className="mt-6 text-sm text-graphite">
            Last worn outfit logged on {new Date(worn[0].worn_on).toLocaleDateString()}.
          </p>
        )}
      </div>
      <BottomNav />
    </main>
  );
}

// ===================== Daily insight (safe, real signals only) =====================

type QuietGemRow = { user_facing_name: string | null; category: string | null; last_worn_at: string | null };

function buildDailyInsight({
  quietGem,
  weeklyWorn,
  itemsCount,
}: {
  quietGem: QuietGemRow | null;
  weeklyWorn: number;
  itemsCount: number;
}): string {
  if (quietGem?.last_worn_at) {
    const days = Math.floor((Date.now() - new Date(quietGem.last_worn_at).getTime()) / 86_400_000);
    const name = quietGem.user_facing_name ?? quietGem.category ?? "A quiet piece";
    if (days >= 30) return `${name} has been quiet for ${days} days — a fresh option to bring back today.`;
  }
  if (weeklyWorn > 0) {
    return `${weeklyWorn} ${weeklyWorn === 1 ? "morning" : "mornings"} sorted this week. WearWise keeps learning your taste.`;
  }
  if (itemsCount > 0) return "Fresh pick. WearWise learns more each time you mark an outfit worn.";
  return "Add a few clothes and WearWise will start preparing your daily pick.";
}

function WeatherStrip({ weather }: { weather: WeatherContext | null }) {
  const rainy = weather?.category === "rainy" || weather?.category === "humid" || weather?.category === "windy";
  const WIcon = rainy ? Icon.Cloud : Icon.Sun;
  return (
    <div className="mt-3 flex items-center gap-2 rounded-ww-md border border-hairline bg-bone px-3 py-2 text-sm">
      <WIcon className={`h-4 w-4 shrink-0 ${weather ? "text-champagne" : "text-mist"}`} />
      {weather ? (
        <span className="min-w-0">
          <span className="font-medium text-charcoal">{weather.tempC}° · {weather.summary}</span>
          <span className="text-graphite"> — {weather.advice}</span>
        </span>
      ) : (
        <span className="text-graphite">
          Weather unavailable — WearWise will use your wardrobe and selected occasion.
        </span>
      )}
    </div>
  );
}

function DailyInsight({ text }: { text: string }) {
  return (
    <div className="mt-5 flex items-start gap-3 rounded-ww-md border border-lavender/40 bg-lavender/[0.14] p-3.5">
      <span aria-hidden="true" className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bone">
        <Icon.Sparkle className="h-3.5 w-3.5 text-plum" />
      </span>
      <div>
        <p className="ww-eyebrow text-plum">Daily insight</p>
        <p className="mt-0.5 text-sm leading-snug text-charcoal">{text}</p>
      </div>
    </div>
  );
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
): { failed: string; needsWardrobe?: boolean } {
  const thin = reason === "no_wardrobe" || reason === "too_few_wearable_items" || itemCount < 10;
  if (thin) {
    return { failed: "Add a few clothes and your daily outfit will appear here.", needsWardrobe: true };
  }
  return { failed: message || "We couldn't prepare today's outfit from your available wardrobe." };
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
): Promise<{ view?: DailyDropView; failed?: string; needsWardrobe?: boolean }> {
  const localDate = userLocalDate(timezone);
  const { data } = await supabase
    .from("daily_recommendations")
    .select("*")
    .eq("user_id", userId)
    .eq("local_date", localDate)
    .maybeSingle();

  // ---------------------------------------------------------------------------
  // SINGLE-WRITE CONTRACT (Phase 3 hotfix 4): a dashboard request performs AT
  // MOST ONE write-producing recommendation action — either ONE create (missing
  // row) OR ONE regenerate (pre-existing stale row), never both. `writeAttempted`
  // makes this explicit and guards against future refactors. A newly created or
  // regenerated outfit is STILL validated below (validation is never skipped); if
  // it lost the create/validate race and is stale, the request FAILS CLOSED
  // rather than writing a second time.
  // ---------------------------------------------------------------------------
  let rec = (data as DailyRecommendation | null) ?? null;
  let source: "existing" | "created" | "regenerated" = rec ? "existing" : "created";
  let writeAttempted = false;

  if (!rec) {
    // MISSING ROW -> exactly one create (ignoreOptIn bypasses ONLY the
    // notification opt-in; it never enables or sends notifications). Idempotent:
    // prepareDailyDrop upserts on (user_id, local_date), so concurrent first
    // loads resolve to a single row.
    writeAttempted = true;
    const created = await prepareDailyDrop(userId, { supabase, ignoreOptIn: true });
    if (!created.recommendation) return constrainedResult(created.reason, itemCount);
    rec = created.recommendation;
  } else if (rec.status !== "failed") {
    // EXISTING ROW -> regenerate ONCE, and ONLY if the stored outfit is already
    // stale. Regeneration is reachable only on this pre-existing branch, so a
    // create and a regenerate can never both run in the same request.
    const existingIds = rec.selected_item_ids ?? [];
    const existingValidity = await validateOutfitCurrent(supabase, userId, existingIds);
    if (existingIds.length > 0 && !existingValidity.valid && !writeAttempted) {
      writeAttempted = true;
      await logAppEvent("stale_outfit_blocked", userId, {
        surface: "daily_drop", reason: existingValidity.invalid[0]?.reason ?? "stale",
      });
      const regenerated = await prepareDailyDrop(userId, { force: true, supabase });
      if (regenerated.recommendation) { rec = regenerated.recommendation; source = "regenerated"; }
      await logAppEvent("stale_outfit_regenerated", userId, { status: regenerated.status });
    }
  }

  if (rec.status === "failed") {
    return constrainedResult(rec.fail_reason ?? undefined, itemCount, rec.reasoning ?? undefined);
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
    return constrainedResult(rec.fail_reason ?? undefined, itemCount, rec.reasoning ?? undefined);
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
  };
  return { view };
}
