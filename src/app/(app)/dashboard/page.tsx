import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signWardrobePaths } from "@/lib/images";
import { BottomNav } from "@/components/nav/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { CompactOutfitStack } from "@/components/wearwise/CompactOutfitStack";
import { ReasoningCards, type ReasoningItem } from "@/components/wearwise/ReasoningCards";
import type { OutfitItem } from "@/components/wearwise/OutfitItemRow";
import type { GarmentKind } from "@/components/ui/Icon";
import { OCCASIONS, type OutfitSuggestion, type WardrobeItem, type DailyRecommendation } from "@/lib/types";
import { WornTodayButton } from "@/app/(app)/outfits/[requestId]/worn-today-button";
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

// Safe demo "Best Pick" shown until the user has an approved outfit.
// Tuned to the launch niche (smart-casual, women 22–40).
const DEMO_OUTFIT: OutfitItem[] = [
  { kind: "Shirt", color: "#F2ECE0", label: "Ivory silk blouse", sub: "Light · breathable" },
  { kind: "Pants", color: "#B98D63", label: "Camel tailored trousers", sub: "All-day comfort" },
  { kind: "Loafer", color: "#C9A98C", label: "Nude flats", sub: "Polished · easy" },
  { kind: "Watch", color: "#3D352B", label: "Gold studs", sub: "Optional" },
];

type RequestRel = { occasion: string; notes: string | null; created_at: string };
type ApprovedSuggestion = OutfitSuggestion & { request: RequestRel | RequestRel[] | null };

