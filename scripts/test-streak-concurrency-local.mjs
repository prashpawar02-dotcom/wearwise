#!/usr/bin/env node
// =====================================================================
// WearWise — streak check-in privilege + concurrency REAL integration test.
//
// Proves, against a REAL local Supabase stack:
//   1. service_role can SELECT/INSERT/UPDATE public.streaks (0027 applied; no
//      42501). authenticated has SELECT; anon has nothing.
//   2. Two CONCURRENT first check-ins both succeed, create exactly ONE row, and
//      advance the streak exactly once (no unique-constraint error, no 500).
//   3. Two CONCURRENT same-day repeats both succeed and leave the streak
//      unchanged (idempotent).
// The write path replicated here is exactly checkinStreak's: read the row, then
// UPSERT (INSERT ... ON CONFLICT (user_id) DO UPDATE) via the service-role
// client — the atomic conflict resolution that makes concurrent check-ins safe.
//
// SAFETY GATE: aborts unless every URL in `supabase status -o json` is local.
// Never logs keys/URLs. Single top-level try/catch/finally; sets exitCode.
// Usage: npm run test:streak-concurrency:local  (needs `npx supabase start`
// and migrations applied through 0027 via `npx supabase db reset`).
// =====================================================================
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}
class FatalError extends Error {}
function fatal(msg) { throw new FatalError(msg); }

let pgClient = null;

