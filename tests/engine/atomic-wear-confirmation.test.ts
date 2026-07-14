// =====================================================================
// WearWise — Atomic Wear Confirmation (Phase 4C atomicity hotfix) wiring
// guard. Source-structure assertions over supabase/migrations/0023_*.sql
// proving the required transaction contract is present in the SQL text:
// row locking, ownership via auth.uid(), idempotency-before-any-write,
// exact order-independent item-set matching, duplicate rejection,
// availability re-check, a single shared timestamp for the timestamptz
// writes, the recommendation's own local_date for the wardrobe date write,
// scoped updates, and a least-privilege SECURITY INVOKER grant model.
//
// HONESTY NOTE (do not remove): these are STATIC TEXT assertions. They
// prove the SQL is *shaped* correctly — they do NOT execute Postgres, do
// NOT prove row-lock blocking behavior under real concurrency, do NOT
// prove a rollback actually happens on a forced mid-transaction failure,
// and do NOT prove that a local_date different from the server's date is
// actually preserved end-to-end (that requires running the function, not
// reading its text). Real, executed proof of all of the above lives in
// scripts/test-atomic-wear-local.mjs (`npm run test:atomic-wear:local`),
// which runs against a real local Supabase stack via the actual
// Auth/API/RPC path. That script — not this file — is the source of truth
// for whether this migration is safe to ship.
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}

const UP = "supabase/migrations/0023_atomic_wear_confirmation.sql";
// Rollback scripts live under supabase/rollbacks/, not supabase/migrations/,
// as of the migration-chain repair (2026-07-11) — the Supabase CLI applies
// every .sql file under migrations/ during db reset, so a *_down.sql file
// left there would unintentionally become part of the "up" chain.
const DOWN = "supabase/rollbacks/0023_atomic_wear_confirmation_down.sql";
const up = readFileSync(UP, "utf8");
const down = readFileSync(DOWN, "utf8");

