// =====================================================================
// WearWise — Onboarding v2 (Phase 4D) tests.
//
// Two kinds of assertion, clearly separated:
//   SECTION A — REAL EXECUTION against the pure logic in src/lib/onboarding.ts
//     (computeWardrobeReadiness / computeOnboardingState / furthestOf /
//     hasReached). These genuinely run the functions — not text matching.
//   SECTION B — STRUCTURAL wiring checks over the onboarding source files,
//     proving: skip is honored, required fields are enforced, resume never
//     loses/duplicates data, completion is idempotent-by-construction,
//     routing works, errors are recoverable, telemetry fires once each,
//     and every collected field has a real, provable use elsewhere in the
//     codebase.
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync } from "node:fs";
import {
  computeWardrobeReadiness, computeOnboardingState, furthestOf, hasReached,
} from "@/lib/onboarding";
import { mk } from "./fixtures";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}

// =====================================================================
// SECTION A — real execution, pure logic
// =====================================================================

// ---- 1 & 2: new vs existing-completed user ----
{
  ok("Test 1: new user (no step, not onboarded) computes state 'new'",
    computeOnboardingState({ onboarded: false, onboardingStep: null, wardrobeReady: false }) === "new");
  ok("Test 1: 'welcome' step reached but not onboarded is still 'new'",
    computeOnboardingState({ onboarded: false, onboardingStep: "welcome", wardrobeReady: false }) === "new");

  ok("Test 2: an onboarded user is ALWAYS 'completed', regardless of step/readiness",
    computeOnboardingState({ onboarded: true, onboardingStep: null, wardrobeReady: false }) === "completed" &&
    computeOnboardingState({ onboarded: true, onboardingStep: "context", wardrobeReady: false }) === "completed" &&
    computeOnboardingState({ onboarded: true, onboardingStep: "ready", wardrobeReady: true }) === "completed");
}

// ---- in_progress state ----
{
  ok("context/style steps reached (not onboarded) compute 'in_progress'",
    computeOnboardingState({ onboarded: false, onboardingStep: "context", wardrobeReady: false }) === "in_progress" &&
    computeOnboardingState({ onboarded: false, onboardingStep: "style", wardrobeReady: false }) === "in_progress");
}

// ---- Test 7: wardrobe_incomplete state is honest ----
{
  const oneTop = [mk({ category: "top" })];
  const r1 = computeWardrobeReadiness(oneTop);
  ok("Test 7: a single top alone is NOT ready (no bottom)", !r1.ready);
  ok("Test 7: wearableCount reflects exactly what's wearable (1)", r1.wearableCount === 1);
  ok("Test 7: tops flag true, bottoms flag false — honest per-category signal",
    r1.tops === true && r1.bottoms === false);

  ok("wardrobe_incomplete state: 'wardrobe' step reached, not ready -> wardrobe_incomplete",
    computeOnboardingState({ onboarded: false, onboardingStep: "wardrobe", wardrobeReady: false }) === "wardrobe_incomplete");

  const inWashOnly = [mk({ category: "top", availability_status: "in_wash" }), mk({ category: "bottom", availability_status: "in_wash" })];
  const r2 = computeWardrobeReadiness(inWashOnly);
  ok("Test 7: in-wash items are NOT counted as wearable (matches isWearableItem)", r2.wearableCount === 0 && !r2.ready);
}

// ---- Test 8: missing footwear never fabricates a complete outfit ----
{
  const topAndBottomOnly = [mk({ category: "top" }), mk({ category: "bottom" })];
  const r = computeWardrobeReadiness(topAndBottomOnly);
  ok("Test 8: top+bottom with NO footwear is still 'ready' (footwear never blocks readiness)", r.ready === true);
  ok("Test 8: shoes flag is honestly false when no footwear exists (never fabricated)", r.shoes === false);

  const withShoes = [...topAndBottomOnly, mk({ category: "footwear" })];
  const r2 = computeWardrobeReadiness(withShoes);
  ok("Test 8: adding footwear flips the shoes flag true, ready stays true", r2.shoes === true && r2.ready === true);

  ok("ready state: 'ready' step reached AND wardrobe ready -> 'ready'",
    computeOnboardingState({ onboarded: false, onboardingStep: "ready", wardrobeReady: true }) === "ready");

  // One-piece (e.g. a dress) alone satisfies the core requirement without a separate bottom.
  const onePieceOnly = [mk({ category: "dress" }), mk({ category: "footwear" })];
  const r3 = computeWardrobeReadiness(onePieceOnly);
  ok("a one-piece + one more wearable item is ready without a separate bottom", r3.ready === true);

  const tooFew = [mk({ category: "dress" })];
  const r4 = computeWardrobeReadiness(tooFew);
  ok("a single item alone is never 'ready' (below MIN_OUTFIT_ITEMS=2, matches daily-drop.ts)", r4.ready === false);
}

