#!/usr/bin/env node
// =====================================================================
// WearWise — Phase 4C atomic-wear-confirmation REAL integration tests
//
// Exercises `public.confirm_daily_drop_wear` (migration 0023, including
// the 2026-07-11 local-date fix) through the REAL local Auth + PostgREST
// RPC path — supabase-js clients signed in as real disposable local Auth
// users, calling `.rpc()` exactly like the production route does. Nothing
// here mocks SQL behavior; the only non-REST access is a direct Postgres
// connection (via `pg`) used strictly for two things a REST client cannot
// do: (a) service-role-equivalent fixture setup that must bypass RLS
// (creating wardrobe items across two owners), and (b) installing/removing
// the temporary forced-failure trigger for the rollback test (G). Every
// ASSERTION about the RPC's behavior goes through the real RPC call over
// the real local API.
//
// Requires migrations through 0024 (`npx supabase db reset`), not just
// 0023: migration 0024 (2026-07-11) is what grants `service_role` normal
// table DML on profiles/wardrobe_items/daily_recommendations in the first
// place — this script's own fixture setup (admin.from(...).insert(...))
// would fail with a permission error on a stack that only has 0001-0023
// applied. It also grants `authenticated` the SELECT/UPDATE the RPC
// itself needs to do anything (SECURITY INVOKER runs as the caller).
//
// SAFETY GATE (hard requirement — read before touching this file):
//   - Runs `npx supabase status -o json` first.
//   - Aborts immediately, before creating anything, unless every URL-like
//     field in that output contains "127.0.0.1" or "localhost".
//   - Aborts immediately if any field looks like a hosted supabase.co
//     host or a bare 20-char project-ref-shaped hostname.
//   - Never logs ANON_KEY / SERVICE_ROLE_KEY / JWT_SECRET / DB URL
//     credentials anywhere, including on failure paths.
//
// RESOURCE HYGIENE: every exit path — success, a failed assertion, a
// thrown fixture-setup error, an early safety-gate abort — goes through
// ONE top-level try/catch/finally. The finally block always attempts to
// drop the temporary rollback trigger and always closes the `pg` Client.
// This script never calls `process.exit()` while handles may still be
// open; it sets `process.exitCode` and lets Node drain the event loop
// naturally, which is what actually avoids the libuv
// UV_HANDLE_CLOSING-style assertion that a forced exit mid-socket-close
// can trigger.
//
// Usage:  npm run test:atomic-wear:local
// Requires: local Supabase stack already running (`npx supabase start`)
// and migrations applied through 0024 (`npx supabase db reset`).
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

// fatal() THROWS rather than calling process.exit() directly, so every
// call site — inside main(), inside a fixture helper, even inside the
// safety gate before main() starts — is guaranteed to pass through the
// single top-level try/catch/finally below and get real cleanup.
class FatalError extends Error {}
function fatal(msg) {
  throw new FatalError(msg);
}
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Declared here (module scope, not yet connected) so the single top-level
// finally block can always reach it, but not constructed with a real
// connection string until the safety gate has verified DB_URL is local —
// there is no throwaway/placeholder client and no reassignment hack.
let pgClient = null;