// =====================================================================
// 1. Function shape, security model, least-privilege grants.
// =====================================================================
{
  ok("defines confirm_daily_drop_wear(uuid, uuid[])",
    up.includes("create or replace function public.confirm_daily_drop_wear(") &&
    up.includes("p_recommendation_id uuid,") &&
    up.includes("p_item_ids uuid[]"));

  ok("returns a status/worn_at/item_count/reason row",
    /returns table \(\s*status text,[\s\S]*?worn_at timestamptz,[\s\S]*?item_count integer,[\s\S]*?reason text/.test(up));

  ok("uses SECURITY INVOKER, not DEFINER (RLS already grants owner access)",
    up.includes("security invoker") && !up.includes("security definer"));

  ok("search_path is pinned (defense in depth even under INVOKER)",
    up.includes("set search_path = public, pg_temp"));

  ok("execution is revoked from PUBLIC and anon",
    up.includes("revoke all on function public.confirm_daily_drop_wear(uuid, uuid[]) from public") &&
    up.includes("revoke all on function public.confirm_daily_drop_wear(uuid, uuid[]) from anon"));

  ok("execution is granted ONLY to authenticated",
    up.includes("grant execute on function public.confirm_daily_drop_wear(uuid, uuid[]) to authenticated"));

  ok("never accepts a user_id parameter — identity comes only from auth.uid()",
    !/p_user_id|p_uid/.test(up));

  ok("reads the caller's identity via auth.uid()",
    up.includes("v_uid uuid := auth.uid();"));

  ok("rejects unauthenticated calls (auth.uid() is null) before touching any table",
    up.indexOf("if v_uid is null then") < up.indexOf("select dr.id, dr.user_id"));

  ok("RPC signature is UNCHANGED by the local-date fix (still exactly 2 params, same return shape)",
    up.includes("p_recommendation_id uuid,\n  p_item_ids uuid[]\n)") &&
    /returns table \(\s*status text,[\s\S]*?worn_at timestamptz,[\s\S]*?item_count integer,[\s\S]*?reason text/.test(up));
}

// =====================================================================
// 2. Row locking.
// =====================================================================
{
  ok("locks the daily_recommendations row with FOR UPDATE, and now also selects local_date off that SAME locked row",
    /select dr\.id, dr\.user_id, dr\.status, dr\.worn_at, dr\.selected_item_ids, dr\.local_date\s*into v_rec\s*from public\.daily_recommendations dr\s*where dr\.id = p_recommendation_id\s*and dr\.user_id = v_uid\s*for update/.test(up));

  ok("locks the referenced wardrobe_items rows (deterministic id order)",
    /from public\.wardrobe_items wi\s*where wi\.id = any\(v_current_ids\)\s*and wi\.user_id = v_uid\s*order by wi\.id\s*for update/.test(up));

  ok("wardrobe_items are locked using the SERVER's current selected_item_ids, not the raw client submission",
    up.includes("where wi.id = any(v_current_ids)"));
}

// =====================================================================
// 3. Idempotency gate runs on the LOCKED row, before any write.
// =====================================================================
{
  const idempotencyIdx = up.indexOf("if v_rec.status = 'worn' then");
  const firstUpdateIdx = up.indexOf("update public.wardrobe_items");
  ok("idempotency check exists and runs strictly before the first core write",
    idempotencyIdx > -1 && firstUpdateIdx > -1 && idempotencyIdx < firstUpdateIdx);

  ok("idempotency check happens AFTER the row lock (FOR UPDATE) is acquired — the true serialization point",
    up.indexOf("for update;\n\n  if not found then") < idempotencyIdx);

  ok('duplicate confirmation returns "already" with the ORIGINAL worn_at (never a fresh one)',
    /'already'::text, v_rec\.worn_at,/.test(up));

  ok("the already-worn branch performs zero writes (no update/insert between the check and its return)",
    (() => {
      const start = idempotencyIdx;
      const end = up.indexOf("return;", start);
      const slice = up.slice(start, end);
      return !/\bupdate\b|\binsert\b/i.test(slice);
    })());
}

// =====================================================================
// 4. LOCAL-DATE FIX — last_worn_at comes from the recommendation's own
//    local_date, never from the server/session clock, and fails closed
//    (zero writes) if local_date is unexpectedly null.
// =====================================================================
{
  ok('migration source no longer contains "last_worn_at = v_now::date" (the original bug)',
    !up.includes("last_worn_at = v_now::date"));

  ok("no variant of a server-clock-derived date is used for last_worn_at (current_date / now()::date)",
    !/last_worn_at\s*=\s*current_date\b/.test(up) &&
    !/last_worn_at\s*=\s*now\(\)::date/.test(up));

  ok("declares a dedicated v_local_date variable, typed date",
    /v_local_date\s+date;/.test(up));

  ok("v_local_date is assigned FROM the locked recommendation row (v_rec.local_date), not recomputed",
    up.includes("v_local_date := v_rec.local_date;"));

  ok("wardrobe_items.last_worn_at is written from v_local_date",
    up.includes("set last_worn_at = v_local_date"));

  ok("the wardrobe_items UPDATE is scoped to exactly this outfit's current items and this owner, using v_local_date",
    /update public\.wardrobe_items\s*set last_worn_at = v_local_date\s*where id = any\(v_current_ids\)\s*and user_id = v_uid/.test(up));

  const nullCheckIdx = up.indexOf("if v_rec.local_date is null then");
  const assignIdx = up.indexOf("v_local_date := v_rec.local_date;");
  const firstUpdateIdx = up.indexOf("update public.wardrobe_items");
  ok("a null local_date on the locked row is explicitly checked and fails closed",
    nullCheckIdx > -1 && up.slice(nullCheckIdx).includes("'error'::text, null::timestamptz, 0, 'missing_local_date'::text"));

  ok("the null-local_date check runs BEFORE v_local_date is assigned, and BEFORE either core write",
    nullCheckIdx > -1 && nullCheckIdx < assignIdx && assignIdx < firstUpdateIdx);

  ok("the null-local_date branch performs zero writes (no update/insert between the check and its return)",
    (() => {
      const end = up.indexOf("return;", nullCheckIdx);
      const slice = up.slice(nullCheckIdx, end);
      return !/\bupdate\b|\binsert\b/i.test(slice);
    })());

  ok("worn_at/updated_at are UNCHANGED by the fix — still the single shared v_now timestamptz",
    up.includes("set status = 'worn', worn_at = v_now, updated_at = v_now"));
}

// =====================================================================
// 5. Exact order-independent item-set matching + duplicate rejection.
//    (Unchanged by the local-date fix — regression check.)
// =====================================================================
{
  ok("rejects a null/empty item-id submission",
    up.includes("if p_item_ids is null or array_length(p_item_ids, 1) is null then"));

  ok("rejects duplicate submitted ids explicitly (distinct count-of vs count)",
    up.includes("(select count(*) from unnest(p_item_ids)) <> (select count(distinct x) from unnest(p_item_ids) x)"));

  ok("compares submitted vs current ids as an exact, order-independent SET (length + both-direction containment)",
    up.includes("array_length(p_item_ids, 1) <> array_length(v_current_ids, 1)") &&
    up.includes("exists (select 1 from unnest(p_item_ids) x where not (x = any(v_current_ids)))") &&
    up.includes("exists (select 1 from unnest(v_current_ids) x where not (x = any(p_item_ids)))"));

  ok("a set mismatch (missing OR extra ids) fails closed as stale, zero writes",
    up.includes("outfit_changed") &&
    up.indexOf("outfit_changed") < up.indexOf("update public.wardrobe_items"));
}

// =====================================================================
// 6. Availability re-check (in_wash / unavailable / archived / missing).
//    (Unchanged by the local-date fix — regression check.)
// =====================================================================
{
  ok("checks existence + ownership of every referenced item (missing/other-owner -> invalid_items)",
    up.includes("where not exists (\n      select 1 from public.wardrobe_items wi\n      where wi.id = want.id and wi.user_id = v_uid\n    )"));

  ok("checks availability_status = 'available' for every item (rejects in_wash/unavailable/archived)",
    up.includes("and wi.availability_status <> 'available'"));

  ok("availability failure fails closed as stale, zero writes, before either core write",
    up.indexOf("wi.availability_status <> 'available'") < up.indexOf("update public.wardrobe_items"));
}

// =====================================================================
// 7. One shared timestamp for the timestamptz writes; scoped writes; no
//    swallowed exceptions. (Regression check — the fix must not touch
//    the concurrency/rollback contract.)
// =====================================================================
{
  ok("exactly one clock_timestamp() call for the whole function (v_now, captured once at entry — used for worn_at/updated_at ONLY, never for last_worn_at anymore)",
    (up.match(/clock_timestamp\(\)/g) ?? []).length === 1 &&
    up.includes("v_now timestamptz := clock_timestamp();"));

  ok("daily_recommendations UPDATE is scoped to id AND user_id (double-scoped)",
    /update public\.daily_recommendations\s*set status = 'worn', worn_at = v_now, updated_at = v_now\s*where id = p_recommendation_id\s*and user_id = v_uid/.test(up));

  ok("wardrobe_items is written BEFORE daily_recommendations (documented write order, unchanged)",
    up.indexOf("update public.wardrobe_items") < up.indexOf("update public.daily_recommendations"));

  ok("no EXCEPTION block swallows errors inside the function body (so any failure aborts the whole transaction, both writes roll back)",
    !/exception\s+when/i.test(up));

  ok("the function returns the STORED v_now on success, not a value recomputed after the writes",
    /select 'confirmed'::text, v_now,/.test(up));
}

// =====================================================================
// 8. Down migration cleanly removes the function and its grants.
//    Signature and owned objects are unchanged by the local-date fix, so
//    the down migration itself needed no changes — this just re-confirms
//    it still matches the (unchanged) function signature.
// =====================================================================
{
  ok("down migration drops the function", down.includes("drop function if exists public.confirm_daily_drop_wear(uuid, uuid[]);"));
  ok("down migration revokes all grants first", down.includes("revoke all on function public.confirm_daily_drop_wear(uuid, uuid[]) from authenticated"));
}

// =====================================================================
// 9. Explicit, honest pointer to where the REAL (executed) proof lives.
//    These are NOT pass/fail — they exist so the summary always reminds
//    whoever runs this suite that the concurrency/rollback/local-date
//    claims above are structural only, and where the real evidence is.
// =====================================================================
console.log("\nNOTE: this file proves SQL shape only. Real, executed proof of:");
console.log("  - A local_date deliberately different from the server/UTC date being preserved in last_worn_at.");
console.log("  - Two concurrent RPC calls resulting in exactly one 'confirmed' and one 'already'.");
console.log("  - The second (blocked) caller's worn_at remaining unchanged from the first caller's value.");
console.log("  - A forced exception after the wardrobe_items UPDATE actually rolling back that UPDATE.");
console.log("  ...lives in scripts/test-atomic-wear-local.mjs (`npm run test:atomic-wear:local`), run against a real local Supabase stack.");

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
