// =====================================================================
// WearWise — Migration 0027 (public.streaks privileges) wiring guard.
// SOURCE-STRUCTURE assertions over the 0027 up/down SQL, the streak code, and
// 0013's RLS, proving the least-privilege matrix and that no manual Studio
// grant is needed after db reset. HONESTY: these prove the GRANT/REVOKE
// statements are present and correctly shaped — they do NOT execute Postgres.
// Real executed proof lives in scripts/test-streak-concurrency-local.mjs
// (`npm run test:streak-concurrency:local`) against a real local stack.
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync, existsSync } from "node:fs";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const UP_PATH = "supabase/migrations/0027_streak_privileges.sql";
const DOWN_PATH = "supabase/rollbacks/0027_streak_privileges_down.sql";

// Files exist, and the forward migration is applied by `supabase db reset`
// (lives in supabase/migrations/) — no manual Studio grant required.
ok("0027 forward migration exists in supabase/migrations (applied by db reset)", existsSync(UP_PATH));
ok("0027 rollback exists in supabase/rollbacks (not run by db reset)", existsSync(DOWN_PATH));

const up = existsSync(UP_PATH) ? read(UP_PATH) : "";
const down = existsSync(DOWN_PATH) ? read(DOWN_PATH) : "";

// Revoke the platform baseline from every client-facing role first.
for (const role of ["public", "anon", "authenticated", "service_role"]) {
  ok(`0027 revokes all on public.streaks from ${role}`, up.includes(`revoke all on table public.streaks from ${role};`));
}

// authenticated: SELECT only (proven RLS-gated dashboard read dependency).
ok("authenticated is granted SELECT on public.streaks", up.includes("grant select on table public.streaks to authenticated;"));
ok("authenticated is NOT granted insert/update/delete on public.streaks",
  !/grant[^;]*\b(insert|update|delete)\b[^;]*on table public\.streaks[^;]*to authenticated/i.test(up));
ok("authenticated is NOT granted truncate/trigger/references on public.streaks",
  !/grant[^;]*\b(truncate|trigger|references)\b[^;]*on table public\.streaks[^;]*to authenticated/i.test(up));

// service_role: exactly SELECT, INSERT, UPDATE — no more.
ok("service_role is granted SELECT, INSERT, UPDATE on public.streaks",
  up.includes("grant select, insert, update on table public.streaks to service_role;"));
{
  const svcGrantLines = up.split("\n").filter((l) => /grant\s+.*on table public\.streaks\s+to service_role;/i.test(l));
  ok("service_role has exactly ONE table grant line on public.streaks", svcGrantLines.length === 1, JSON.stringify(svcGrantLines));
  ok("service_role streak grant does NOT include delete/truncate/trigger/references/all",
    svcGrantLines.every((l) => !/\b(delete|truncate|trigger|references|all)\b/i.test(l)), JSON.stringify(svcGrantLines));
}
ok("no GRANT ALL on public.streaks anywhere in 0027", !/grant all on table public\.streaks/i.test(up));

// anon: zero privileges — no grant line targeting anon.
ok("anon receives NO grant on public.streaks", !/grant[^;]*on table public\.streaks[^;]*to anon/i.test(up));

// Schema USAGE (idempotent; required for the grants to be reachable).
ok("schema USAGE granted to authenticated", up.includes("grant usage on schema public to authenticated;"));
ok("schema USAGE granted to service_role", up.includes("grant usage on schema public to service_role;"));

// No sequence grant (streaks PK is a uuid FK, not serial/identity).
ok("0027 grants no sequence privileges (none required)", !/grant[^;]*on sequence/i.test(up));

// Rollback restores the pre-0027 (defective) baseline.
ok("rollback revokes authenticated SELECT", down.includes("revoke select on table public.streaks from authenticated;"));
ok("rollback revokes service_role SELECT/INSERT/UPDATE", down.includes("revoke select, insert, update on table public.streaks from service_role;"));
ok("rollback restores baseline references/trigger/truncate to the three roles",
  down.includes("grant references, trigger, truncate on table public.streaks to anon;") &&
  down.includes("grant references, trigger, truncate on table public.streaks to authenticated;") &&
  down.includes("grant references, trigger, truncate on table public.streaks to service_role;"));

// Unrelated 0024 matrix must remain unchanged (0027 must not touch other tables).
{
  const s024 = read("supabase/migrations/0024_app_role_privileges.sql");
  ok("0024's profiles/wardrobe/daily grants are untouched (0027 does not reference them)",
    s024.includes("grant select, insert, update on table public.profiles to authenticated;") &&
    !/public\.(profiles|wardrobe_items|daily_recommendations)/i.test(up));
}

// Code corroboration: checkinStreak reads + upserts (needs SELECT/INSERT/UPDATE)
// and never DELETEs; the dashboard reads streaks with the authenticated client;
// 0013 provides the "own streak read" RLS policy that authenticated SELECT gates.
{
  const streaksLib = read("src/lib/streaks.ts");
  const dash = read("src/app/(app)/dashboard/page.tsx");
  const s0013 = read("supabase/migrations/0013_streaks.sql");
  ok("checkinStreak reads streaks (select) and upserts — no delete",
    streaksLib.includes('.from("streaks").select("*")') && streaksLib.includes('.from("streaks").upsert(') && !/\.from\("streaks"\)\.delete\(/.test(streaksLib));
  ok("dashboard reads the user's own streak via the authenticated session client (needs SELECT)",
    dash.includes('supabase.from("streaks").select("current_count")'));
  ok("0013 provides the 'own streak read' RLS policy that authenticated SELECT is gated by",
    /create policy "own streak read" on streaks for select/i.test(s0013));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