async function run() {
  // ===================================================================
  // SAFETY GATE — must pass before anything else runs.
  // ===================================================================
  console.log("=== Safety gate: npx supabase status -o json ===");
  let statusRaw;
  try {
    statusRaw = execSync("npx supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    fatal(
      `could not run "npx supabase status" — is the local stack running? ` +
      `Start it first with "npx supabase start". (${(err.message || String(err)).split("\n")[0]})`
    );
  }

  let statusJson;
  try {
    statusJson = JSON.parse(statusRaw);
  } catch {
    fatal("supabase status did not return parseable JSON — refusing to proceed without a verifiable safety check.");
  }

  const urlFields = Object.entries(statusJson).filter(
    ([, v]) => typeof v === "string" && /^https?:\/\//i.test(v)
  );
  if (urlFields.length === 0) {
    fatal("no URL-shaped fields found in `supabase status -o json` output — cannot verify local-only.");
  }

  function isProjectRefShaped(hostname) {
    const first = hostname.split(".")[0] ?? "";
    return /^[a-z0-9]{18,24}$/i.test(first) && !/^(127|localhost)/i.test(first);
  }

  for (const [key, url] of urlFields) {
    let host;
    try { host = new URL(url).hostname; } catch { fatal(`endpoint "${key}" is not a valid URL.`); }
    const isLocal = /^(127\.0\.0\.1|localhost|::1)$/i.test(host);
    const isHosted = /supabase\.co$/i.test(host) || isProjectRefShaped(host);
    if (isHosted) fatal(`endpoint "${key}" resolves to a HOSTED-looking host. Refusing to run against it.`);
    if (!isLocal) fatal(`endpoint "${key}" is not 127.0.0.1/localhost. Refusing to run against a non-local target.`);
  }
  console.log(`Safety gate OK — ${urlFields.length} endpoint field(s) checked (${urlFields.map(([k]) => k).join(", ")}), all local. No supabase.co / project-ref-shaped host found.`);

  const API_URL = statusJson.API_URL;
  const DB_URL = statusJson.DB_URL;
  const ANON_KEY = statusJson.ANON_KEY;
  const SERVICE_ROLE_KEY = statusJson.SERVICE_ROLE_KEY;
  if (!API_URL || !DB_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    fatal("missing API_URL / DB_URL / ANON_KEY / SERVICE_ROLE_KEY in `supabase status -o json` output.");
  }
  // From this line down: key/URL VALUES are held only in memory and used
  // only to construct clients. They are never console.log'd, never
  // included in error messages, never written to a file.

  const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  function anonClient() {
    return createClient(API_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  }

  // DB_URL is only known now, after the safety gate has verified it's
  // local — construct the real client here (assigning the module-level
  // `pgClient` binding, not a throwaway) and connect it. The top-level
  // finally block below checks `pgClient !== null` before touching it.
  pgClient = new pg.Client({ connectionString: DB_URL });
  await pgClient.connect();

  // =====================================================================
  // Fixture helpers
  // =====================================================================
  const RUN_TAG = randomUUID().slice(0, 8);
  const EMAIL_A = `wearwise-test-a-${RUN_TAG}@wearwise-test.local`;
  const EMAIL_B = `wearwise-test-b-${RUN_TAG}@wearwise-test.local`;
  const PASSWORD = "TestPassword123!";

  const cleanupUserIds = [];

  async function createTestUser(email) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) fatal(`failed to create disposable test user: ${error.message}`);
    cleanupUserIds.push(data.user.id);
    // handle_new_user() already inserted the profiles row (0001 trigger).
    // Upsert onboarded=true defensively — not required by the RPC, but
    // keeps the fixture realistic per "create any required profile
    // records". Requires migration 0024 (service_role UPDATE grant).
    const { error: profErr } = await admin.from("profiles").update({ onboarded: true }).eq("id", data.user.id);
    if (profErr) fatal(`failed to update profile for ${email}: ${profErr.message}`);
    return data.user.id;
  }

  async function signIn(email) {
    const client = anonClient();
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) fatal(`failed to sign in as disposable test user: ${error.message}`);
    return client;
  }

  async function makeItem(userId, overrides = {}) {
    const row = {
      user_id: userId,
      image_path: `${userId}/${randomUUID()}.jpg`,
      category: "top",
      availability_status: "available",
      ...overrides,
    };
    const { data, error } = await admin.from("wardrobe_items").insert(row).select("*").single();
    if (error) fatal(`failed to create wardrobe item fixture: ${error.message}`);
    return data;
  }

  async function getItem(id) {
    const { data, error } = await admin.from("wardrobe_items").select("*").eq("id", id).single();
    if (error) fatal(`failed to re-read wardrobe item ${id}: ${error.message}`);
    return data;
  }

  async function getRec(id) {
    const { data, error } = await admin.from("daily_recommendations").select("*").eq("id", id).single();
    if (error) fatal(`failed to re-read daily_recommendation ${id}: ${error.message}`);
    return data;
  }

  const utcToday = new Date().toISOString().slice(0, 10);
  let dateCounter = 0;
  function nextLocalDate() {
    dateCounter += 1;
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (10 + dateCounter)); // always >=11 days before "now", always distinct
    const iso = d.toISOString().slice(0, 10);
    if (iso === utcToday) fatal("local_date fixture collided with UTC today — unexpected clock skew.");
    return iso;
  }

  async function makeRecommendation(userId, itemIds, localDate = nextLocalDate()) {
    const { data, error } = await admin
      .from("daily_recommendations")
      .insert({ user_id: userId, local_date: localDate, status: "prepared", selected_item_ids: itemIds })
      .select("*")
      .single();
    if (error) fatal(`failed to create daily_recommendation fixture: ${error.message}`);
    return data;
  }

  async function snapshotItems(ids) {
    const rows = await Promise.all(ids.map(getItem));
    return rows;
  }

  function assertZeroWrites(name, recBefore, recAfter, itemsBefore, itemsAfter) {
    ok(`${name}: recommendation status unchanged (still "${recBefore.status}")`, recAfter.status === recBefore.status);
    ok(`${name}: recommendation worn_at unchanged`, recAfter.worn_at === recBefore.worn_at);
    ok(`${name}: no item row changed`, deepEqual(itemsBefore, itemsAfter));
  }

  console.log(`\n=== Fixture setup (run tag ${RUN_TAG}) ===`);

  const userA = await createTestUser(EMAIL_A);
  const userB = await createTestUser(EMAIL_B);

  const item1 = await makeItem(userA);
  const item2 = await makeItem(userA);
  const item3 = await makeItem(userA);
  const unrelated = await makeItem(userA); // "one unrelated wardrobe item owned by user A"
  const itemB = await makeItem(userB);     // "one wardrobe item owned by user B"

  const selectedIds = [item1.id, item2.id, item3.id];

  console.log(`Users: A=${userA.slice(0, 8)}…  B=${userB.slice(0, 8)}…`);
  console.log(`Items: A selected=[${selectedIds.map(i => i.slice(0, 8)).join(", ")}]  A unrelated=${unrelated.id.slice(0, 8)}  B=${itemB.id.slice(0, 8)}`);
  console.log(`UTC today: ${utcToday}  (all fixture local_date values are >=11 days before this, by construction)`);

  // ===================================================================
  // A. Normal confirmation
  // ===================================================================
  console.log("\n=== A. Normal confirmation ===");
  const recA = await makeRecommendation(userA, selectedIds);
  const clientA = await signIn(EMAIL_A);

  const unrelatedBefore = await getItem(unrelated.id);

  const { data: aData, error: aErr } = await clientA.rpc("confirm_daily_drop_wear", {
    p_recommendation_id: recA.id,
    p_item_ids: selectedIds,
  });
  ok("A: RPC call succeeded (no transport/permission error)", !aErr, aErr?.message);
  const aRow = Array.isArray(aData) ? aData[0] : aData;
  ok("A: status is confirmed", aRow?.status === "confirmed", JSON.stringify(aRow));
  ok("A: worn_at is present", !!aRow?.worn_at);

  const recAAfter = await getRec(recA.id);
  ok("A: recommendation status becomes worn", recAAfter.status === "worn");
  ok("A: recommendation worn_at stored and matches RPC response", recAAfter.worn_at === aRow?.worn_at);

  const item1After = await getItem(item1.id);
  const item2After = await getItem(item2.id);
  const item3After = await getItem(item3.id);
  const actualLastWornAt = item1After.last_worn_at;
  ok("A: item1.last_worn_at set", !!actualLastWornAt);
  ok("A: item2.last_worn_at === item1.last_worn_at", item2After.last_worn_at === actualLastWornAt);
  ok("A: item3.last_worn_at === item1.last_worn_at", item3After.last_worn_at === actualLastWornAt);

  const unrelatedAfter = await getItem(unrelated.id);
  ok("A: unrelated item's last_worn_at unchanged", unrelatedAfter.last_worn_at === unrelatedBefore.last_worn_at);

  // ===================================================================
  // B. Sequential duplicate
  // ===================================================================
  console.log("\n=== B. Sequential duplicate ===");
  const beforeDup = await snapshotItems(selectedIds);
  const { data: bData, error: bErr } = await clientA.rpc("confirm_daily_drop_wear", {
    p_recommendation_id: recA.id,
    p_item_ids: selectedIds,
  });
  ok("B: RPC call succeeded", !bErr, bErr?.message);
  const bRow = Array.isArray(bData) ? bData[0] : bData;
  ok("B: status is already", bRow?.status === "already", JSON.stringify(bRow));
  ok("B: worn_at unchanged from original", bRow?.worn_at === aRow?.worn_at);
  const afterDup = await snapshotItems(selectedIds);
  ok("B: no item row changed on duplicate call", deepEqual(beforeDup, afterDup));
  const recAfterDup = await getRec(recA.id);
  ok("B: recommendation worn_at still matches original", recAfterDup.worn_at === aRow?.worn_at);

  // ===================================================================
  // C. Concurrent confirmation
  // ===================================================================
  console.log("\n=== C. Concurrent confirmation ===");
  const item1c = await makeItem(userA);
  const item2c = await makeItem(userA);
  const item3c = await makeItem(userA);
  const selectedIdsC = [item1c.id, item2c.id, item3c.id];
  const recC = await makeRecommendation(userA, selectedIdsC);

  // Two independent, real, signed-in sessions for the SAME user — not one
  // client called twice. Concurrency is real network-level simultaneity via
  // Promise.all against the local PostgREST/RPC endpoint.
  const clientA1 = await signIn(EMAIL_A);
  const clientA2 = await signIn(EMAIL_A);

  const [rC1, rC2] = await Promise.all([
    clientA1.rpc("confirm_daily_drop_wear", { p_recommendation_id: recC.id, p_item_ids: selectedIdsC }),
    clientA2.rpc("confirm_daily_drop_wear", { p_recommendation_id: recC.id, p_item_ids: selectedIdsC }),
  ]);
  const row1 = Array.isArray(rC1.data) ? rC1.data[0] : rC1.data;
  const row2 = Array.isArray(rC2.data) ? rC2.data[0] : rC2.data;
  const statuses = [row1?.status, row2?.status].sort();
  ok("C: exactly one confirmed + one already", deepEqual(statuses, ["already", "confirmed"]), JSON.stringify({ row1, row2 }));
  ok("C: both calls returned the SAME worn_at (no overwrite)", row1?.worn_at && row1.worn_at === row2?.worn_at);

  const recCAfter = await getRec(recC.id);
  ok("C: recommendation ends in worn with matching worn_at", recCAfter.status === "worn" && recCAfter.worn_at === row1?.worn_at);
  const unrelatedAfterC = await getItem(unrelated.id);
  ok("C: unrelated item still unaffected", unrelatedAfterC.last_worn_at === unrelatedBefore.last_worn_at);

  // ===================================================================
  // D. Exact-item-set validation — fresh recommendation per case, zero writes.
  // ===================================================================
  console.log("\n=== D. Exact-item-set validation ===");
  async function runInvalidSetCase(label, submittedIds, expectedStatuses) {
    const itemsD = [await makeItem(userA), await makeItem(userA), await makeItem(userA)];
    const idsD = itemsD.map(i => i.id);
    const recD = await makeRecommendation(userA, idsD);
    const before = await snapshotItems(idsD);
    const { data, error } = await clientA.rpc("confirm_daily_drop_wear", {
      p_recommendation_id: recD.id,
      p_item_ids: submittedIds(idsD),
    });
    ok(`D (${label}): RPC call succeeded (no transport error)`, !error, error?.message);
    const row = Array.isArray(data) ? data[0] : data;
    ok(`D (${label}): status is one of [${expectedStatuses.join(", ")}]`, expectedStatuses.includes(row?.status), JSON.stringify(row));
    const recAfterD = await getRec(recD.id);
    const after = await snapshotItems(idsD);
    assertZeroWrites(`D (${label})`, recD, recAfterD, before, after);
  }

  await runInvalidSetCase("missing selected id", (ids) => [ids[0], ids[1]], ["stale"]);
  await runInvalidSetCase("extra id (unrelated owned item)", (ids) => [...ids, unrelated.id], ["stale"]);
  await runInvalidSetCase("duplicate submitted id", (ids) => [ids[0], ids[0], ids[1]], ["invalid_items"]);
  await runInvalidSetCase("unrelated owned item substituted", (ids) => [ids[0], ids[1], unrelated.id], ["stale"]);
  await runInvalidSetCase("another user's item substituted", (ids) => [ids[0], ids[1], itemB.id], ["stale"]);

  // ===================================================================
  // E. Availability validation — fresh recommendation per case, zero writes.
  // ===================================================================
  console.log("\n=== E. Availability validation ===");
  async function runAvailabilityCase(label, statusValue, { deleteAfterLink = false } = {}) {
    const okItem1 = await makeItem(userA);
    const okItem2 = await makeItem(userA);
    const badItem = await makeItem(userA, { availability_status: deleteAfterLink ? "available" : statusValue });
    const idsE = [okItem1.id, okItem2.id, badItem.id];
    const recE = await makeRecommendation(userA, idsE);

    if (deleteAfterLink) {
      const { error: delErr } = await admin.from("wardrobe_items").delete().eq("id", badItem.id);
      if (delErr) fatal(`E (${label}): failed to delete fixture item: ${delErr.message}`);
    }

    const before = await snapshotItems(deleteAfterLink ? [okItem1.id, okItem2.id] : idsE);
    const { data, error } = await clientA.rpc("confirm_daily_drop_wear", {
      p_recommendation_id: recE.id,
      p_item_ids: idsE,
    });
    ok(`E (${label}): RPC call succeeded (no transport error)`, !error, error?.message);
    const row = Array.isArray(data) ? data[0] : data;
    const expected = deleteAfterLink ? "invalid_items" : "stale";
    ok(`E (${label}): status is ${expected}`, row?.status === expected, JSON.stringify(row));
    const recAfterE = await getRec(recE.id);
    const after = await snapshotItems(deleteAfterLink ? [okItem1.id, okItem2.id] : idsE);
    assertZeroWrites(`E (${label})`, recE, recAfterE, before, after);
  }

  await runAvailabilityCase("in_wash", "in_wash");
  await runAvailabilityCase("unavailable", "unavailable");
  await runAvailabilityCase("archived", "archived");
  await runAvailabilityCase("deleted/missing", null, { deleteAfterLink: true });

  // ===================================================================
  // F. Authentication and ownership
  // ===================================================================
  console.log("\n=== F. Authentication and ownership ===");
  const itemF1 = await makeItem(userA);
  const itemF2 = await makeItem(userA);
  const itemF3 = await makeItem(userA);
  const idsF = [itemF1.id, itemF2.id, itemF3.id];
  const recF = await makeRecommendation(userA, idsF);

  // F1: unauthenticated / anon cannot execute at all — a fresh anon client
  // with NO signed-in session sends the anon key as its own role; EXECUTE
  // was revoked from anon in 0023, so this must fail at the grant layer.
  const noSession = anonClient();
  const { data: fAnonData, error: fAnonErr } = await noSession.rpc("confirm_daily_drop_wear", {
    p_recommendation_id: recF.id,
    p_item_ids: idsF,
  });
  ok("F1: anon/unauthenticated call is REJECTED (error returned, no data)", !!fAnonErr && !fAnonData, JSON.stringify({ fAnonErr, fAnonData }));

  const recFAfterAnon = await getRec(recF.id);
  ok("F1: recommendation untouched after anon attempt", recFAfterAnon.status === "prepared" && recFAfterAnon.worn_at === null);

  // F2: user B cannot confirm user A's recommendation.
  const clientB = await signIn(EMAIL_B);
  const { data: fBData, error: fBErr } = await clientB.rpc("confirm_daily_drop_wear", {
    p_recommendation_id: recF.id,
    p_item_ids: idsF,
  });
  const fBRow = Array.isArray(fBData) ? fBData[0] : fBData;
  ok("F2: user B's attempt on user A's recommendation returns not_found (RLS-hidden, not leaked)", !fBErr && fBRow?.status === "not_found", JSON.stringify({ fBErr, fBRow }));
  const recFAfterB = await getRec(recF.id);
  ok("F2: recommendation still untouched after user B's attempt", recFAfterB.status === "prepared" && recFAfterB.worn_at === null);
  const itemF1AfterB = await getItem(itemF1.id);
  ok("F2: user A's item untouched by user B's attempt", itemF1AfterB.last_worn_at === null);

  // F3: authenticated callers can affect only their own records — confirm
  // user B's own item is untouched by anything in this suite so far, and
  // that A's confirmation of recF (below) never touches B's item.
  const itemBBeforeF = await getItem(itemB.id);
  const { data: fAData } = await clientA.rpc("confirm_daily_drop_wear", { p_recommendation_id: recF.id, p_item_ids: idsF });
  const fARow = Array.isArray(fAData) ? fAData[0] : fAData;
  ok("F3: user A CAN confirm her own recommendation", fARow?.status === "confirmed", JSON.stringify(fARow));
  const itemBAfterF = await getItem(itemB.id);
  ok("F3: user B's item untouched by user A's confirmation", itemBAfterF.last_worn_at === itemBBeforeF.last_worn_at);

  // ===================================================================
  // G. Forced rollback (local database only) — install, exercise, remove.
  // ===================================================================
  console.log("\n=== G. Forced rollback ===");
  const itemG1 = await makeItem(userA);
  const itemG2 = await makeItem(userA);
  const itemG3 = await makeItem(userA);
  const idsG = [itemG1.id, itemG2.id, itemG3.id];
  const recG = await makeRecommendation(userA, idsG);
  const beforeG = await snapshotItems(idsG);

  const TRIGGER_FN = "wearwise_test_force_wardrobe_update_fail";
  const TRIGGER_NAME = "wearwise_test_force_wardrobe_update_fail_trg";
  await pgClient.query(`
    create or replace function public.${TRIGGER_FN}()
    returns trigger language plpgsql as $$
    begin
      raise exception 'wearwise_test_forced_failure: injected by test-atomic-wear-local.mjs (section G)';
    end;
    $$;
    create trigger ${TRIGGER_NAME}
      before update on public.wardrobe_items
      for each row execute function public.${TRIGGER_FN}();
  `);

  let gErrCaught = null;
  let gData = null;
  try {
    const { data, error } = await clientA.rpc("confirm_daily_drop_wear", { p_recommendation_id: recG.id, p_item_ids: idsG });
    gErrCaught = error;
    gData = data;
  } catch (e) {
    gErrCaught = e;
  } finally {
    // Remove the trigger BEFORE any further assertions/fixtures run, no
    // matter what happened above. (The top-level finally, further down,
    // also removes it defensively in case this inner block itself throws.)
    await pgClient.query(`
      drop trigger if exists ${TRIGGER_NAME} on public.wardrobe_items;
      drop function if exists public.${TRIGGER_FN}();
    `);
  }

  ok("G: RPC call fails (error returned) when the forced trigger fires", !!gErrCaught && !gData, JSON.stringify({ gErrCaught, gData }));
  const recGAfter = await getRec(recG.id);
  ok("G: recommendation remains NOT worn", recGAfter.status === "prepared");
  ok("G: recommendation worn_at remains null", recGAfter.worn_at === null);
  const afterG = await snapshotItems(idsG);
  ok("G: all selected items' last_worn_at unchanged (full rollback)", deepEqual(beforeG, afterG));
  console.log("G: temporary trigger removed.");

  // ===================================================================
  // H. Timezone / local-date
  //
  // recA's local_date (created in section A via nextLocalDate(), which
  // always produces a date >=11 days before "now") is DELIBERATELY
  // different from UTC/server today by construction — this section proves
  // that difference survives into last_worn_at, not just that some date
  // got written. As of the migration 0023 local-date fix (2026-07-11),
  // last_worn_at is written from the locked recommendation's own
  // local_date (v_rec.local_date), never from clock_timestamp()::date —
  // so this assertion is now expected to PASS. If it ever fails, that is a
  // genuine regression back to the original bug, not a known issue.
  // ===================================================================
  console.log("\n=== H. Timezone / local-date ===");
  console.log(`H: recommendation A local_date = ${recA.local_date}`);
  console.log(`H: item1.last_worn_at (actual, after confirmation)  = ${actualLastWornAt}`);
  console.log(`H: UTC "today" at test run time                     = ${utcToday}`);
  console.log(`H: local_date deliberately differs from UTC today: ${recA.local_date !== utcToday}`);
  const matchesLocalDate = actualLastWornAt === recA.local_date;
  const matchesUtcToday = actualLastWornAt === utcToday;
  ok("H: last_worn_at equals daily_recommendations.local_date (fixed in migration 0023, 2026-07-11)", matchesLocalDate,
    `actual=${actualLastWornAt} local_date=${recA.local_date} utcToday=${utcToday} matchesUtcToday=${matchesUtcToday}`);
  ok("H: a local_date deliberately different from UTC/server today was preserved (not coincidental)",
    recA.local_date !== utcToday && matchesLocalDate);
  if (!matchesLocalDate) {
    console.log(
      `H: REGRESSION — last_worn_at does NOT match local_date. It ${matchesUtcToday ? "matches" : "does not match"} ` +
      `UTC-today instead. Migration 0023 is supposed to write last_worn_at from the locked recommendation's own ` +
      `local_date (v_rec.local_date), not from the server clock. This means the local-date fix landed on ` +
      `2026-07-11 is not behaving as intended in this environment — treat as a release blocker, not a known gap.`
    );
  }

  // ===================================================================
  // Cleanup
  // ===================================================================
  console.log("\n=== Cleanup ===");
  for (const id of cleanupUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    // Deleting the auth user cascades (on delete cascade) to profiles,
    // wardrobe_items, and daily_recommendations for that user.
    if (error) console.log(`  WARN: failed to delete test user ${id.slice(0, 8)}…: ${error.message}`);
    else console.log(`  removed test user ${id.slice(0, 8)}… and cascaded rows`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("FAILURES:\n - " + fails.join("\n - "));
  }
  return failed === 0;
}