async function run() {
  console.log("=== Safety gate: npx supabase status -o json ===");
  let statusRaw;
  try {
    statusRaw = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    fatal(`could not run "npx supabase status" — is the local stack running? (${(err.message || String(err)).split("\n")[0]})`);
  }
  let statusJson;
  try { statusJson = JSON.parse(statusRaw); } catch { fatal("supabase status did not return parseable JSON."); }

  const urlFields = Object.entries(statusJson).filter(([, v]) => typeof v === "string" && /^https?:\/\//i.test(v));
  if (urlFields.length === 0) fatal("no URL-shaped fields in supabase status output — cannot verify local-only.");
  const isProjectRefShaped = (h) => { const f = h.split(".")[0] ?? ""; return /^[a-z0-9]{18,24}$/i.test(f) && !/^(127|localhost)/i.test(f); };
  for (const [key, url] of urlFields) {
    let host;
    try { host = new URL(url).hostname; } catch { fatal(`endpoint "${key}" is not a valid URL.`); }
    if (/supabase\.co$/i.test(host) || isProjectRefShaped(host)) fatal(`endpoint "${key}" looks HOSTED. Refusing to run.`);
    if (!/^(127\.0\.0\.1|localhost|::1)$/i.test(host)) fatal(`endpoint "${key}" is not local. Refusing to run.`);
  }
  console.log(`Safety gate OK — ${urlFields.length} local endpoint(s) verified.`);

  const { API_URL, DB_URL, ANON_KEY, SERVICE_ROLE_KEY } = statusJson;
  if (!API_URL || !DB_URL || !ANON_KEY || !SERVICE_ROLE_KEY) fatal("missing API_URL/DB_URL/ANON_KEY/SERVICE_ROLE_KEY in status output.");

  const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  pgClient = new pg.Client({ connectionString: DB_URL });
  await pgClient.connect();

  // ---- 1. Privilege matrix (0027) via information_schema / has_table_privilege.
  const grants = await pgClient.query(
    `select grantee, privilege_type from information_schema.role_table_grants
     where table_schema='public' and table_name='streaks' and grantee in ('anon','authenticated','service_role')
     order by grantee, privilege_type;`
  );
  const byRole = {};
  for (const r of grants.rows) (byRole[r.grantee] ??= new Set()).add(r.privilege_type);
  const svc = byRole.service_role ?? new Set();
  ok("service_role has SELECT", svc.has("SELECT"));
  ok("service_role has INSERT", svc.has("INSERT"));
  ok("service_role has UPDATE", svc.has("UPDATE"));
  ok("service_role has NO DELETE", !svc.has("DELETE"));
  ok("service_role has NO TRUNCATE", !svc.has("TRUNCATE"));
  ok("service_role has NO TRIGGER", !svc.has("TRIGGER"));
  ok("service_role has NO REFERENCES", !svc.has("REFERENCES"));
  ok("authenticated has SELECT only", (byRole.authenticated ?? new Set()).has("SELECT") && (byRole.authenticated ?? new Set()).size === 1);
  ok("anon has no streak privileges", !byRole.anon || byRole.anon.size === 0);
  const priv = await pgClient.query(
    `select has_schema_privilege('service_role','public','usage') su,
            has_table_privilege('service_role','public.streaks','select') s,
            has_table_privilege('service_role','public.streaks','insert') i,
            has_table_privilege('service_role','public.streaks','update') u,
            has_table_privilege('service_role','public.streaks','delete') d;`
  );
  const p0 = priv.rows[0];
  ok("has_table_privilege confirms select/insert/update true, delete false, schema usage true",
    p0.su === true && p0.s === true && p0.i === true && p0.u === true && p0.d === false);

  // ---- fixtures
  const email = `wearwise-streak-${randomUUID().slice(0, 8)}@wearwise-test.local`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password: "TestPassword123!", email_confirm: true });
  if (cErr) fatal(`create user failed: ${cErr.message}`);
  const userId = created.user.id;
  const today = new Date().toISOString().slice(0, 10);

  // Replicates checkinStreak's read → upsert exactly (service-role client).
  async function checkinViaServiceRole() {
    const { data: row, error: rErr } = await admin.from("streaks").select("*").eq("user_id", userId).maybeSingle();
    if (rErr) throw rErr; // would be 42501 without 0027
    let current, status;
    if (!row || !row.last_active_date) { current = 1; status = "incremented"; }
    else if (row.last_active_date === today) { return { status: "already_counted", current: row.current_count }; }
    else { current = row.current_count + 1; status = "incremented"; }
    const { error: wErr } = await admin.from("streaks").upsert({
      user_id: userId, current_count: current, longest_count: Math.max(current, row?.longest_count ?? 0),
      last_active_date: today, freezes_remaining: row?.freezes_remaining ?? 0, freezes_reset_at: row?.freezes_reset_at ?? null,
      updated_at: new Date().toISOString(),
    });
    if (wErr) throw wErr;
    return { status, current };
  }
  async function streakRow() {
    const { rows } = await pgClient.query("select count(*)::int n, max(current_count) c from public.streaks where user_id=$1", [userId]);
    return rows[0];
  }

  try {
    // ---- 2. concurrent FIRST check-ins
    const first = await Promise.allSettled([checkinViaServiceRole(), checkinViaServiceRole()]);
    ok("concurrent first check-ins both succeed (no 42501 / unique violation / throw)", first.every((r) => r.status === "fulfilled"));
    const afterFirst = await streakRow();
    ok("exactly ONE streak row exists after concurrent first check-ins", afterFirst.n === 1);
    ok("streak advanced exactly once (current = 1)", afterFirst.c === 1);

    // ---- 3. concurrent SAME-DAY repeats
    const repeat = await Promise.allSettled([checkinViaServiceRole(), checkinViaServiceRole()]);
    ok("concurrent same-day repeats both succeed", repeat.every((r) => r.status === "fulfilled"));
    const afterRepeat = await streakRow();
    ok("repeat leaves exactly one row", afterRepeat.n === 1);
    ok("repeat does NOT advance the streak (still 1)", afterRepeat.c === 1);
  } finally {
    await pgClient.query("delete from public.streaks where user_id=$1", [userId]).catch(() => {});
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
}

let success = false;
try {
  await run();
  success = failed === 0;
} catch (err) {
  console.error(err instanceof FatalError ? `FATAL | ${err.message}` : err);
  success = false;
} finally {
  if (pgClient) { try { await pgClient.end(); } catch { /* ignore */ } }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (fails.length) console.log("FAILURES:\n - " + fails.join("\n - "));
process.exitCode = success ? 0 : 1;