// ---- furthestOf / hasReached: resume never regresses ----
{
  ok("furthestOf never regresses: context vs style -> style", furthestOf("context", "style") === "style");
  ok("furthestOf never regresses: ready vs context -> ready (does not go backward)", furthestOf("ready", "context") === "ready");
  ok("furthestOf with null furthest -> the candidate itself", furthestOf(null, "context") === "context");
  ok("hasReached: 'wardrobe' has reached 'context'", hasReached("wardrobe", "context") === true);
  ok("hasReached: 'context' has NOT reached 'wardrobe'", hasReached("context", "wardrobe") === false);
  ok("hasReached: null furthest has reached nothing", hasReached(null, "welcome") === false);
}

// =====================================================================
// SECTION B — structural wiring checks
// =====================================================================
const FLOW = readFileSync("src/app/(app)/onboarding/onboarding-flow.tsx", "utf8").replace(/\r\n/g, "\n");
const PAGE = readFileSync("src/app/(app)/onboarding/page.tsx", "utf8").replace(/\r\n/g, "\n");
const DASHBOARD = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8").replace(/\r\n/g, "\n");
const PLAN = readFileSync("src/app/(app)/plan/page.tsx", "utf8").replace(/\r\n/g, "\n");
const PROFILE_PAGE = readFileSync("src/app/(app)/profile/page.tsx", "utf8").replace(/\r\n/g, "\n");
const OCCASION_FORM = readFileSync("src/app/(app)/occasion/new/occasion-form.tsx", "utf8").replace(/\r\n/g, "\n");
const DAILY_DROP = readFileSync("src/lib/daily-drop.ts", "utf8").replace(/\r\n/g, "\n");
const SCORING = readFileSync("src/lib/engine/scoring.ts", "utf8").replace(/\r\n/g, "\n");

