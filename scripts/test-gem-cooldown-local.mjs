#!/usr/bin/env node
// =====================================================================
// WearWise — Quiet-Gem cooldown columns (0029) REAL integration test.
//
// Proves, against a REAL local Supabase stack (0029 applied):
//   1. The three columns exist on wardrobe_items with the right types/defaults.
//   2. The non-negative CHECK on gem_skip_count rejects a negative value.
//   3. A signed-in owner can UPDATE + read back its own gem_* columns.
//   4. The owner CANNOT update or read another user's row (RLS still owner-only,
//      unchanged by the column add).
//   5. service_role CAN update gem_* on any row (server-authoritative writes).
//   6. anon can neither read nor update.
// Cross-owner fixtures are created via direct pg (bypasses grants/RLS).
//
// SAFETY GATE: aborts unless every URL in `supabase status -o json` is local.
// Never logs keys/URLs. Usage: npm run test:gem-cooldown:local
//   (needs `npx supabase start` and `npx supabase db reset` through 0029).
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

  // ---- 0. grant matrix unchanged: the column add must NOT broaden privileges ----
  const g = await pgClient.query(
    `select grantee, privilege_type from information_schema.role_table_grants
      where table_schema='public' and table_name='wardrobe_items'
        and grantee in ('anon','authenticated','service_role') order by grantee, privilege_type;`
  );
  const byRole = {};
  for (const r of g.rows) (byRole[r.grantee] ??= new Set()).add(r.privilege_type);
  const a = byRole.authenticated ?? new Set();
  ok("authenticated retains SELECT+INSERT+UPDATE+DELETE (existing contract)",
    a.has("SELECT") && a.has("INSERT") && a.has("UPDATE") && a.has("DELETE"));
  ok("authenticated NOT broadened to TRUNCATE/TRIGGER/REFERENCES",
    !a.has("TRUNCATE") && !a.has("TRIGGER") && !a.has("REFERENCES"));
  ok("service_role retains its existing grant set", (byRole.service_role ?? new Set()).size > 0);
  ok("anon still has no wardrobe_items privileges", !byRole.anon || byRole.anon.size === 0);

  // ---- 1. columns exist with right types/defaults ----
  const cols = await pgClient.query(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema='public' and table_name='wardrobe_items'
        and column_name in ('gem_skip_count','gem_cooldown_until','gem_rested_notified');`
  );
  const byCol = Object.fromEntries(cols.rows.map((r) => [r.column_name, r]));
  ok("gem_skip_count is integer NOT NULL default 0",
    byCol.gem_skip_count?.data_type === "integer" && byCol.gem_skip_count?.is_nullable === "NO" && /0/.test(byCol.gem_skip_count?.column_default ?? ""));
  ok("gem_cooldown_until is timestamptz NULLable",
    /timestamp with time zone/.test(byCol.gem_cooldown_until?.data_type ?? "") && byCol.gem_cooldown_until?.is_nullable === "YES");
  ok("gem_rested_notified is boolean NOT NULL default false",
    byCol.gem_rested_notified?.data_type === "boolean" && byCol.gem_rested_notified?.is_nullable === "NO" && /false/.test(byCol.gem_rested_notified?.column_default ?? ""));

  // ---- fixtures: two users, each with one wardrobe item (seeded via pg) ----
  const tag = randomUUID().slice(0, 8);
  const mk = async (n) => {
    const { data, error } = await admin.auth.admin.createUser({ email: `wearwise-gem-${n}-${tag}@wearwise-test.local`, password: "TestPassword123!", email_confirm: true });
    if (error) fatal(`create user ${n} failed: ${error.message}`);
    return data.user.id;
  };
  const userA = await mk("a");
  const userB = await mk("b");
  const seed = async (uid) => {
    const { rows } = await pgClient.query(
      `insert into public.wardrobe_items (user_id, image_path) values ($1,$2) returning id;`, [uid, `test/${tag}-${uid}.jpg`]
    );
    return rows[0].id;
  };
  const itemA = await seed(userA);
  const itemB = await seed(userB);

  const aClient = anon();
  { const { error } = await aClient.auth.signInWithPassword({ email: `wearwise-gem-a-${tag}@wearwise-test.local`, password: "TestPassword123!" });
    if (error) fatal(`sign in as A failed: ${error.message}`); }

  try {
    // ---- 2. non-negative constraint ----
    let negRejected = false;
    try { await pgClient.query(`update public.wardrobe_items set gem_skip_count=-1 where id=$1;`, [itemA]); }
    catch { negRejected = true; }
    ok("gem_skip_count check rejects a negative value", negRejected);

    // ---- 3. owner can update + read back its own gem_* ----
    const upd = await aClient.from("wardrobe_items")
      .update({ gem_skip_count: 2, gem_cooldown_until: new Date(Date.now() + 90 * 86400000).toISOString(), gem_rested_notified: true })
      .eq("id", itemA).select("id, gem_skip_count, gem_rested_notified");
    ok("owner can UPDATE its own gem_* columns", !upd.error && Array.isArray(upd.data) && upd.data.length === 1, upd.error?.message ?? "");
    ok("owner reads back the written gem state", upd.data?.[0]?.gem_skip_count === 2 && upd.data?.[0]?.gem_rested_notified === true);

    // ---- 4. cross-owner denied (RLS using → 0 rows affected, no leak) ----
    const crossUpd = await aClient.from("wardrobe_items").update({ gem_skip_count: 9 }).eq("id", itemB).select("id");
    ok("owner CANNOT update another user's item (0 rows)", !crossUpd.error && Array.isArray(crossUpd.data) && crossUpd.data.length === 0);
    const crossSel = await aClient.from("wardrobe_items").select("id").eq("id", itemB);
    ok("owner CANNOT read another user's item (0 rows)", !crossSel.error && Array.isArray(crossSel.data) && crossSel.data.length === 0);

    // ---- 5. service_role can update gem_* on any row ----
    const svcUpd = await admin.from("wardrobe_items").update({ gem_skip_count: 1 }).eq("id", itemB).select("id, gem_skip_count");
    ok("service_role can UPDATE gem_* on any row", !svcUpd.error && svcUpd.data?.[0]?.gem_skip_count === 1, svcUpd.error?.message ?? "");

    // ---- 6. anon blocked ----
    const an = anon();
    const anSel = await an.from("wardrobe_items").select("id").eq("id", itemA);
    ok("anon CANNOT read (error or 0 rows)", !!anSel.error || (Array.isArray(anSel.data) && anSel.data.length === 0));
    const anUpd = await an.from("wardrobe_items").update({ gem_skip_count: 5 }).eq("id", itemA).select("id");
    ok("anon CANNOT update (error or 0 rows)", !!anUpd.error || (Array.isArray(anUpd.data) && anUpd.data.length === 0));
  } finally {
    await pgClient.query("delete from public.wardrobe_items where user_id = any($1::uuid[])", [[userA, userB]]).catch(() => {});
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
