#!/usr/bin/env node
// =====================================================================
// WearWise — outfit_requests privilege + RLS REAL integration test.
//
// Proves, against a REAL local Supabase stack (0028 applied):
//   1. Grant matrix: authenticated {SELECT,INSERT,UPDATE}, NOT delete/truncate/
//      trigger/references; service_role {UPDATE} only, NOT select; anon none.
//   2. A signed-in authenticated user can INSERT its own request and read the
//      inserted id back (INSERT ... RETURNING id through PostgREST + RLS).
//   3. It can SELECT its own request.
//   4. It CANNOT insert a request with another user's user_id (RLS with-check).
//   5. It CANNOT select another user's request (RLS using → 0 rows).
//   6. anon can neither insert nor select.
// Cross-owner fixtures are created via a direct pg (postgres) connection, which
// bypasses grants/RLS — exactly like the atomic-wear integration test.
//
// SAFETY GATE: aborts unless every URL in `supabase status -o json` is local.
// Never logs keys/URLs. Single top-level try/catch/finally; sets exitCode.
// Usage: npm run test:outfit-request-privileges:local  (needs `npx supabase
// start` and migrations applied through 0028 via `npx supabase db reset`).
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
  try { statusRaw = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (err) { fatal(`could not run "npx supabase status" — is the local stack running? (${(err.message || String(err)).split("\n")[0]})`); }
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
  if (!API_URL || !DB_URL || !ANON_KEY || !SERVICE_ROLE_KEY) fatal("missing API_URL/DB_URL/ANON_KEY/SERVICE_ROLE_KEY.");

  const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = () => createClient(API_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  pgClient = new pg.Client({ connectionString: DB_URL });
  await pgClient.connect();

  // ---- 1. Grant matrix via information_schema / has_table_privilege ----
  const g = await pgClient.query(
    `select grantee, privilege_type from information_schema.role_table_grants
     where table_schema='public' and table_name='outfit_requests' and grantee in ('anon','authenticated','service_role')
     order by grantee, privilege_type;`
  );
  const byRole = {};
  for (const r of g.rows) (byRole[r.grantee] ??= new Set()).add(r.privilege_type);
  const a = byRole.authenticated ?? new Set();
  ok("authenticated has SELECT+INSERT+UPDATE", a.has("SELECT") && a.has("INSERT") && a.has("UPDATE"));
  ok("authenticated has NO delete/truncate/trigger/references",
    !a.has("DELETE") && !a.has("TRUNCATE") && !a.has("TRIGGER") && !a.has("REFERENCES"));
  const svc = byRole.service_role ?? new Set();
  ok("service_role has UPDATE only (no SELECT/INSERT/DELETE)",
    svc.has("UPDATE") && !svc.has("SELECT") && !svc.has("INSERT") && !svc.has("DELETE"));
  ok("anon has no outfit_requests privileges", !byRole.anon || byRole.anon.size === 0);

  // ---- fixtures: two disposable users; B's request seeded via pg (bypasses RLS) ----
  const tag = randomUUID().slice(0, 8);
  const mk = async (n) => {
    const { data, error } = await admin.auth.admin.createUser({ email: `wearwise-or-${n}-${tag}@wearwise-test.local`, password: "TestPassword123!", email_confirm: true });
    if (error) fatal(`create user ${n} failed: ${error.message}`);
    return data.user.id;
  };
  const userA = await mk("a");
  const userB = await mk("b");
  const { rows: bReq } = await pgClient.query(
    `insert into public.outfit_requests (user_id, occasion, status) values ($1,'casual','pending') returning id;`, [userB]
  );
  const bRequestId = bReq[0].id;

  const aClient = anon();
  {
    const { error } = await aClient.auth.signInWithPassword({ email: `wearwise-or-a-${tag}@wearwise-test.local`, password: "TestPassword123!" });
    if (error) fatal(`sign in as A failed: ${error.message}`);
  }

  try {
    // ---- 2/3. own insert (returning id) + own select ----
    const ins = await aClient.from("outfit_requests").insert({ user_id: userA, occasion: "casual", status: "pending" }).select("id").single();
    ok("authenticated can INSERT its own request (no 42501)", !ins.error, ins.error?.message ?? "");
    ok("the inserted id is returned via SELECT", !!ins.data?.id);
    const aRequestId = ins.data?.id;
    const sel = await aClient.from("outfit_requests").select("id, user_id, occasion").eq("id", aRequestId).single();
    ok("authenticated can SELECT its own request", !sel.error && sel.data?.user_id === userA);

    // ---- 4. cannot insert another user's user_id (RLS with-check) ----
    const crossIns = await aClient.from("outfit_requests").insert({ user_id: userB, occasion: "casual", status: "pending" }).select("id").single();
    ok("authenticated CANNOT insert a request for another user_id (RLS with-check)", !!crossIns.error);

    // ---- 5. cannot read another user's request (RLS using → 0 rows) ----
    const crossSel = await aClient.from("outfit_requests").select("id").eq("id", bRequestId);
    ok("authenticated CANNOT read another user's request (0 rows, no error leak)",
      !crossSel.error && Array.isArray(crossSel.data) && crossSel.data.length === 0);

    // ---- 6. anon blocked ----
    const an = anon();
    const anIns = await an.from("outfit_requests").insert({ user_id: userA, occasion: "casual", status: "pending" }).select("id").single();
    ok("anon CANNOT insert", !!anIns.error);
    const anSel = await an.from("outfit_requests").select("id").eq("id", aRequestId);
    ok("anon CANNOT read (error or 0 rows)", !!anSel.error || (Array.isArray(anSel.data) && anSel.data.length === 0));
  } finally {
    await pgClient.query("delete from public.outfit_requests where user_id = any($1::uuid[])", [[userA, userB]]).catch(() => {});
    await admin.auth.admin.deleteUser(userA).catch(() => {});
    await admin.auth.admin.deleteUser(userB).catch(() => {});
  }
}

let success = false;
try { await run(); success = failed === 0; }
catch (err) { console.error(err instanceof FatalError ? `FATAL | ${err.message}` : err); success = false; }
finally { if (pgClient) { try { await pgClient.end(); } catch { /* ignore */ } } }
console.log(`\n${passed} passed, ${failed} failed`);
if (fails.length) console.log("FAILURES:\n - " + fails.join("\n - "));
process.exitCode = success ? 0 : 1;