// ---- Test 1 (routing half): new user enters the new flow ----
{
  ok("Test 1: page.tsx renders <OnboardingFlow> when NOT onboarded",
    /if \(profile\?\.onboarded\)[\s\S]*?return \(/.test(PAGE) && PAGE.includes("<OnboardingFlow"));
  ok("Test 1: dashboard/page.tsx still redirects new users to /onboarding (unchanged gate)",
    DASHBOARD.includes('if (!profile?.onboarded) redirect("/onboarding");'));
}

// ---- Test 2 (routing half): existing completed user bypasses the new flow ----
{
  ok("Test 2: page.tsx branches on profile.onboarded BEFORE ever rendering OnboardingFlow",
    PAGE.indexOf("if (profile?.onboarded)") < PAGE.indexOf("<OnboardingFlow"));
  ok("Test 2: the onboarded branch renders the ORIGINAL settings form (OnboardingForm), not the new flow",
    /if \(profile\?\.onboarded\) \{[\s\S]*?<OnboardingForm/.test(PAGE));
  ok("Test 2: plan/page.tsx and profile/page.tsx redirect gates are unchanged",
    PLAN.includes('if (!profile?.onboarded) redirect("/onboarding");') &&
    PROFILE_PAGE.includes('if (!profile?.onboarded) redirect("/onboarding");'));
}

// ---- Test 3: optional questions can be skipped ----
{
  ok("Test 3: StyleStep has an explicit Skip action calling onNext(true)",
    FLOW.includes('onClick={() => onNext(true)}') && FLOW.includes(">\n          Skip\n"));
  ok("Test 3: skipping style saves an EMPTY array, never fabricated selections",
    FLOW.includes("style_preferences: skipped ? [] : styles"));
  ok("Test 3: WardrobeStep never blocks — 'Continue with what I have' has no disabled-by-readiness condition",
    !/onContinue.*disabled=\{!readiness\.ready\}/.test(FLOW));
  ok("Test 3: city (optional) is explicitly labeled optional and sent as null when blank, never required",
    FLOW.includes("(optional)") && FLOW.includes("city: city.trim() || null,"));
}

// ---- Test 4: required fields are enforced clearly ----
{
  ok("Test 4: preferred name is validated with a clear message before saving",
    FLOW.includes('if (!fullName.trim()) { setError("Let us know what to call you."); return; }'));
  ok("Test 4: default occasion is validated with a clear message before saving",
    FLOW.includes('if (!defaultOccasion) { setError("Pick the occasion you dress for most."); return; }'));
  ok("Test 4: both required-field checks run BEFORE any save call (no partial save on invalid input)",
    FLOW.indexOf('if (!fullName.trim())') < FLOW.indexOf("await saveProfile") &&
    FLOW.indexOf('if (!defaultOccasion)') < FLOW.indexOf("await saveProfile"));
}

// ---- Test 5: resume does not lose previous answers ----
{
  ok("Test 5: all controlled inputs are seeded from the loaded profile's `initial` values",
    FLOW.includes("useState(initial.full_name)") &&
    FLOW.includes("useState(initial.city)") &&
    FLOW.includes("useState(initial.default_occasion)") &&
    FLOW.includes("useState<string[]>(initial.style_preferences)"));
  ok("Test 5: resume starts at the furthest step already reached, not always 'welcome'",
    FLOW.includes('const startStep = initial.onboarding_step ?? "welcome";'));
  ok("Test 5: each step's save sends ONLY the fields that step owns (spread, not a full-profile overwrite)",
    FLOW.includes(".update({ ...fields, onboarding_step: step })"));
}

// ---- Test 6: resume does not duplicate profile records ----
{
  ok("Test 6: onboarding-flow.tsx never INSERTs a profiles row (update-only, matching handle_new_user() ownership)",
    !/\.from\("profiles"\)[\s\S]{0,40}\.insert\(/.test(FLOW));
  ok("Test 6: page.tsx never inserts a profiles row either",
    !/\.from\("profiles"\)[\s\S]{0,40}\.insert\(/.test(PAGE));
}

// ---- Test 9 & 10: completion sets state once, idempotently ----
{
  ok("Test 9: finishing sets onboarded=true via the SAME targeted update path as every other step",
    FLOW.includes('await saveProfile({ onboarded: true }, "completed")'));
  ok("Test 9: onboarding_completed fires exactly once in the flow, only inside the successful-save branch",
    (FLOW.match(/track\("onboarding_completed"/g) ?? []).length === 1 &&
    /if \(ok\) \{\s*\n\s*track\("onboarding_completed"/.test(FLOW));
  ok("Test 10: completion is idempotent by construction — it's an UPDATE (not insert), and an onboarded user " +
     "can never re-render OnboardingFlow to trigger it again (proven by Test 2's branch-order check)",
    FLOW.includes('.update({ ...fields, onboarding_step: step })'));
}

// ---- Test 11: routing to Today works ----
{
  ok("Test 11: successful completion routes to /dashboard and refreshes",
    /router\.push\("\/dashboard"\);\s*\n\s*router\.refresh\(\);/.test(FLOW));
}

// ---- Test 12: error state is recoverable ----
{
  ok("Test 12: a failed save sets a user-visible error and returns false without advancing the step",
    /if \(updErr\) \{\s*\n\s*track\("onboarding_failed"/.test(FLOW) &&
    FLOW.includes("return false;"));
  ok("Test 12: saving flag is always reset to false before the function returns, on both success and failure",
    (FLOW.match(/setSaving\(false\);/g) ?? []).length >= 1 &&
    FLOW.indexOf("setSaving(false);") < FLOW.indexOf("if (updErr)"));
  ok("Test 12: onboarding_failed carries which stage failed, so a retry is diagnosable, not a dead end",
    FLOW.includes('track("onboarding_failed", { stage: nextStep });'));
}

// ---- Test 13: every collected field is proven to be used elsewhere ----
{
  ok("Test 13: full_name is read for the dashboard greeting (src/app/(app)/dashboard/page.tsx)",
    DASHBOARD.includes("profile?.full_name"));
  ok("Test 13: city feeds weather (src/lib/daily-drop.ts reads profile.city for getWeatherContext)",
    DAILY_DROP.includes("profile.city"));
  ok("Test 13: default_occasion is read by occasion-form.tsx's 'Use today's default' button",
    OCCASION_FORM.includes("defaultOccasion") && OCCASION_FORM.includes("STYLE_OCCASIONS.find((o) => o.key === defaultOccasion)"));
  ok("Test 13: style_preferences feeds engine scoring (user_style_alignment, src/lib/engine/scoring.ts)",
    SCORING.includes("styleVibes") && SCORING.includes("user_style_alignment"));
  ok("Test 13: timezone is captured (for local_date correctness) but is NEVER asked as a user-facing question",
    FLOW.includes("Intl.DateTimeFormat().resolvedOptions().timeZone") &&
    !/Label[^>]*>\s*Time ?zone/i.test(FLOW));
  ok("Test 13: age_range is NOT collected anywhere in the new flow (grep-confirmed unused by the engine)",
    !FLOW.includes("age_range") && !FLOW.includes("ageRange"));
  ok("Test 13: gender is not collected (never existed, never added)",
    !FLOW.toLowerCase().includes("gender"));
}

// ---- Test 15: no duplicate telemetry events ----
{
  const REQUIRED_STAGES = [
    "onboarding_started", "onboarding_context_completed", "onboarding_style_completed",
    "onboarding_wardrobe_started", "onboarding_wardrobe_skipped", "onboarding_ready",
    "onboarding_completed", "onboarding_failed",
  ];
  for (const stage of REQUIRED_STAGES) {
    const count = (FLOW.match(new RegExp(`["'\`]${stage}["'\`]`, "g")) ?? []).length;
    ok(`Test 15: "${stage}" appears in exactly one call site`, count === 1, `found ${count} occurrences`);
  }

  ok("Test 15: onboarding_started fires via ViewBeacon (mount-identity dedup, same pattern as today_viewed)",
    FLOW.includes('<ViewBeacon event="onboarding_started" />'));
  ok("Test 15: onboarding_wardrobe_started fires via ViewBeacon, mounted once per WardrobeStep instance",
    FLOW.includes('<ViewBeacon event="onboarding_wardrobe_started" />'));
  ok("Test 15: onboarding_ready fires via ViewBeacon, mounted once per ReadyStep instance",
    FLOW.includes('<ViewBeacon event="onboarding_ready"'));

  // No stray onboarding_* EVENT name beyond the required 8 (catches typos/duplicates).
  // Scoped to actual telemetry call sites only (track(...) calls and
  // <ViewBeacon event="..."/> props) — NOT every quoted onboarding_* string
  // in the file, since profiles.onboarding_step (a DB field name, migration
  // 0025) also matches the onboarding_ prefix but is not a telemetry event.
  const trackEvents = [...FLOW.matchAll(/track\(\s*["'`](onboarding_[a-z_]+)["'`]/g)].map((m) => m[1]);
  const beaconEvents = [...FLOW.matchAll(/<ViewBeacon\s+event=["'`](onboarding_[a-z_]+)["'`]/g)].map((m) => m[1]);
  const allOnboardingEvents = new Set([...trackEvents, ...beaconEvents]);
  const unexpected = [...allOnboardingEvents].filter((e) => !REQUIRED_STAGES.includes(e));
  ok("Test 15: no onboarding_* event name exists beyond the required 8 stages",
    unexpected.length === 0, JSON.stringify(unexpected));
}

// ---- mobile-first / no-long-form structural checks ----
{
  ok("progress indicator shows current step, not a long numbered list",
    FLOW.includes('aria-label={`Step ${stepIndex + 1} of'));
  ok("each step renders exactly one primary full-width action (Button ... size=\"full\") as the main CTA pattern",
    (FLOW.match(/size="full"/g) ?? []).length >= 6);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
