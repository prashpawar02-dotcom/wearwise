// =====================================================================
// WearWise — Engine v2 SCORING layer (Phase 1)
// Weighted sum of positive factors minus weighted penalties. Every factor
// records its raw value, weight, and signed contribution so explanations and
// the admin QA view render from REAL numbers (handbook §3.5 explainability).
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type { EngineContext, FactorContribution } from "@/lib/engine/types";
import {
  engineRole, colorFamilyOf, isNeutralColor, patternBoldness, formalityOf,
  fabricOf, isActivewear, itemText,
} from "@/lib/engine/classify";
import { accessoryRelevanceGuard } from "@/lib/engine/guards";

const CORE_ROLES = new Set(["upper", "ethnic_upper", "bottom", "one_piece", "saree", "outerwear"]);
const DAY_MS = 86_400_000;

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

function daysSinceWorn(i: WardrobeItem, now: Date): number | null {
  if (!i.last_worn_at) return null;
  const t = Date.parse(i.last_worn_at);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / DAY_MS);
}

// ---- positive factors (each returns raw 0..1 + a human detail) -----------

function colorHarmony(items: WardrobeItem[], ctx: EngineContext): { raw: number; detail: string } {
  const neutrals = ctx.config.colorRules.neutrals;
  const metallics = ctx.config.colorRules.metallics;
  const core = items.filter((i) => CORE_ROLES.has(engineRole(i)));
  const saturated = new Set<string>();
  for (const i of core) {
    const c = colorFamilyOf(i);
    if (c === "unknown" || isNeutralColor(c, neutrals) || metallics.includes(c)) continue;
    saturated.add(c);
  }
  const n = saturated.size;
  const raw = n <= 1 ? 1 : n === 2 ? 0.7 : 0.3;
  const detail = n <= 1
    ? "Colours sit together cleanly"
    : n === 2 ? "Two colours in balance" : "Several strong colours competing";
  return { raw, detail };
}

function formalityCoherence(items: WardrobeItem[], ctx: EngineContext): { raw: number; detail: string } {
  const fs = items.map(formalityOf).filter((f): f is number => f != null);
  if (fs.length === 0) return { raw: 0.5, detail: "Formality not yet tagged" };
  const spread = Math.max(...fs) - Math.min(...fs);
  const target = ctx.profile.formalityTarget;
  const avg = fs.reduce((a, b) => a + b, 0) / fs.length;
  const tightness = 1 - spread / 4;                 // pieces agree with each other
  const onTarget = 1 - Math.min(1, Math.abs(avg - target) / 4);
  const raw = clamp01(0.5 * tightness + 0.5 * onTarget);
  return { raw, detail: raw >= 0.75 ? `Matches ${ctx.profile.label.toLowerCase()} formality` : "Formality is a little uneven" };
}

function occasionFit(items: WardrobeItem[], ctx: EngineContext): { raw: number; detail: string } {
  const occ = ctx.profile.occasion;
  const tagged = items.filter((i) => (i.occasion_tags ?? []).some((o) => String(o) === occ || String(o) === ctx.profile.label.toLowerCase())).length;
  const frac = items.length ? tagged / items.length : 0;
  const inWindow = items.filter((i) => {
    const f = formalityOf(i);
    return f == null || (f >= ctx.profile.formalityMin && f <= ctx.profile.formalityMax);
  }).length / (items.length || 1);
  const raw = clamp01(0.6 * inWindow + 0.4 * frac);
  return { raw, detail: raw >= 0.7 ? `Suited to ${ctx.profile.label.toLowerCase()}` : "Loosely suits the occasion" };
}

function comfort(items: WardrobeItem[], ctx: EngineContext): { raw: number; detail: string } {
  let base = 0.55;
  const anyRelaxed = items.some((i) => /(relaxed|oversized|loose|comfort)/.test((i.fit ?? "") + " " + itemText(i)));
  const anyBreathable = items.some((i) => /(cotton|linen|khadi|jersey)/.test(fabricOf(i) ?? ""));
  const anyActive = items.some(isActivewear);
  if (anyRelaxed) base += 0.15;
  if (anyBreathable) base += 0.1;
  if (anyActive) base += 0.2;
  const raw = clamp01(base * ctx.profile.comfortMultiplier);
  return { raw, detail: raw >= 0.8 ? "Easy to move in all day" : "Reasonably comfortable" };
}

function styleAlignment(items: WardrobeItem[], ctx: EngineContext): { raw: number; detail: string } {
  const vibes = ctx.preferences.styleVibes.map((v) => v.toLowerCase());
  if (vibes.length === 0) return { raw: 0.6, detail: "Neutral match to your style" };
  let hits = 0;
  for (const i of items) {
    const t = itemText(i) + " " + (i.style ?? "").toLowerCase();
    if (vibes.some((v) => t.includes(v))) hits++;
  }
  const raw = clamp01(0.4 + 0.6 * (hits / (items.length || 1)));
  return { raw, detail: raw >= 0.7 ? "Close to your usual style" : "A gentle stretch from your usual style" };
}

function novelty(items: WardrobeItem[], ctx: EngineContext): { raw: number; detail: string } {
  const now = ctx.now ?? new Date();
  const core = items.filter((i) => CORE_ROLES.has(engineRole(i)));
  if (core.length === 0) return { raw: 0.5, detail: "" };
  const scores = core.map((i) => {
    const d = daysSinceWorn(i, now);
    if (d == null) return 1;            // never worn → fresh
    return clamp01(d / 30);             // ramps to full freshness by ~30 days
  });
  const raw = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { raw, detail: raw >= 0.7 ? "Freshens up pieces you haven't worn lately" : "" };
}

