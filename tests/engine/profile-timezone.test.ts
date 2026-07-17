// =====================================================================
// WearWise — profile-query hardening + timezone tests (Phase 4)
// Proves a profile QUERY FAILURE is never mislabelled as a missing profile,
// a true zero-row is setup_required, technical copy never blames the wardrobe,
// and a valid legacy zone (Asia/Calcutta) produces no fallback warning.
// =====================================================================
import { readFileSync } from "node:fs";
import { classifyProfileResult, PROFILE_TECHNICAL_MESSAGE } from "@/lib/recommendation/profile-guard";
import { resolveTimezone, normalizeTimeZone, localDateISO } from "@/lib/time/timezone";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// 1. Existing profile + successful query → ok (continue).
ok("existing profile + no error → ok",
  classifyProfileResult({ data: { id: "44611c14-847e-4048-9b1e-173ef408ab22", full_name: "priyanka" }, error: null }).status === "ok");

// 2. Query error → profile_query_failed, NEVER a missing profile.
{
  const c = classifyProfileResult({ data: null, error: { code: "PGRST301", message: "server error" } });
  ok("query error → profile_query_failed", c.status === "profile_query_failed");
  ok("query error is NOT setup_required/missing", c.status !== "setup_required");
}

// 3. True zero rows (no error) → setup_required.
ok("no error + null data → setup_required",
  classifyProfileResult({ data: null, error: null }).status === "setup_required");

// 4. Mismatched service-role key (local URL + hosted-signed JWT) → local PostgREST
//    rejects the token → this is a technical query failure, not a missing profile.
{
  const jwtReject = classifyProfileResult({ data: null, error: { code: "PGRST301", message: "JWSError JWSInvalidSignature", hint: null, details: "invalid JWT" } });
  ok("mismatched service-role key surfaces as technical (profile_query_failed)", jwtReject.status === "profile_query_failed");
}

// 5. Technical copy never blames the wardrobe.
{
  const guard = read("src/lib/recommendation/profile-guard.ts");
  const prepareRoute = read("src/app/api/daily-drop/prepare/route.ts");
  const dash = read("src/app/(app)/dashboard/page.tsx");
  ok("technical message does not mention wardrobe", !/wardrobe/i.test(PROFILE_TECHNICAL_MESSAGE));
  void guard;
  ok("prepare route returns technical_error (500) for a profile query failure",
    prepareRoute.includes('reason: "technical_error"') && prepareRoute.includes("status: 500") && prepareRoute.includes('result.status === "error"'));
  ok("prepare route routes an absent profile to setup_required (409), not a wardrobe failure",
    prepareRoute.includes('status: "setup_required"') && prepareRoute.includes("status: 409"));
  // The dashboard technical branch must not use the wardrobe dead-end copy.
  const techIdx = dash.indexOf("todayDrop.technical ? (");
  const techBranch = techIdx >= 0 ? dash.slice(techIdx, techIdx + 500) : "";
  ok("dashboard technical branch exists and does not blame the wardrobe",
    techIdx >= 0 && !techBranch.includes("from your available wardrobe"));
}

// 6. Valid Asia/Calcutta (legacy alias) → no fallback warning; normalized to Kolkata.
{
  const r = resolveTimezone("Asia/Calcutta");
  ok("Asia/Calcutta does NOT trigger a fallback warning", r.usedFallback === false);
  ok("Asia/Calcutta normalizes to Asia/Kolkata", normalizeTimeZone("Asia/Calcutta") === "Asia/Kolkata" && r.timeZone === "Asia/Kolkata");
  ok("localDateISO resolves a date for Asia/Calcutta", /^\d{4}-\d{2}-\d{2}$/.test(localDateISO("Asia/Calcutta", new Date("2026-07-15T20:00:00Z"))));
  // A genuinely invalid zone still falls back (regression guard).
  ok("invalid zone still falls back", resolveTimezone("Not/AZone").usedFallback === true);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
