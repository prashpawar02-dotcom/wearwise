// =====================================================================
// WearWise — Wardrobe insight computation (Phase 5, Module E)
// Server-safe (no React, no I/O). Turns owner-scoped rows the loader already
// fetched into ≤3 honest insight cards + the gem item-id list for the board
// action. Fails closed: gem participation is proven through the REAL engine
// across a SMALL bounded set of supported occasion contexts (culture-aware,
// not casual-only), prepared once per context — never per item, never an
// unbounded weather/location sweep. If a context errors it is skipped and can
// never fabricate a qualification; if all fail, gems are omitted.
// =====================================================================

import type { WardrobeItem } from "@/lib/types";
import type { EngineContext, EngineOccasion } from "@/lib/engine/types";
import { DEFAULT_CONFIG, DEFAULT_ETHNIC_RULES, EMPTY_PREFERENCES, profileForOccasion } from "@/lib/engine/config";
import { recommendableItemIds } from "@/lib/wardrobe/gem-validation";
import {
  buildInsightCards,
  selectQuietGems,
  wearCountsFromHistory,
  type GemContext,
  type InsightCard,
} from "@/lib/wardrobe/insights";

const status = (i: WardrobeItem) => i.availability_status ?? "available";

/** First-class everyday + work/formal + traditional contexts. Small + bounded
 *  so work, formal, ethnic and festive pieces aren't wrongly omitted (a
 *  casual-only check biased against them). */
const BASE_GEM_OCCASIONS: readonly EngineOccasion[] = ["casual", "work", "festive"];

const KNOWN_OCCASIONS: ReadonlySet<string> = new Set<EngineOccasion>([
  "work", "office", "interview", "casual", "college", "travel", "dinner_date", "dinner",
  "party", "ethnic", "festive", "family_function", "wedding_guest", "formal_event", "gym",
]);

/** Neutral, fixed weather so the insight count doesn't swing with the forecast. */
function contextFor(occasion: EngineOccasion, now: Date): EngineContext {
  return {
    occasion,
    weather: { tempC: 26, isRaining: false },
    config: DEFAULT_CONFIG,
    profile: profileForOccasion(occasion),
    ethnicRules: DEFAULT_ETHNIC_RULES,
    preferences: EMPTY_PREFERENCES,
    now,
  };
}

/** The bounded validation context set: base first-class occasions + the user's
 *  real default occasion (only if it is a supported value). Deduped. */
export function gemContexts(now: Date, defaultOccasion?: string | null): EngineContext[] {
  const occ: EngineOccasion[] = [...BASE_GEM_OCCASIONS];
  if (defaultOccasion && KNOWN_OCCASIONS.has(defaultOccasion) && !occ.includes(defaultOccasion as EngineOccasion)) {
    occ.push(defaultOccasion as EngineOccasion);
  }
  return occ.map((o) => contextFor(o, now));
}

/** Union of items that participate in a complete validated outfit in AT LEAST
 *  ONE context. Per-context isolation: a throwing context is skipped (never
 *  aborts the others, never fabricates). `validate` is injectable for tests. */
export function validatedGemIds(
  available: ReadonlyArray<WardrobeItem>,
  contexts: ReadonlyArray<EngineContext>,
  validate: (items: ReadonlyArray<WardrobeItem>, ctx: EngineContext) => Set<string> =
    (items, ctx) => recommendableItemIds(items, [ctx]),
): Set<string> {
  const ids = new Set<string>();
  for (const ctx of contexts) {
    try {
      for (const id of validate(available, ctx)) ids.add(id);
    } catch {
      // One context failing must not fabricate a qualification or abort the rest.
    }
  }
  return ids;
}

export interface WardrobeInsights {
  cards: InsightCard[];
  /** Engine-validated gem item ids (for the "show gems" board action). */
  gemItemIds: string[];
}

export function computeWardrobeInsights(args: {
  /** ALL owned items (server, user-scoped). */
  items: ReadonlyArray<WardrobeItem>;
  /** Owner-scoped worn_history rows (item_ids only). */
  wornRows: ReadonlyArray<{ item_ids: string[] | null } | null | undefined>;
  /** The user's real default occasion (only used if supported). */
  defaultOccasion?: string | null;
  now?: Date;
}): WardrobeInsights {
  const now = args.now ?? new Date();
  // Archived is off-board — excluded from every insight (E2/E3/E4).
  const boardItems = args.items.filter((i) => status(i) !== "archived");
  const available = boardItems.filter((i) => status(i) === "available");
  const wearCounts = wearCountsFromHistory(args.wornRows);

  const cooldownUntil: Record<string, string | null> = {};
  for (const i of boardItems) if (i.gem_cooldown_until) cooldownUntil[i.id] = i.gem_cooldown_until;

  const recommendableIds = validatedGemIds(available, gemContexts(now, args.defaultOccasion));

  const gemCtx: GemContext = { now, cooldownUntil, recommendableIds };
  const cards = buildInsightCards(boardItems, wearCounts, gemCtx);
  const gemItemIds = selectQuietGems(boardItems, gemCtx).map((g) => g.id);

  return { cards, gemItemIds };
}
