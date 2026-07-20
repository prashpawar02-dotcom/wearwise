// =====================================================================
// WearWise — Tag correction + check-queue TESTS (Phase 5, Module D)
// Pure + dependency-injected orchestrator; runs in-sandbox via test:engine.
// =====================================================================
import type { WardrobeItem } from "@/lib/types";
import {
  mergeTagConfidence,
  validateFieldValue,
  needsCheck,
  criticalFieldsToCheck,
  applyTagCorrection,
  shouldEmitTagCheckComplete,
  type CriticalField,
  type TagUpdateResult,
} from "@/lib/wardrobe/tag-correction";

let passed = 0,
  failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed++;
    console.log(`PASS | ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function mkItem(over: Partial<WardrobeItem>): WardrobeItem {
  return {
    id: "i1",
    user_id: "u1",
    image_path: "p.jpg",
    category: "Top",
    color: null,
    pattern: null,
    occasion_tags: null,
    notes: null,
    last_worn_at: null,
    ai_tag_status: "tagged",
    ai_confidence: null,
    user_facing_name: null,
    sub_category: null,
    style: null,
    secondary_colors: null,
    ethnic_western_fusion: null,
    auto_tagged_at: null,
    user_corrected_tags: false,
    availability_status: "available",
    in_wash_since: null,
    color_family: null,
    pattern_boldness: null,
    fabric: null,
    sleeve_length: null,
    fit: null,
    formality: 3,
    warmth: null,
    min_temp_c: null,
    max_temp_c: null,
    weather_tags: null,
    cultural_tag: "western",
    modesty_level: null,
    layering_role: null,
    accessory_role: null,
    footwear_formality: null,
    footwear_weather: null,
    set_id: null,
    set_required_components: null,
    avoid_with: null,
    tag_confidence: null,
    photo_quality_flag: false,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  } as WardrobeItem;
}

// ---- mergeTagConfidence ----
{
  const merged = mergeTagConfidence({ category: 0.4, color: 0.9, formality: 0.5 }, "category");
  ok("merge: edited field → 1", merged.category === 1);
  ok("merge: unrelated keys preserved untouched", merged.color === 0.9 && merged.formality === 0.5);
  ok("merge: null existing → just the edited field", JSON.stringify(mergeTagConfidence(null, "formality")) === JSON.stringify({ formality: 1 }));
  const before = { category: 0.4 };
  mergeTagConfidence(before, "category");
  ok("merge: does not mutate the input object", before.category === 0.4);
}

// ---- validateFieldValue ----
{
  ok("validate: category in list ok", validateFieldValue("category", "Kurta"));
  ok("validate: category not in list rejected", !validateFieldValue("category", "Sombrero"));
  ok("validate: formality integer 1..5 ok", validateFieldValue("formality", 4));
  ok("validate: formality 0 rejected", !validateFieldValue("formality", 0));
  ok("validate: formality 6 rejected", !validateFieldValue("formality", 6));
  ok("validate: formality 2.5 rejected", !validateFieldValue("formality", 2.5));
  ok("validate: formality as string rejected", !validateFieldValue("formality", "3"));
  ok("validate: cultural valid ok", validateFieldValue("cultural_tag", "indian_ethnic"));
  ok("validate: cultural invalid rejected", !validateFieldValue("cultural_tag", "martian"));
}

// ---- needsCheck / criticalFieldsToCheck ----
{
  // Confidence 1 fields are omitted; low/missing are included; order is deterministic.
  const item = mkItem({
    category: "Top",
    formality: null, // missing value → needs check
    cultural_tag: "western",
    tag_confidence: { category: 1, cultural_tag: 0.3 }, // category confirmed; cultural low
  });
  ok("check: confirmed (conf 1) category omitted", !needsCheck(item, "category"));
  ok("check: missing formality included", needsCheck(item, "formality"));
  ok("check: low-confidence cultural included", needsCheck(item, "cultural_tag"));
  const fields = criticalFieldsToCheck(item);
  ok("check: deterministic impact order (formality before cultural_tag)", fields.join(",") === "formality,cultural_tag", fields.join(","));
  ok("check: never more than three", criticalFieldsToCheck(mkItem({ category: null, formality: null, cultural_tag: null, tag_confidence: null })).length <= 3);

  // A present value with no confidence entry is NOT nagged.
  ok("check: present value + no confidence entry → not flagged", !needsCheck(mkItem({ category: "Top", tag_confidence: null }), "category"));

  // Confirmed fields disappear from the queue after a merge.
  const afterConfirm = mkItem({ formality: 4, cultural_tag: "western", tag_confidence: mergeTagConfidence({ cultural_tag: 0.3 }, "formality") });
  ok("check: field disappears once confirmed at 1", !criticalFieldsToCheck({ ...afterConfirm, tag_confidence: { formality: 1, cultural_tag: 1 } }).includes("formality"));
}

// ---- applyTagCorrection: persistence + telemetry contract ----
async function run() {
  const item = mkItem({ id: "own", category: "Top" });

  // success → one tag_edited after PROVEN persistence (returned row reflects it)
  {
    const events: Array<[string, Record<string, unknown>]> = [];
    const track = (e: string, p: Record<string, string | number | boolean>) => events.push([e, p]);
    let patched: Record<string, unknown> | null = null;
    const update = async (patch: Record<string, unknown>): Promise<TagUpdateResult> => {
      patched = patch;
      return { error: null, row: { id: "own", category: "Kurta", tag_confidence: { category: 1, color: 0.9 } } };
    };
    const out = await applyTagCorrection({ item, field: "category", value: "Kurta", update, track });
    ok("apply: success returns ok", out.ok === true);
    ok("apply: patch is ONLY {field, tag_confidence, user_corrected_tags} (no review flags)",
      !!patched && Object.keys(patched as object).sort().join(",") === "category,tag_confidence,user_corrected_tags");
    ok("apply: returns the verified server row", (out.row as Record<string, unknown> | undefined)?.category === "Kurta");
    ok("apply: exactly one tag_edited after success", events.length === 1 && events[0][0] === "tag_edited" && events[0][1].field === "category");
  }

  // zero returned rows (cross-owner / not-found) → failure, no telemetry
  {
    const events: string[] = [];
    const track = (e: string) => events.push(e);
    const update = async (): Promise<TagUpdateResult> => ({ error: null, row: null });
    const out = await applyTagCorrection({ item, field: "formality", value: 4, update, track });
    ok("apply: zero returned rows → ok false", out.ok === false);
    ok("apply: zero rows emit NO tag_edited", events.length === 0);
  }

  // supabase error → failure, no telemetry
  {
    const events: string[] = [];
    const track = (e: string) => events.push(e);
    const update = async (): Promise<TagUpdateResult> => ({ error: { message: "boom" }, row: null });
    const out = await applyTagCorrection({ item, field: "category", value: "Kurta", update, track });
    ok("apply: supabase error → ok false", out.ok === false);
    ok("apply: error emits NO tag_edited", events.length === 0);
  }

  // returned row does not reflect the saved value → failure, no telemetry
  {
    const events: string[] = [];
    const track = (e: string) => events.push(e);
    const update = async (): Promise<TagUpdateResult> => ({ error: null, row: { id: "own", category: "Top", tag_confidence: { category: 1 } } });
    const out = await applyTagCorrection({ item, field: "category", value: "Kurta", update, track });
    ok("apply: returned value mismatch → ok false (persistence unproven)", out.ok === false);
    ok("apply: value mismatch emits NO tag_edited", events.length === 0);
  }

  // returned row confidence not 1 → failure, no telemetry
  {
    const events: string[] = [];
    const track = (e: string) => events.push(e);
    const update = async (): Promise<TagUpdateResult> => ({ error: null, row: { id: "own", category: "Kurta", tag_confidence: { category: 0.5 } } });
    const out = await applyTagCorrection({ item, field: "category", value: "Kurta", update, track });
    ok("apply: returned confidence !== 1 → ok false", out.ok === false);
    ok("apply: confidence mismatch emits NO tag_edited", events.length === 0);
  }

  // invalid value → no update call, no telemetry
  {
    const events: string[] = [];
    let updateCalled = false;
    const track = (e: string) => events.push(e);
    const update = async (): Promise<TagUpdateResult> => { updateCalled = true; return { error: null, row: { id: "own" } }; };
    const out = await applyTagCorrection({ item, field: "formality", value: 9, update, track });
    ok("apply: invalid value rejected before persistence", out.ok === false && !updateCalled);
    ok("apply: invalid value emits NO tag_edited", events.length === 0);
  }
}

// ---- shouldEmitTagCheckComplete ----
{
  const presented: CriticalField[] = ["formality", "cultural_tag"];
  ok("complete: not complete until all confirmed", !shouldEmitTagCheckComplete(presented, new Set<CriticalField>(["formality"])));
  ok("complete: complete when all presented confirmed", shouldEmitTagCheckComplete(presented, new Set<CriticalField>(["formality", "cultural_tag"])));
  ok("complete: empty presented never completes", !shouldEmitTagCheckComplete([], new Set<CriticalField>()));
}

run().then(() => {
  console.log(`\n${passed} passed / ${failed} failed`);
  if (failed) {
    console.log("FAILURES:\n - " + fails.join("\n - "));
    process.exit(1);
  }
  process.exit(0);
});
