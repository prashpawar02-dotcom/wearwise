// =====================================================================
// WearWise — Application role table privileges (migration 0024) wiring
// guard. Source-structure assertions over
// supabase/migrations/0024_app_role_privileges.sql,
// supabase/rollbacks/0024_app_role_privileges_down.sql,
// supabase/migrations/0023_atomic_wear_confirmation.sql, and
// scripts/test-atomic-wear-local.mjs proving:
//   1. anon receives no privileges on profiles/wardrobe_items/
//      daily_recommendations.
//   2. authenticated receives exactly the intended DML matrix (no more,
//      no less).
//   3. authenticated does not receive TRUNCATE, TRIGGER, or REFERENCES.
//   4. service_role receives the required table privileges.
//   5. RLS is not touched/disabled by this migration (still enabled,
//      per the earlier migration that turned it on).
//   6. confirm_daily_drop_wear remains SECURITY INVOKER (regression
//      check — migration 0024 does not touch this function at all).
//   7. RPC execution is still granted only to authenticated, not anon
//      (regression check against 0023's own grants).
//   8. The local integration script closes all resources in a top-level
//      finally block and never forces process.exit() while handles may
//      still be open.
//
// HONESTY NOTE (do not remove): these are STATIC TEXT assertions over the
// migration SQL and the test-script source. They prove the GRANT/REVOKE
// statements are *present and correctly shaped* — they do NOT execute
// Postgres, do NOT query information_schema.role_table_grants against a
// real database, and do NOT prove that a real `authenticated`-role
// session can actually SELECT/INSERT/UPDATE these tables end-to-end.
// Real, executed proof of the privilege fix (including the full
// confirm_daily_drop_wear RPC path running as a real signed-in Auth user)
// lives in scripts/test-atomic-wear-local.mjs
// (`npm run test:atomic-wear:local`), run against a real local Supabase
// stack. That script — not this file — is the source of truth for
// whether this migration is safe to ship.
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}

const UP = "supabase/migrations/0024_app_role_privileges.sql";
const DOWN = "supabase/rollbacks/0024_app_role_privileges_down.sql";
const RPC_UP = "supabase/migrations/0023_atomic_wear_confirmation.sql";
const INTEGRATION_SCRIPT = "scripts/test-atomic-wear-local.mjs";
const up = readFileSync(UP, "utf8");
const down = readFileSync(DOWN, "utf8");
const rpcUp = readFileSync(RPC_UP, "utf8");
const script = readFileSync(INTEGRATION_SCRIPT, "utf8");

const TABLES = ["profiles", "wardrobe_items", "daily_recommendations"] as const;

// =====================================================================
// 1. anon receives no privileges on the three tables.
// =====================================================================
{
  for (const t of TABLES) {
    ok(`0024 revokes all from anon on public.${t}`,
      up.includes(`revoke all on table public.${t} from anon;`));

    ok(`0024 contains no "grant ... to anon" for public.${t}`,
      !new RegExp(`grant\\s+[a-z, ]+on table public\\.${t}\\s+to anon`, "i").test(up));
  }

  ok("0024 documents anon is left with zero table privileges on all three tables (3 occurrences)",
    (up.match(/anon: intentionally left with zero table privileges/g) ?? []).length === 3);
}

// =====================================================================
// 2. authenticated receives exactly the intended DML matrix.
// =====================================================================
{
  ok("0024 revokes all from authenticated on public.profiles before re-granting",
    up.includes("revoke all on table public.profiles from authenticated;"));
  ok("authenticated gets exactly SELECT, INSERT, UPDATE on public.profiles (no DELETE)",
    up.includes("grant select, insert, update on table public.profiles to authenticated;") &&
    !/grant\s+select,\s*insert,\s*update,\s*delete\s+on table public\.profiles\s+to authenticated/i.test(up));

  ok("0024 revokes all from authenticated on public.wardrobe_items before re-granting",
    up.includes("revoke all on table public.wardrobe_items from authenticated;"));
  ok("authenticated gets SELECT, INSERT, UPDATE, DELETE on public.wardrobe_items",
    up.includes("grant select, insert, update, delete on table public.wardrobe_items to authenticated;"));

  ok("0024 revokes all from authenticated on public.daily_recommendations before re-granting",
    up.includes("revoke all on table public.daily_recommendations from authenticated;"));
  ok("authenticated gets exactly SELECT, INSERT, UPDATE on public.daily_recommendations (no DELETE)",
    up.includes("grant select, insert, update on table public.daily_recommendations to authenticated;") &&
    !/grant\s+select,\s*insert,\s*update,\s*delete\s+on table public\.daily_recommendations\s+to authenticated/i.test(up));

  ok("no table in this migration grants authenticated ALL privileges",
    !/grant all on table public\.(profiles|wardrobe_items|daily_recommendations) to authenticated/i.test(up));
}

