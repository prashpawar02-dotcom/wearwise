// =====================================================================
// WearWise — Quiet-Gem cooldown state-machine TESTS (Phase 5, Module B)
// Pure; runs in-sandbox via `npm run test:engine`.
// =====================================================================
import {
  applyGemRemoval,
  isGemCoolingDown,
  resolveGemState,
  INITIAL_GEM_STATE,
  GEM_SKIP_THRESHOLD,
  type GemCooldownState,
} from "@/lib/wardrobe/gem-cooldown";
import { GEM_COOLDOWN_DAYS } from "@/lib/wardrobe/insights";

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

const NOW = new Date("2026-07-17T08:00:00Z");
const DAY_MS = 86_400_000;
const plusDays = (base: Date, n: number) => new Date(base.getTime() + n * DAY_MS);

ok("threshold is 2 explicit removals", GEM_SKIP_THRESHOLD === 2);

// 1st removal → count 1, no cooldown, not rested.
const r1 = applyGemRemoval(INITIAL_GEM_STATE, NOW);
ok("1st removal → count 1", r1.next.gem_skip_count === 1);
ok("1st removal → no cooldown", r1.next.gem_cooldown_until === null);
ok("1st removal → not justRested", r1.justRested === false);

// 2nd removal → count 2, cooldown = now + 90d, rested once.
const r2 = applyGemRemoval(r1.next, NOW);
ok("2nd removal → count 2", r2.next.gem_skip_count === 2);
ok("2nd removal → cooldown set to +90d", r2.next.gem_cooldown_until === plusDays(NOW, GEM_COOLDOWN_DAYS).toISOString());
ok("2nd removal → rested notified", r2.next.gem_rested_notified === true);
ok("2nd removal → justRested true (emit gem_rested once)", r2.justRested === true);

// 3rd removal while cooling → no-op, not justRested again (message shown once).
const r3 = applyGemRemoval(r2.next, plusDays(NOW, 10));
ok("3rd removal while cooling → no new cooldown", r3.next.gem_cooldown_until === r2.next.gem_cooldown_until);
ok("3rd removal while cooling → justRested stays false", r3.justRested === false);

// Cooling window — exact expiry boundary.
const cooling = r2.next;
ok("cooling: 1ms before expiry still resting", isGemCoolingDown(cooling, new Date(plusDays(NOW, GEM_COOLDOWN_DAYS).getTime() - 1)));
ok("cooling: AT expiry boundary is expired (exclusive)", !isGemCoolingDown(cooling, plusDays(NOW, GEM_COOLDOWN_DAYS)));
ok("cooling: after expiry not resting", !isGemCoolingDown(cooling, plusDays(NOW, GEM_COOLDOWN_DAYS + 1)));

// Expiry resets state so the two-removal cycle restarts.
const resolved = resolveGemState(cooling, plusDays(NOW, GEM_COOLDOWN_DAYS));
ok("expiry → state resets to initial", resolved.gem_skip_count === 0 && resolved.gem_cooldown_until === null && resolved.gem_rested_notified === false);

// After expiry, ONE removal only takes count to 1 (needs two again — no instant re-rest).
const afterExpiry = applyGemRemoval(cooling, plusDays(NOW, GEM_COOLDOWN_DAYS + 2));
ok("post-expiry: single removal → count 1 (cycle restarts)", afterExpiry.next.gem_skip_count === 1 && afterExpiry.justRested === false);

// No cooldown field → never cooling.
ok("no cooldown → not cooling", !isGemCoolingDown(INITIAL_GEM_STATE, NOW));
// Malformed timestamp → treated as not cooling (fail safe).
ok("malformed cooldown → not cooling", !isGemCoolingDown({ ...INITIAL_GEM_STATE, gem_cooldown_until: "not-a-date" } as GemCooldownState, NOW));

// ---- second rest cycle: notified is per-cycle, NOT lifetime ----
{
  const resting = applyGemRemoval(applyGemRemoval(INITIAL_GEM_STATE, NOW).next, NOW).next;
  const afterExpiry = resolveGemState(resting, plusDays(NOW, GEM_COOLDOWN_DAYS)); // expiry resets the cycle
  const NOW2 = plusDays(NOW, GEM_COOLDOWN_DAYS + 5);
  const c2a = applyGemRemoval(afterExpiry, NOW2);
  const c2b = applyGemRemoval(c2a.next, NOW2);
  ok("second cycle: 1st removal after reset → not yet rested", c2a.justRested === false && c2a.next.gem_skip_count === 1);
  ok("second cycle: rests AGAIN (per-cycle, not a lifetime block)", c2b.justRested === true);
  ok("second cycle: fresh cooldown = NOW2 + 90d", c2b.next.gem_cooldown_until === plusDays(NOW2, GEM_COOLDOWN_DAYS).toISOString());
}

// ---- archived during cooldown: cooldown columns persist untouched ----
{
  const resting = applyGemRemoval(applyGemRemoval(INITIAL_GEM_STATE, NOW).next, NOW).next;
  const midCooldown = resolveGemState(resting, plusDays(NOW, 30)); // still cooling → unchanged
  ok("archived-during-cooldown: state unchanged while still cooling", JSON.stringify(midCooldown) === JSON.stringify(resting));
}

// ---- impossible combo (notified=true & cooldown=null) is never produced ----
{
  let s2: GemCooldownState = INITIAL_GEM_STATE;
  let bad = false;
  for (let i = 0; i < 6; i++) {
    s2 = applyGemRemoval(s2, plusDays(NOW, i * 45)).next;
    if (s2.gem_rested_notified && s2.gem_cooldown_until === null) bad = true;
  }
  ok("state machine never yields notified=true with cooldown=null", !bad);
}

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) {
  console.log("FAILURES:\n - " + fails.join("\n - "));
  process.exit(1);
}
process.exit(0);
