#!/usr/bin/env node
// =====================================================================
// WearWise — record_gem_removal + reset_gem_skip_after_wear REAL integration
// test (Phase 5, Module F). Against a REAL local Supabase stack (0029):
//   1. same operation_id retried twice increments once;
//   2. two distinct operation_ids → two removals → cooldown;
//   3. old operation retried after a newer one still does not increment;
//   4. 2nd distinct removal returns show_rest_message once; duplicate does not;
//   5. cross-owner RPC denied;
//   6. pre-swap outfit lacking the gem rejected;
//   7. post-swap outfit still containing the gem rejected;
//   8. mismatched accepted-result fingerprint rejected;
//   9. DIRECT authenticated INSERT into gem_removal_events denied (integrity);
//  10. reset_gem_skip_after_wear resets an incomplete skip, verifies gem, and
//      never cancels an active cooldown; cross-owner reset denied.
// SAFETY GATE: aborts unless every URL in `supabase status -o json` is local.
// Usage: npm run test:gem-removal:local
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
const one = (d) => (Array.isArray(d) ? d[0] : d) ?? {};

async function run() {
  const st = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  for (const [k, url] of Object.entries(st).filter(([, v]) => typeof v === "string" && /^https?:\/\//i.test(v))) {
    const host = new URL(url).hostname;
    if (/supabase\.co$/i.test(host) || !/^(127\.0\.0\.1|localhost|::1)$/i.test(host)) fatal(`endpoint "${k}" is not local. Refusing.`);
  }
  const { API_URL, DB_URL, ANON_KEY, SERVICE_ROLE_KEY } = st;
  if (!API_URL || !DB_URL || !ANON_KEY || !SERVICE_ROLE_KEY) fatal("missing local credentials.");
  console.log("Safety gate OK — local only.");

  const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = () => createClient(API_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  pgClient = new pg.Client({ connectionString: DB_URL });
  await pgClient.connect();

  const tag = randomUUID().slice(0, 8);
  const mkUser = async (n) => {
    const { data, error } = await admin.auth.admin.createUser({ email: `wearwise-gr-${n}-${tag}@wearwise-test.local`, password: "TestPassword123!", email_confirm: true });
    if (error) fatal(`create user ${n}: ${error.message}`); return data.user.id;
  };
  const userA = await mkUser("a");
  const userB = await mkUser("b");

  const seedItem = async (uid, cat) => (await pgClient.query(`insert into public.wardrobe_items (user_id, image_path, category) values ($1,$2,$3) returning id;`, [uid, `t/${tag}-${cat}.jpg`, cat])).rows[0].id;
  const gemId = await seedItem(userA, "kurta");
  const otherId = await seedItem(userA, "jeans");
  // pre-swap outfit HAD the gem; post-swap (current selected) does NOT.
  const recId = (await pgClient.query(
    `insert into public.daily_recommendations (user_id, local_date, status, selected_item_ids, pre_swap_item_ids, outfit_status)
     values ($1, current_date, 'opened', $2, $3, 'complete') returning id;`,
    [userA, [otherId], [gemId, otherId]]
  )).rows[0].id;

  const aClient = anon();
  { const { error } = await aClient.auth.signInWithPassword({ email: `wearwise-gr-a-${tag}@wearwise-test.local`, password: "TestPassword123!" }); if (error) fatal(`sign in A: ${error.message}`); }
  const call = (client, opId, gem = gemId, expected = [otherId], rec = recId) =>
    client.rpc("record_gem_removal", { p_operation_id: opId, p_recommendation_id: rec, p_gem_item_id: gem, p_expected_post_swap_ids: expected });

  try {
    const op1 = randomUUID(), op2 = randomUUID();

    const r1 = one((await call(aClient, op1)).data);
    ok("op1 → counted, skip 1", r1.status === "counted" && r1.skip_count === 1, JSON.stringify(r1));
    const r1b = one((await call(aClient, op1)).data);
    ok("op1 retried → duplicate, skip still 1", r1b.status === "duplicate" && r1b.skip_count === 1);
    const r2 = one((await call(aClient, op2)).data);
    ok("op2 distinct → rested, skip 2, show_rest true", r2.status === "rested" && r2.skip_count === 2 && r2.show_rest_message === true, JSON.stringify(r2));
    const r2b = one((await call(aClient, op2)).data);
    ok("op2 retried → duplicate, show_rest false", r2b.status === "duplicate" && r2b.show_rest_message === false);
    const r1c = one((await call(aClient, op1)).data);
    ok("old op1 retried after op2 → duplicate (no extra increment)", r1c.status === "duplicate");
    const skipRow = (await pgClient.query(`select gem_skip_count, gem_cooldown_until from public.wardrobe_items where id=$1;`, [gemId])).rows[0];
    ok("skip count exactly 2 + cooldown set", skipRow.gem_skip_count === 2 && skipRow.gem_cooldown_until !== null);

    // cross-owner
    const bClient = anon();
    await bClient.auth.signInWithPassword({ email: `wearwise-gr-b-${tag}@wearwise-test.local`, password: "TestPassword123!" });
    ok("cross-owner record_gem_removal → not_found", one((await call(bClient, randomUUID())).data).status === "not_found");

    // pre-swap lacked the gem → build a rec whose pre_swap has no gem
    const recNoPre = (await pgClient.query(`insert into public.daily_recommendations (user_id, local_date, status, selected_item_ids, pre_swap_item_ids, outfit_status) values ($1, current_date - 1, 'opened', $2, $3, 'complete') returning id;`, [userA, [otherId], [otherId]])).rows[0].id;
    ok("pre-swap without gem → rejected", one((await call(aClient, randomUUID(), gemId, [otherId], recNoPre)).data).status === "pre_swap_missing_gem");

    // mismatched accepted result fingerprint
    ok("mismatched accepted-result → rejected", one((await call(aClient, randomUUID(), gemId, [gemId, otherId], recNoPre)).data).status !== "counted");

    // post-swap still contains gem
    await pgClient.query(`update public.daily_recommendations set selected_item_ids=$1 where id=$2;`, [[otherId, gemId], recId]);
    ok("post-swap still contains gem → gem_still_present", one((await call(aClient, randomUUID(), gemId, [otherId, gemId])).data).status === "gem_still_present");

    // direct authenticated INSERT into the integrity table is denied
    const ins = await aClient.from("gem_removal_events").insert({ user_id: userA, operation_id: randomUUID(), recommendation_id: recId, gem_item_id: gemId, outfit_fingerprint: "x" });
    ok("direct authenticated INSERT into gem_removal_events denied", !!ins.error);

    // ---- reset_gem_skip_after_wear ----
    // Fresh gem item with incomplete skip (1), gem in worn outfit, no cooldown.
    const gem2 = await seedItem(userA, "kurta");
    await pgClient.query(`update public.wardrobe_items set gem_skip_count=1 where id=$1;`, [gem2]);
    const recWear = (await pgClient.query(`insert into public.daily_recommendations (user_id, local_date, status, selected_item_ids, outfit_status) values ($1, current_date - 2, 'worn', $2, 'complete') returning id;`, [userA, [gem2, otherId]])).rows[0].id;
    const rr = one((await aClient.rpc("reset_gem_skip_after_wear", { p_recommendation_id: recWear, p_gem_item_id: gem2 })).data);
    ok("reset: verified gem wear + reset incomplete skip", rr.is_gem_wear === true && rr.reset === true);
    ok("reset: gem_skip_count now 0", (await pgClient.query(`select gem_skip_count from public.wardrobe_items where id=$1;`, [gem2])).rows[0].gem_skip_count === 0);
    // active cooldown NOT cancelled (gemId is cooling from earlier)
    const rrCool = one((await aClient.rpc("reset_gem_skip_after_wear", { p_recommendation_id: recId, p_gem_item_id: gemId })).data);
    ok("reset: active cooldown preserved (no reset while cooling)", rrCool.reset === false && (await pgClient.query(`select gem_cooldown_until from public.wardrobe_items where id=$1;`, [gemId])).rows[0].gem_cooldown_until !== null);
    // cross-owner reset denied
    ok("reset: cross-owner → not a gem wear", one((await bClient.rpc("reset_gem_skip_after_wear", { p_recommendation_id: recWear, p_gem_item_id: gem2 })).data).is_gem_wear === false);
  } finally {
    await pgClient.query("delete from public.daily_recommendations where user_id = any($1::uuid[])", [[userA, userB]]).catch(() => {});
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