// =====================================================================
// 3. authenticated does not receive TRUNCATE, TRIGGER, or REFERENCES.
// =====================================================================
{
  // Every "grant ... to authenticated" line in the UP migration (for these
  // three tables) must be one of the exact DML grants asserted in section 2
  // — none may additionally mention truncate/trigger/references. Scoped to
  // the UP migration only: the DOWN rollback deliberately RE-GRANTS these
  // three privileges to restore the pre-0024 (defective) state for
  // rollback-mechanism testing, which is a different, clearly-labeled file.
  // Scoped to "on table" grants specifically — the migration also has one
  // "grant usage on schema public to authenticated" line (section 4 below),
  // which is a real, required, and separately-asserted grant, not a table
  // DML grant, so it must not be counted here.
  const grantLinesToAuthenticated = up
    .split("\n")
    .filter((line) => /grant\s+.*\s+on table\s+.*\s+to authenticated;/i.test(line));

  ok("0024 UP migration contains exactly 3 table-level grant-to-authenticated lines (one per table)",
    grantLinesToAuthenticated.length === 3, JSON.stringify(grantLinesToAuthenticated));

  ok("none of authenticated's UP-migration grants include TRUNCATE, TRIGGER, or REFERENCES",
    grantLinesToAuthenticated.every((line) => !/truncate|trigger|references/i.test(line)),
    JSON.stringify(grantLinesToAuthenticated));

  ok('the literal substring "truncate" never appears paired with "authenticated" in a grant statement in the UP file',
    !/grant[^;]*truncate[^;]*to authenticated/i.test(up) &&
    !/grant[^;]*to authenticated[^;]*truncate/i.test(up));
}

// =====================================================================
// 4. service_role receives the required table privileges.
// =====================================================================
{
  for (const t of TABLES) {
    ok(`0024 grants ALL table privileges on public.${t} to service_role`,
      up.includes(`grant all on table public.${t} to service_role;`));
  }
  ok("schema USAGE is granted to authenticated",
    up.includes("grant usage on schema public to authenticated;"));
  ok("schema USAGE is granted to service_role",
    up.includes("grant usage on schema public to service_role;"));
}

// =====================================================================
// 5. RLS is not touched or disabled by this migration.
// =====================================================================
{
  ok("0024 contains no reference to row level security at all (grant/revoke only, RLS untouched)",
    !/row level security/i.test(up));

  ok("0024 does not disable RLS on any table",
    !/disable row level security/i.test(up));

  // Regression: confirm RLS really was enabled for these tables by an
  // earlier migration, so "0024 doesn't touch it" is meaningfully "still
  // on", not "was never on to begin with".
  const schemaBaseline = readFileSync("supabase/migrations/0001_initial_schema.sql", "utf8");
  const dailyRecBaseline = readFileSync("supabase/migrations/0009_daily_recommendations.sql", "utf8");
  ok("public.profiles had RLS enabled in the base schema (0001)",
    schemaBaseline.includes("alter table public.profiles            enable row level security;"));
  ok("public.wardrobe_items had RLS enabled in the base schema (0001)",
    schemaBaseline.includes("alter table public.wardrobe_items      enable row level security;"));
  ok("public.daily_recommendations had RLS enabled when the table was created (0009)",
    dailyRecBaseline.includes("alter table public.daily_recommendations enable row level security;"));
}

// =====================================================================
// 6. confirm_daily_drop_wear remains SECURITY INVOKER — migration 0024
//    does not touch functions at all, only table/schema grants.
// =====================================================================
{
  ok("0024 contains no CREATE FUNCTION / CREATE OR REPLACE FUNCTION statement",
    !/create (or replace )?function/i.test(up));

  // 0024's header comments DO name confirm_daily_drop_wear (explaining WHY
  // this table-privilege fix matters for that SECURITY INVOKER function) —
  // that is expected and desirable documentation, not a defect. What must
  // NOT happen is 0024 touching the function's own GRANT/REVOKE/CREATE
  // statements, which the "no CREATE FUNCTION" check above already covers.
  // This assertion instead confirms no EXECUTE grant/revoke statement
  // targeting the function appears in the table-privilege migration.
  ok("0024 contains no GRANT/REVOKE ON FUNCTION statement for confirm_daily_drop_wear (function grants are owned by 0023, not 0024)",
    !/(grant|revoke).*on function public\.confirm_daily_drop_wear/i.test(up));

  ok("confirm_daily_drop_wear (0023) is still SECURITY INVOKER, not DEFINER",
    rpcUp.includes("security invoker") && !rpcUp.includes("security definer"));
}

