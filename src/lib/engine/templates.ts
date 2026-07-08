// =====================================================================
// WearWise — Engine v2 STRUCTURE TEMPLATES (Phase 1)
// Assembles candidate outfits from the eligible pool. Set integrity is a
// FILTER: an ethnic set is emitted only when every required component is
// present. Completions (footwear / outerwear / drape / accessory) respect the
// guards (accessory only when justified; drape only on ethnic; layer only
// when cold). Candidate counts are bounded for the performance budget.
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import type { EngineContext, EngineRole } from "@/lib/engine/types";
import { engineRole, isDupatta, formalityOf } from "@/lib/engine/classify";
import { accessoryRelevanceGuard } from "@/lib/engine/guards";

export interface Candidate { items: WardrobeItem[]; template: string; }

const FANOUT = 8; // top-N per role considered, bounds the combination space

function bucket(pool: WardrobeItem[]): Record<EngineRole, WardrobeItem[]> {
  const b = {
    upper: [], ethnic_upper: [], bottom: [], one_piece: [], saree: [],
    outerwear: [], drape: [], footwear: [], accessory: [],
    activewear_top: [], activewear_bottom: [], unknown: [],
  } as Record<EngineRole, WardrobeItem[]>;
  for (const i of pool) b[engineRole(i)].push(i);
  return b;
}

/** Quick pre-rank so we only fully-score the most promising pieces. */
function prerank(items: WardrobeItem[], ctx: EngineContext): WardrobeItem[] {
  const target = ctx.profile.formalityTarget;
  return [...items].sort((a, b) => score(b) - score(a));
  function score(i: WardrobeItem): number {
    const f = formalityOf(i);
    const formalityCloseness = f == null ? 0 : 1 - Math.abs(f - target) / 5;
    const worn = i.last_worn_at ? Date.parse(i.last_worn_at) : 0;
    const novelty = worn ? Math.min(1, (Date.now() - worn) / (30 * 86_400_000)) : 1;
    return formalityCloseness + 0.5 * novelty;
  }
}

/** Pick the best-fitting footwear (formality-closest) that is allowed. */
function pickFootwear(b: Record<EngineRole, WardrobeItem[]>, ctx: EngineContext): WardrobeItem | null {
  const shoes = prerank(b.footwear, ctx);
  return shoes[0] ?? null;
}

/** Pick a justified accessory, or null (default = none). */
function pickAccessory(b: Record<EngineRole, WardrobeItem[]>, ctx: EngineContext): WardrobeItem | null {
  for (const a of b.accessory) {
    if (accessoryRelevanceGuard(a, ctx).justified) return a;
  }
  return null;
}

/** Add shared completions (shoes always if present; accessory only if justified). */
function complete(core: WardrobeItem[], b: Record<EngineRole, WardrobeItem[]>, ctx: EngineContext, opts: { drape?: WardrobeItem | null; layer?: boolean } = {}): WardrobeItem[] {
  const items = [...core];
  if (!ctx.profile.activewearOnly) {
    if (opts.drape) items.push(opts.drape);
    if (opts.layer && ctx.weather.tempC != null && ctx.weather.tempC <= 16) {
      const layer = prerank(b.outerwear, ctx)[0];
      if (layer && !items.includes(layer)) items.push(layer);
    }
  }
  const shoes = pickFootwear(b, ctx);
  if (shoes && !items.includes(shoes)) items.push(shoes);
  if (!ctx.profile.activewearOnly) {
    const acc = pickAccessory(b, ctx);
    if (acc && !items.includes(acc)) items.push(acc);
  }
  return items;
}

/**
 * Build bounded candidate outfits across every structure template.
 * Deterministic: same pool + context → same candidates.
 */
export function buildCandidates(pool: WardrobeItem[], ctx: EngineContext): Candidate[] {
  const b = bucket(pool);
  for (const k of Object.keys(b) as EngineRole[]) b[k] = prerank(b[k], ctx);
  const out: Candidate[] = [];

  // --- ethnic sets first (set integrity = filter) ---
  const bySet = new Map<string, WardrobeItem[]>();
  for (const i of pool) if (i.set_id) bySet.set(i.set_id, [...(bySet.get(i.set_id) ?? []), i]);
  for (const [, setItems] of bySet) {
    const required = new Set<string>();
    for (const i of setItems) for (const c of i.set_required_components ?? []) required.add(c);
    const presentRoles = new Set(setItems.map((i) => engineRole(i) as string));
    const complete = [...required].every((r) => presentRoles.has(r) || [...presentRoles].some((p) => p.includes(r)));
    if (required.size === 0 || complete) {
      out.push({ items: completeSet(setItems, b, ctx), template: "ethnic_set" });
    }
  }

  // --- GYM / activewear only ---
  if (ctx.profile.activewearOnly) {
    const tops = b.activewear_top.slice(0, FANOUT);
    const bottoms = b.activewear_bottom.slice(0, FANOUT);
    for (const t of tops) for (const bt of bottoms) {
      out.push({ items: complete([t, bt], b, ctx), template: "gym" });
    }
    return dedupe(out);
  }

  // --- one-piece (dress / gown / jumpsuit) ---
  for (const op of b.one_piece.slice(0, FANOUT)) {
    out.push({ items: complete([op], b, ctx), template: "one_piece" });
  }

  // --- saree-as-set (+ optional blouse via upper) ---
  for (const sr of b.saree.slice(0, FANOUT)) {
    const drape = b.drape.find(isDupatta) ?? null;
    out.push({ items: complete([sr], b, ctx, { drape }), template: "saree_set" });
  }

  // --- kurta + bottom (+ conditional dupatta) ---
  for (const k of b.ethnic_upper.slice(0, FANOUT)) {
    for (const bt of b.bottom.slice(0, FANOUT)) {
      const drape = b.drape.find(isDupatta) ?? null;
      out.push({ items: complete([k, bt], b, ctx, { drape, layer: true }), template: "kurta_set" });
    }
  }

  // --- western separates (top + bottom): formal + casual both covered ---
  for (const t of b.upper.slice(0, FANOUT)) {
    for (const bt of b.bottom.slice(0, FANOUT)) {
      out.push({ items: complete([t, bt], b, ctx, { layer: true }), template: "separates" });
    }
  }

  return dedupe(out);
}

/** Complete an ethnic set: keep the set together, add shoes + (justified) accessory. */
function completeSet(setItems: WardrobeItem[], b: Record<EngineRole, WardrobeItem[]>, ctx: EngineContext): WardrobeItem[] {
  const items = [...setItems];
  const shoes = pickFootwear(b, ctx);
  if (shoes && !items.includes(shoes)) items.push(shoes);
  const acc = pickAccessory(b, ctx);
  if (acc && !items.includes(acc)) items.push(acc);
  return items;
}

function dedupe(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of cands) {
    const key = c.items.map((i) => i.id).sort().join("|");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
