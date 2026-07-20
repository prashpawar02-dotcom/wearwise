// =====================================================================
// WearWise — Dashboard single-hero + single-write guard (regression test)
// Structural assertions on the dashboard source proving:
//  (a) Single-Hero Today contract: exactly ONE primary recommendation; the
//      legacy Best Pick render path is gone; missing drop => idempotent
//      get-or-create (not legacy fallback); authenticated data is not cached.
//  (b) Single-Write contract: a request performs AT MOST ONE write-producing
//      action (one create XOR one regenerate); a created/regenerated outfit is
//      still validated and fails closed if stale (no second write).
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}

const page = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
const daily = readFileSync("src/lib/daily-drop.ts", "utf8");
const dropCards = (page.match(/<DailyDropCard/g) ?? []).length;

// ---- (a) exactly one primary recommendation ----
ok("dashboard renders exactly one DailyDropCard", dropCards === 1, `count=${dropCards}`);
ok("Today's Drop and legacy Best Pick cannot render together",
  dropCards === 1 && !page.includes("RealBestPick"));
ok("dashboard does NOT reference RealBestPick", !page.includes("RealBestPick"));
ok("dashboard does NOT reference SampleBestPick", !page.includes("SampleBestPick"));
ok("dashboard does NOT use buildBestPick", !page.includes("buildBestPick"));
ok("'Best Pick Today' is absent from dashboard source", !page.includes("Best Pick Today"));
ok("'View full look' is absent from dashboard source", !page.includes("View full look"));
ok("no legacy outfit_suggestions query on the dashboard", !page.includes('from("outfit_suggestions")'));
ok("legacy loadTodayDrop is gone (replaced by ensureTodayDrop)", !page.includes("loadTodayDrop"));
ok("dashboard uses ensureTodayDrop (get-or-create)", page.includes("ensureTodayDrop("));
ok("get-or-create bypasses the notification opt-in", page.includes("ignoreOptIn: true"));
ok("prepareDailyDrop honours the ignoreOptIn bypass",
  daily.includes("ignoreOptIn?: boolean") && daily.includes("!options.ignoreOptIn"));
ok("dashboard shows one honest constrained state (no legacy fallback)",
  page.includes("We couldn't prepare today's outfit"));
ok("dashboard offers a retry on the constrained state", page.includes("<PrepareDropButton compact />"));
ok("dashboard is dynamic / not globally cached",
  page.includes('export const dynamic = "force-dynamic"'));

// ---- (b) single-write contract inside ensureTodayDrop ----
const fnStart = page.indexOf("async function ensureTodayDrop");
const fn = fnStart >= 0 ? page.slice(fnStart) : "";
const createIdx = fn.indexOf("prepareDailyDrop(userId, { supabase, ignoreOptIn: true })");
const regenIdx = fn.indexOf("prepareDailyDrop(userId, { force: true, supabase, ignoreOptIn: true })");
const elseIdx = fn.indexOf('} else {'); // Phase 4: create in if-branch, freshness regen in else-branch
const finalValIdx = fn.indexOf("const validity = await validateOutfitCurrent(supabase, userId, ids);");

ok("exactly one create call in ensureTodayDrop",
  (fn.match(/prepareDailyDrop\(userId, \{ supabase, ignoreOptIn: true \}\)/g) ?? []).length === 1);
ok("exactly one regenerate call in ensureTodayDrop",
  (fn.match(/prepareDailyDrop\(userId, \{ force: true, supabase, ignoreOptIn: true \}\)/g) ?? []).length === 1);
ok("explicit writeAttempted guard present", fn.includes("let writeAttempted = false"));
ok("explicit path tracking (existing | created | regenerated)",
  fn.includes('"existing" | "created" | "regenerated"'));
ok("create is on the missing-row branch, regenerate on the existing branch (mutually exclusive)",
  createIdx >= 0 && regenIdx >= 0 && elseIdx >= 0 && createIdx < elseIdx && regenIdx > elseIdx);
ok("the create branch never regenerates (no create+regenerate in one request)",
  createIdx >= 0 && elseIdx > createIdx && !fn.slice(createIdx, elseIdx).includes("force: true"));
ok("FINAL availability validation always runs on selected ids after the branches",
  finalValIdx > regenIdx && finalValIdx > createIdx);
ok("created/regenerated stale result fails closed (no second write)",
  fn.includes("if (ids.length === 0 || !validity.valid)") && fn.includes("daily_drop_${source}"));
ok("final render still validates (validation NOT skipped for created rows)",
  fn.includes("const members: WardrobeItem[] = validity.items;"));

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