// =====================================================================
// 7. RPC execution is still granted only to authenticated, not anon
//    (regression check against 0023 — 0024 does not modify function
//    grants, only table grants, so this must be unchanged).
// =====================================================================
{
  ok("0023: EXECUTE on confirm_daily_drop_wear is revoked from PUBLIC",
    rpcUp.includes("revoke all on function public.confirm_daily_drop_wear(uuid, uuid[]) from public;"));
  ok("0023: EXECUTE on confirm_daily_drop_wear is revoked from anon",
    rpcUp.includes("revoke all on function public.confirm_daily_drop_wear(uuid, uuid[]) from anon;"));
  ok("0023: EXECUTE on confirm_daily_drop_wear is granted ONLY to authenticated",
    rpcUp.includes("grant execute on function public.confirm_daily_drop_wear(uuid, uuid[]) to authenticated;"));

  // Together with section 2/4 above, this proves the FULL authorization
  // path for a real authenticated caller: EXECUTE on the function (0023)
  // AND SELECT/UPDATE table privileges the function's own SQL performs
  // under SECURITY INVOKER (0024) both exist — neither alone is
  // sufficient, and this suite proves both are present together.
  ok("authenticated has SELECT+UPDATE on daily_recommendations (required by confirm_daily_drop_wear's SELECT...FOR UPDATE / UPDATE)",
    up.includes("grant select, insert, update on table public.daily_recommendations to authenticated;"));
  ok("authenticated has SELECT+UPDATE on wardrobe_items (required by confirm_daily_drop_wear's locking SELECT / UPDATE)",
    up.includes("grant select, insert, update, delete on table public.wardrobe_items to authenticated;"));
}

// =====================================================================
// 8. Integration script closes resources in finally; never forces
//    process.exit() while handles may still be open.
// =====================================================================
{
  ok("script sets process.exitCode rather than calling process.exit(...) as its final statement",
    /process\.exitCode\s*=\s*success \? 0 : 1;\s*$/.test(script.trimEnd()));

  ok('script contains no LIVE call to "process.exit(" (only mentions of it in explanatory comments, if any)',
    (() => {
      const codeLines = script
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"));
      return codeLines.every((line) => !line.includes("process.exit("));
    })());

  ok("script has a single top-level try/catch/finally wrapping the whole run",
    /let success = false;\s*\ntry \{\s*\n\s*success = await run\(\);/.test(script) &&
    /\} finally \{/.test(script));

  ok("fatal() throws instead of calling process.exit() directly, so every call site is caught by the top-level try/catch",
    /function fatal\(msg\) \{\s*\n\s*throw new FatalError\(msg\);\s*\n\}/.test(script));

  ok("the top-level finally block closes pgClient (await pgClient.end())",
    /\} finally \{[\s\S]*?await pgClient\.end\(\);[\s\S]*?\n\}/.test(script));

  ok("pgClient cleanup in the top-level finally is guarded (pgClient may be null if the safety gate aborted first)",
    /if \(pgClient\) \{/.test(script));

  ok("pgClient is declared at module scope as null until the safety-gated DB_URL is known (no placeholder connection string)",
    script.includes("let pgClient = null;") &&
    !/__WEARWISE_TEST_DB_URL_PLACEHOLDER__|connectionParameters\s*=/.test(script));

  ok("no setTimeout/setInterval anywhere in the script (no timer handles to leak)",
    !/setTimeout|setInterval/.test(script));

  ok("supabase-js clients are created with autoRefreshToken/persistSession disabled (no background refresh timer keeping the process alive)",
    (script.match(/autoRefreshToken: false, persistSession: false/g) ?? []).length >= 2);
}

// =====================================================================
// 9. Explicit, honest pointer to where the REAL (executed) proof lives.
// =====================================================================
console.log("\nNOTE: this file proves SQL/script shape only. Real, executed proof of:");
console.log("  - A real `authenticated`-role session actually able to SELECT/INSERT/UPDATE these tables.");
console.log("  - information_schema.role_table_grants showing the corrected matrix on a live database.");
console.log("  - The integration script actually exiting cleanly (no libuv assertion) on both pass and fail runs.");
console.log("  ...lives in scripts/test-atomic-wear-local.mjs (`npm run test:atomic-wear:local`), run against a real local Supabase stack.");

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
