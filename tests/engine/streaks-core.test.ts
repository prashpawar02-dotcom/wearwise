// =====================================================================
// WearWise — streak transition tests (Phase 4)
// Proves same-day idempotency and concurrency convergence (no double-increment).
// =====================================================================
import { computeStreakTransition, prevDateISO, type StreakState } from "@/lib/streaks-core";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}

const today = "2026-07-15";
const nowISO = "2026-07-15T09:00:00.000Z";
const base = { pro: false, freezesPerMonth: 0, nowISO };
const row = (o: Partial<StreakState>): StreakState => ({
  current_count: 0, longest_count: 0, last_active_date: null, freezes_remaining: 0, freezes_reset_at: null, ...o,
});

// 7. Same-day repeat → already_counted, no write, no increment.
{
  const r = row({ current_count: 5, longest_count: 9, last_active_date: today });
  const t = computeStreakTransition({ row: r, today, ...base });
  ok("same-day repeat → already_counted", t.status === "already_counted");
  ok("same-day repeat does NOT write", t.write === false);
  ok("same-day repeat does NOT increment", t.current === 5);
}

// 8. Concurrency: two check-ins reading the SAME pre-today row converge (no double increment).
{
  const r = row({ current_count: 5, longest_count: 5, last_active_date: prevDateISO(today) });
  const a = computeStreakTransition({ row: r, today, ...base });
  const b = computeStreakTransition({ row: r, today, ...base });
  ok("yesterday-active → increments once", a.status === "incremented" && a.current === 6);
  ok("concurrent same-row check-ins converge to the SAME value (no double-increment)", a.current === b.current && b.current === 6);
  // After one commits (last_active_date becomes today), the other sees today → already_counted.
  const afterCommit = computeStreakTransition({ row: row({ current_count: 6, longest_count: 6, last_active_date: today }), today, ...base });
  ok("post-commit re-check is idempotent (already_counted, current unchanged)", afterCommit.status === "already_counted" && afterCommit.current === 6 && afterCommit.write === false);
}

// Extra invariants.
{
  ok("first-ever check-in starts at 1", computeStreakTransition({ row: null, today, ...base }).current === 1);
  const gap = computeStreakTransition({ row: row({ current_count: 8, longest_count: 8, last_active_date: "2026-07-01" }), today, ...base });
  ok("a multi-day gap resets to 1", gap.status === "reset" && gap.current === 1);
  ok("reset keeps the longest streak", gap.longest === 8);
  const milestone = computeStreakTransition({ row: row({ current_count: 2, longest_count: 2, last_active_date: prevDateISO(today) }), today, ...base });
  ok("hitting 3 flags the milestone", milestone.current === 3 && milestone.milestone === 3);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