export default async function DashboardPage() {
  const { user, supabase, profile } = await requireProfile();
  if (!profile?.onboarded) redirect("/onboarding");

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const [
    { count: itemCount },
    { data: requests },
    { data: worn },
    { data: approvedData },
    { count: weeklyWorn },
    { data: quietGemRows },
    { data: streakRow },
  ] = await Promise.all([
    supabase.from("wardrobe_items").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("outfit_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
    supabase.from("worn_history").select("*").eq("user_id", user.id).order("worn_on", { ascending: false }).limit(1),
    // RLS already restricts to the owner's APPROVED suggestions; we re-state
    // both filters as defense-in-depth. Pull the parent request for context.
    supabase
      .from("outfit_suggestions")
      .select("*, request:outfit_requests(occasion, notes, created_at)")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(12),
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

  // ---- Build the real Best Pick (if any approved suggestion exists) ----
  const approved = (approvedData ?? []) as ApprovedSuggestion[];
  const bestPick = await buildBestPick(approved, user.id, supabase);

  const dailyInsight = buildDailyInsight({
    quietGem: (quietGemRows?.[0] as QuietGemRow | undefined) ?? null,
    weeklyWorn: weeklyWorn ?? 0,
    itemsCount: items,
  });

  // Honest weather context (null when no API key or no city).
  const weather = await getWeatherContext(profile?.city);

  // Today's Drop (Phase 2): read the cached daily recommendation for the user's
  // local date. Read-only here — preparation runs via the manual prepare route.
  // Gate on the opt-in: when Daily Drop is OFF we don't surface it at all, even
  // if a cached row remains from before it was disabled (the row is kept for
  // history, never deleted or regenerated here).
  const todayDrop = profile?.daily_drop_enabled
    ? await loadTodayDrop(user.id, profile?.timezone ?? null, supabase)
    : null;

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
          {bestPick
            ? "Here's your best outfit for today."
            : items >= 10
              ? "Create a look and your daily picks will appear here."
              : "Let's set up your wardrobe so your daily picks can begin."}
        </p>

        {/* Real weather context (honest fallback when unavailable) */}
        <WeatherStrip weather={weather} />

        {/* Today's Drop — cached daily recommendation (Phase 2). Prepared drop
            renders as a prominent card; a failed prepare shows honest copy;
            when there's no drop yet the section is simply absent. */}
        {todayDrop?.view && (
          <DailyDropCard drop={todayDrop.view} postwearEnabled={profile?.postwear_sheet_enabled ?? true} />
        )}
        {todayDrop?.failed && (
          <Card className="mt-5 border-champagne/30 bg-champagne/[0.08] p-4">
            <p className="font-medium text-charcoal">Today&apos;s pick isn&apos;t ready</p>
            <p className="mt-1 text-sm text-graphite">{todayDrop.failed}</p>
            {/* Safe retry — normal prepare, never force */}
            <PrepareDropButton compact />
          </Card>
        )}
        {/* Manual beta prepare — only when opted in and no drop exists today */}
        {profile?.daily_drop_enabled && !todayDrop && <PrepareDropButton />}

        {/* Context chips */}
        <div className="no-scrollbar -mx-6 mt-4 flex gap-2 overflow-x-auto px-6">
          {bestPick ? (
            <>
              <Chip tone="filled">{bestPick.occasion}</Chip>
              {bestPick.context && <Chip>{bestPick.context}</Chip>}
              {bestPick.confidence != null && (
                <Chip tone="plum" mono size="sm">{bestPick.confidence}% match</Chip>
              )}
              <Link href="/occasion/new" className="shrink-0">
                <Chip className="text-graphite">+ new</Chip>
              </Link>
            </>
          ) : (
            <>
              <Chip><Icon.Briefcase className="h-3.5 w-3.5" /> Everyday</Chip>
              <Chip tone="filled">Smart casual</Chip>
              <Link href="/occasion/new" className="shrink-0">
                <Chip className="text-graphite">+ change</Chip>
              </Link>
            </>
          )}
        </div>

        {/* Build-wardrobe nudge (until they have enough items, no real pick) */}
        {!bestPick && items < 10 && (
          <Card className="mt-5 border-plum/20 bg-plum/[0.05] p-5">
            <p className="font-medium text-charcoal">Build your wardrobe first</p>
            <p className="mt-1 text-sm text-graphite">
              Add at least 10 items so WearWise can suggest great outfits. You have {items} so far.
            </p>
            <Button asChild className="mt-4" size="full">
              <Link href="/wardrobe/upload"><Icon.Plus className="h-4 w-4" /> Add clothes to get your first real outfit</Link>
            </Button>
          </Card>
        )}

        {bestPick && <p className="ww-eyebrow mt-6 text-plum">Today&apos;s Pick is ready</p>}

        {/* Best Pick card */}
        <section className={bestPick ? "mt-2" : "mt-5"}>
          {bestPick ? <RealBestPick pick={bestPick} /> : <SampleBestPick items={items} />}
        </section>

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

// ===================== Best Pick rendering =====================

interface BestPick {
  suggestionId: string;
  requestId: string;
  title: string;
  occasion: string;
  context: string | null;
  confidence: number | null;
  itemIds: string[];
  rows: OutfitItem[];
  thumbs: string[];
  reasoning: ReasoningItem[];
  hasAlternatives: boolean;
}

function RealBestPick({ pick }: { pick: BestPick }) {
  return (
    <>
      <Card variant="stack" className="overflow-hidden p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="ww-eyebrow text-plum">Best Pick Today</p>
            <h2 className="mt-1 font-serif text-[1.35rem] leading-tight tracking-tight text-charcoal">
              {pick.title}
            </h2>
          </div>
          {pick.confidence != null && <ConfidenceRing value={pick.confidence} size={52} />}
        </div>

        {/* Outfit photos (private signed thumbnails) or graceful gradient */}
        <div className="relative mb-4 h-44 overflow-hidden rounded-ww-md border border-hairline bg-gradient-to-b from-bone to-stone">
          {pick.confidence != null && (
            <span className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-charcoal/70 px-2.5 py-1 text-[10px] font-medium tracking-wide text-bone backdrop-blur">
              <Icon.Sparkle className="h-2.5 w-2.5" /> AI · STYLE MATCH {pick.confidence}
            </span>
          )}
          {pick.thumbs.length > 0 ? (
            <div className="flex h-full gap-1">
              {pick.thumbs.slice(0, 4).map((src, i) => (
                <div key={i} className="h-full flex-1 overflow-hidden bg-stone">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid h-full place-items-center text-mist">
              <Icon.Hanger className="h-7 w-7" />
            </div>
          )}
        </div>

        <CompactOutfitStack items={pick.rows} showCheck={false} />

        {/* Reasoning */}
        {pick.reasoning.length > 0 && <ReasoningCards items={pick.reasoning} className="mt-4" />}

        {/* Blocker fix: the legacy "Swap one item" / "Another option" buttons here
            were <Link>s to /outfits (a full-look list) — they navigated instead of
            running the real slot-first swap, and both did the same full-outfit
            thing. Removed so there is ONE correct swap flow: the Daily Drop card's
            slot-first SwapSheet + its separate Another-option handler. Wear this +
            "View full look" remain. */}
        <div className="mt-5 space-y-2">
          <div className="flex">
            <WornTodayButton suggestionId={pick.suggestionId} itemIds={pick.itemIds} />
          </div>
        </div>
        <Link
          href={`/outfits/${pick.requestId}`}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 py-1.5 text-[13px] text-graphite hover:text-charcoal"
        >
          <Icon.ArrowRight className="h-3.5 w-3.5" /> View full look &amp; alternatives
        </Link>
      </Card>
      <Link href="/occasion/new" className="mt-2 flex items-center justify-center gap-1.5 py-1 text-xs text-graphite hover:text-charcoal">
        <Icon.Calendar className="h-3.5 w-3.5" /> Change occasion
      </Link>
    </>
  );
}

function SampleBestPick({ items }: { items: number }) {
  const ready = items >= 10;
  return (
    <>
      <Card variant="stack" className="overflow-hidden p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="ww-eyebrow text-plum">Sample preview</p>
            <h2 className="mt-1 font-serif text-[1.35rem] leading-tight tracking-tight text-charcoal">
              Polished without trying <em className="text-plum">too hard.</em>
            </h2>
          </div>
          <ConfidenceRing value={87} size={52} />
        </div>

        <div className="relative mb-4 flex h-44 items-center justify-center overflow-hidden rounded-ww-md border border-hairline bg-gradient-to-b from-bone to-stone">
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-charcoal/70 px-2.5 py-1 text-[10px] font-medium tracking-wide text-bone backdrop-blur">
            <Icon.Sparkle className="h-2.5 w-2.5" /> SAMPLE · STYLE MATCH 87
          </span>
          <div className="flex items-end gap-3 opacity-90">
            {DEMO_OUTFIT.slice(0, 3).map((it, i) => (
              <div
                key={i}
                className="grid h-20 w-16 place-items-center rounded-ww-sm border border-hairline"
                style={{ background: it.color }}
              >
                <span className="sr-only">{it.label}</span>
              </div>
            ))}
          </div>
        </div>

        <CompactOutfitStack items={DEMO_OUTFIT} showCheck={false} />

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Chip tone="sage" size="sm"><Icon.Check className="h-2.5 w-2.5" /> Weather-ready</Chip>
          <Chip tone="sage" size="sm"><Icon.Check className="h-2.5 w-2.5" /> Office-ready</Chip>
          <Chip tone="sage" size="sm"><Icon.Check className="h-2.5 w-2.5" /> Comfortable</Chip>
        </div>

        <div className="mt-5">
          <Button asChild size="full">
            <Link href={ready ? "/occasion/new" : "/wardrobe/upload"}>
              {ready ? (
                <>Get today&apos;s outfit <Icon.ArrowRight className="h-4 w-4" /></>
              ) : (
                <>Add clothes to get your first real outfit</>
              )}
            </Link>
          </Button>
        </div>
      </Card>
      <p className="mt-2 px-1 text-xs text-mist">
        {ready
          ? "This is a sample. Create a look to see your real Best Pick here."
          : `This is a sample of your daily pick. Add ${Math.max(0, 10 - items)} more item${10 - items === 1 ? "" : "s"} to get real recommendations.`}
      </p>
    </>
  );
}

// ===================== Data shaping =====================

async function buildBestPick(
  approved: ApprovedSuggestion[],
  userId: string,
  supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"]
): Promise<BestPick | null> {
  // Hotfix: never surface a stored suggestion that contains an item which is no
  // longer wearable (in_wash / unavailable / archived / deleted). Pick the first
  // approved suggestion whose every item is currently available; if none, render
  // no legacy Best Pick at all (the Daily Drop card is the canonical surface).
  let top: ApprovedSuggestion | null = null;
  for (const s of approved) {
    const v = await validateOutfitCurrent(supabase, userId, s.item_ids ?? []);
    if (v.valid) { top = s; break; }
    await logAppEvent("stale_outfit_blocked", userId, {
      surface: "best_pick", reason: v.invalid[0]?.reason ?? "stale",
    });
  }
  if (!top) return null;

  const rel = Array.isArray(top.request) ? top.request[0] : top.request;
  const itemIds = top.item_ids ?? [];

  // Load member items (owner-scoped; RLS also enforces ownership).
  let members: WardrobeItem[] = [];
  if (itemIds.length) {
    const { data } = await supabase
      .from("wardrobe_items")
      .select("*")
      .eq("user_id", userId)
      .in("id", itemIds);
    members = (data ?? []) as WardrobeItem[];
  }
  const byId = new Map(members.map((m) => [m.id, m]));
  const urls = await signWardrobePaths(members.map((m) => m.image_path));

  // Preserve the stylist's item order.
  const rows: OutfitItem[] = itemIds
    .map((id) => byId.get(id))
    .filter((m): m is WardrobeItem => Boolean(m))
    .map((m) => ({
      kind: toGarment(m.category, m.sub_category),
      color: colorToHex(m.color),
      image: urls[m.image_path] ?? null,
      label: m.user_facing_name ?? m.category ?? "Item",
      sub: [m.category, m.color].filter(Boolean).join(" · ") || undefined,
      note: m.last_worn_at ? `Worn ${new Date(m.last_worn_at).toLocaleDateString()}` : undefined,
    }));

  const thumbs = itemIds
    .map((id) => byId.get(id))
    .filter((m): m is WardrobeItem => Boolean(m))
    .map((m) => urls[m.image_path])
    .filter((u): u is string => Boolean(u));

  // Hotfix: Phase-3 surfaces render explanations ONLY from real stored scoring
  // factors (handbook §3.5). Legacy free-generated copy — "Why this works"
  // paragraphs, avoid tips, and "Would complete it: <unowned belt>" — is removed
  // here; the Daily Drop card carries the canonical WhyThisWorks.
  const reasoning: ReasoningItem[] = [];

  const hasAlternatives = approved.some((s) => s.request_id === top.request_id && s.id !== top.id);

  return {
    suggestionId: top.id,
    requestId: top.request_id,
    title: top.title || "Today's outfit",
    occasion: rel ? occasionLabel(rel.occasion) : "Your day",
    context: rel?.notes ?? null,
    confidence: top.ai_confidence != null ? Math.round(top.ai_confidence * 100) : null,
    itemIds,
    rows,
    thumbs,
    reasoning,
    hasAlternatives,
  };
}

/** Map a wardrobe category/sub-category to the closest garment illustration. */
function toGarment(category?: string | null, sub?: string | null): GarmentKind {
  const c = `${sub ?? ""} ${category ?? ""}`.toLowerCase();
  if (/\b(jean|denim)\b/.test(c)) return "Jeans";
  if (/(trouser|chino|pant|legging|palazzo|bottom|jogger)/.test(c)) return "Pants";
  if (/skirt/.test(c)) return "Skirt";
  if (/(saree|sari|gown|dress|anarkali|lehenga)/.test(c)) return "Dress";
  if (/(sneaker|trainer)/.test(c)) return "Sneaker";
  if (/(footwear|shoe|heel|flat|sandal|loafer|mule|boot)/.test(c)) return "Loafer";
  if (/(outerwear|jacket|blazer|coat|overshirt)/.test(c)) return "Jacket";
  if (/(sweater|knit|cardigan|pullover)/.test(c)) return "Sweater";
  if (/(belt)/.test(c)) return "Belt";
  if (/(watch|accessory|jewel|bag|clutch|earring|stud)/.test(c)) return "Watch";
  if (/(tee|t-shirt|tshirt)/.test(c)) return "Tshirt";
  return "Shirt"; // tops, kurta, kurti, blouse, shirt, dupatta → default
}

/** Map a colour name to a swatch hex for vector tiles (used only without a photo). */
function colorToHex(color?: string | null): string {
  const map: Record<string, string> = {
    white: "#F4F0E8", ivory: "#F2ECE0", cream: "#F2ECE0", beige: "#E3D8C6",
    black: "#1C1A17", grey: "#8A857C", gray: "#8A857C", charcoal: "#2B2925",
    navy: "#2A3852", blue: "#3A4E7A", "sky blue": "#9DB6D6",
    red: "#9E3B36", maroon: "#5A2330", pink: "#C98BA0", rose: "#C98BA0",
    green: "#5E7351", olive: "#6B6A3A", sage: "#8AA17C",
    yellow: "#D8B24A", gold: "#B8915A", mustard: "#C79A3E",
    brown: "#7B4B2E", tan: "#B98D63", camel: "#B98D63",
    purple: "#5C4A6E", plum: "#4A2C3D", lavender: "#C4BBD4",
    orange: "#C77A5A", terracotta: "#C77A5A",
  };
  const key = (color ?? "").trim().toLowerCase();
  return map[key] ?? "#EAE3D7";
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

// ===================== Today's Drop (Phase 2 read) =====================

/**
 * Read today's cached daily_recommendation for the user's local date and shape
 * it for the client card. Signs private image paths at render time (never
 * stored). Returns { view } for a usable drop, { failed } for an honest
 * failure message, or null when there is no drop for today.
 */
async function loadTodayDrop(
  userId: string,
  timezone: string | null,
  supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"]
): Promise<{ view?: DailyDropView; failed?: string } | null> {
  const localDate = userLocalDate(timezone);
  const { data } = await supabase
    .from("daily_recommendations")
    .select("*")
    .eq("user_id", userId)
    .eq("local_date", localDate)
    .maybeSingle();
  if (!data) return null;

  let rec = data as DailyRecommendation;
  if (rec.status === "failed") {
    return {
      failed:
        rec.reasoning ||
        "We couldn't prepare today's outfit. Add a few clothes or mark items available to improve tomorrow's pick.",
    };
  }

  // Hotfix — read-time validity gate. A stored drop can go stale if a piece was
  // marked in_wash / unavailable / archived (or deleted) AFTER it was prepared.
  // Never render a stale outfit: regenerate around what's clean right now, then
  // re-validate. If nothing valid can be formed, fall through to an honest
  // constrained state — but never show the dirty item.
  let ids = rec.selected_item_ids ?? [];
  let validity = await validateOutfitCurrent(supabase, userId, ids);
  if (ids.length > 0 && !validity.valid) {
    await logAppEvent("stale_outfit_blocked", userId, {
      surface: "daily_drop", reason: validity.invalid[0]?.reason ?? "stale",
    });
    const regen = await prepareDailyDrop(userId, { force: true, supabase });
    if (regen.recommendation) {
      rec = regen.recommendation;
      ids = rec.selected_item_ids ?? [];
      validity = await validateOutfitCurrent(supabase, userId, ids);
      await logAppEvent("stale_outfit_regenerated", userId, { status: regen.status });
    }
    if (rec.status === "failed" || !validity.valid) {
      return {
        failed:
          rec.reasoning ||
          "Today's pick is refreshing around what's clean right now — check back in a moment.",
      };
    }
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