// ---- penalties (each returns magnitude 0..1 + detail) --------------------

function repeatPenalty(items: WardrobeItem[], ctx: EngineContext): { mag: number; detail: string } {
  const now = ctx.now ?? new Date();
  const office = ctx.profile.formalityTarget >= 4;
  const cd = office ? ctx.config.thresholds.item_cooldown_days_office : ctx.config.thresholds.item_cooldown_days_casual;
  const core = items.filter((i) => CORE_ROLES.has(engineRole(i)));
  let worst = 0;
  for (const i of core) {
    const d = daysSinceWorn(i, now);
    if (d != null && d < cd) worst = Math.max(worst, 1 - d / cd);
  }
  return { mag: worst, detail: worst > 0 ? "Worn recently" : "" };
}

function weatherSoftPenalty(items: WardrobeItem[], ctx: EngineContext): { mag: number; detail: string } {
  const t = ctx.weather.tempC;
  let mag = 0;
  if (t != null && t <= 14) {
    const hasWarmLayer = items.some((i) => (i.warmth ?? 0) >= 3 || engineRole(i) === "outerwear");
    if (!hasWarmLayer) mag = Math.max(mag, 0.5);
  }
  if (ctx.weather.isRaining) {
    const rainUnsafeShoe = items.some((i) => engineRole(i) === "footwear" && (i.footwear_weather === "rain_unsafe" || /suede|canvas/.test(itemText(i))));
    if (rainUnsafeShoe) mag = Math.max(mag, 0.4);
  }
  return { mag, detail: mag > 0 ? "Weather could be handled better" : "" };
}

function patternRiskPenalty(items: WardrobeItem[], ctx: EngineContext): { mag: number; detail: string } {
  const core = items.filter((i) => CORE_ROLES.has(engineRole(i)));
  const bold = core.filter((i) => patternBoldness(i) >= 2).length;
  const mag = bold >= ctx.config.thresholds.max_bold_patterns ? 0.3 : 0; // at the limit = mild risk
  return { mag, detail: "" };
}

function accessoryIrrelevancePenalty(items: WardrobeItem[], ctx: EngineContext): { mag: number; detail: string } {
  const accessories = items.filter((i) => engineRole(i) === "accessory");
  let mag = 0;
  for (const a of accessories) {
    if (!accessoryRelevanceGuard(a, ctx).justified) mag = Math.max(mag, 0.6);
  }
  return { mag, detail: mag > 0 ? "Accessory adds little here" : "" };
}

// ---- top-level scoring ---------------------------------------------------

export interface OutfitScore {
  total: number;
  norm: number;               // 0..1 normalized quality (for confidence)
  factors: FactorContribution[];
  penalties: FactorContribution[];
  whyThisWorks: string[];
  tagCompleteness: number;    // 0..1 — how fully the items are tagged
}

function tagCompleteness(items: WardrobeItem[]): number {
  const fields: ((i: WardrobeItem) => unknown)[] = [
    (i) => i.formality, (i) => i.color_family ?? i.color, (i) => i.fabric,
    (i) => i.pattern_boldness ?? i.pattern, (i) => i.cultural_tag,
  ];
  let known = 0, total = 0;
  for (const i of items) for (const f of fields) { total++; if (f(i) != null) known++; }
  return total ? known / total : 0;
}

export function scoreOutfit(items: WardrobeItem[], ctx: EngineContext): OutfitScore {
  const w = ctx.config.scoringWeights;
  const pw = ctx.config.penaltyWeights;

  const pos: Array<[keyof typeof w, { raw: number; detail: string }]> = [
    ["color_harmony", colorHarmony(items, ctx)],
    ["formality_coherence", formalityCoherence(items, ctx)],
    ["occasion_fit", occasionFit(items, ctx)],
    ["comfort", comfort(items, ctx)],
    ["user_style_alignment", styleAlignment(items, ctx)],
    ["novelty", novelty(items, ctx)],
  ];
  const factors: FactorContribution[] = pos.map(([name, v]) => ({
    name, raw: v.raw, weight: w[name], contribution: v.raw * w[name], detail: v.detail,
  }));

  const neg: Array<[keyof typeof pw, { mag: number; detail: string }]> = [
    ["repeat", repeatPenalty(items, ctx)],
    ["weather_soft", weatherSoftPenalty(items, ctx)],
    ["pattern_risk", patternRiskPenalty(items, ctx)],
    ["accessory_irrelevance", accessoryIrrelevancePenalty(items, ctx)],
  ];
  const penalties: FactorContribution[] = neg.map(([name, v]) => ({
    name, raw: v.mag, weight: pw[name], contribution: -(v.mag * pw[name]), detail: v.detail,
  }));

  const posSum = factors.reduce((s, f) => s + f.contribution, 0);
  const posMax = Object.values(w).reduce((a, b) => a + b, 0);
  const penSum = penalties.reduce((s, f) => s + f.contribution, 0); // negative
  const total = posSum + penSum;
  const norm = clamp01((posSum / (posMax || 1)) + penSum / (posMax || 1));

  // Why This Works: top-3 positive factors that have a real detail string.
  const whyThisWorks = [...factors]
    .filter((f) => f.detail && f.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((f) => f.detail as string);

  return { total, norm, factors, penalties, whyThisWorks, tagCompleteness: tagCompleteness(items) };
}