// =====================================================================
// Single top-level try/catch/finally — the ONLY place resource cleanup
// and process exit status are decided. Every fatal()/thrown error from
// anywhere above lands here; nothing exits early without going through
// this finally block first.
// =====================================================================
let success = false;
try {
  success = await run();
} catch (err) {
  if (err instanceof FatalError) {
    console.error(`\nABORT (safety gate or fixture setup failure): ${err.message}`);
  } else {
    console.error("\nUNEXPECTED ERROR:", err?.stack || err);
  }
  success = false;
} finally {
  // Defensive: make sure the forced-failure trigger never survives a crash
  // mid-section-G, even if an assertion above threw. Guarded — pgClient
  // stays null if a safety-gate check failed before pgClient.connect()
  // was ever reached, so there is nothing to clean up in that case.
  if (pgClient) {
    try {
      await pgClient.query(`
        drop trigger if exists wearwise_test_force_wardrobe_update_fail_trg on public.wardrobe_items;
        drop function if exists public.wearwise_test_force_wardrobe_update_fail();
      `);
    } catch { /* best effort — do not let cleanup itself mask the real failure */ }
    try {
      await pgClient.end();
    } catch { /* connection may already be in a closing state — best effort */ }
  }
  // No child-process handles, timers, or listeners are created anywhere in
  // this script outside of execSync (synchronous, self-closing) and the
  // supabase-js clients (created with autoRefreshToken/persistSession
  // disabled specifically so they never arm a background timer). pgClient
  // above is the only handle that requires explicit closing.
}

// Set the exit CODE and let Node drain the event loop naturally, instead
// of calling process.exit() — forcing an immediate exit while a socket
// (e.g. the one `pgClient.end()` just asked to close) is still tearing
// down at the OS level is what previously risked a libuv
// UV_HANDLE_CLOSING-style assertion on a normal failed run. With no open
// handles left after the finally block above, Node exits on its own with
// this code once the microtask/event queue is empty.
process.exitCode = success ? 0 : 1;
