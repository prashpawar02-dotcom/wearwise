// =====================================================================
// WearWise — 0029 gem-removal migration STATIC contract test (Phase 5, F6).
// Real behavior is proven by scripts/test-gem-removal-local.mjs (local stack).
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0029_gem_cooldown.sql"), "utf8").replace(/\r\n/g, "\n");
const tableBlock = sql.slice(sql.indexOf("create table if not exists public.gem_removal_events"), sql.indexOf(");", sql.indexOf("gem_removal_events")));

// Durable dedup record + unique operation identity.
ok("0029: gem_removal_events table exists", sql.includes("create table if not exists public.gem_removal_events"));
ok("0029: UNIQUE (user_id, operation_id) idempotency key", sql.includes("unique (user_id, operation_id)"));
ok("0029: no last_operation_id COLUMN", !/add column[^;]*last_operation_id/.test(sql) && !/^\s*last_operation_id\b/m.test(tableBlock));
ok("0029: FK to daily_recommendations", sql.includes("references public.daily_recommendations(id)"));
ok("0029: FK to wardrobe_items", sql.includes("references public.wardrobe_items(id)"));
ok("0029: no free-text/photo/path columns in the record", !/(image_path|photo|caption|\bnote\b|garment_name)/.test(tableBlock));

// Event table is integrity state — clients cannot INSERT/UPDATE/DELETE.
ok("0029: gem_removal_events RLS enabled", sql.includes("alter table public.gem_removal_events enable row level security"));
ok("0029: authenticated gets read-own SELECT only", sql.includes("grant select on table public.gem_removal_events to authenticated"));
ok("0029: authenticated NOT granted INSERT on the event table", !/grant[^;]*insert[^;]*on table public\.gem_removal_events to authenticated/.test(sql));
ok("0029: revoke-all from authenticated before the read grant", sql.includes("revoke all on table public.gem_removal_events from authenticated"));
ok("0029: anon revoked on the table", sql.includes("revoke all on table public.gem_removal_events from anon"));

// record_gem_removal — SECURITY DEFINER + full integrity checks.
ok("0029: record_gem_removal is SECURITY DEFINER", /create or replace function public\.record_gem_removal[\s\S]*?security definer/.test(sql));
ok("0029: identity from auth.uid()", sql.includes("v_uid uuid := auth.uid()"));
ok("0029: search_path pinned", sql.includes("set search_path = public, pg_temp"));
ok("0029: verifies outfit_status complete", sql.includes("v_rec.outfit_status is distinct from 'complete'"));
ok("0029: pre-swap outfit must contain the gem", sql.includes("pre_swap_missing_gem") && sql.includes("p_gem_item_id = any(v_rec.pre_swap_item_ids)"));
ok("0029: post-swap must NOT contain the gem", sql.includes("p_gem_item_id = any(v_rec.selected_item_ids)") && sql.includes("gem_still_present"));
ok("0029: current selected set must match accepted result", sql.includes("result_mismatch"));
ok("0029: server-derived fingerprint (not client-provided)", sql.includes("string_agg(x, ',' order by x)"));
ok("0029: all selected items must be owned + available", sql.includes("outfit_unavailable"));
ok("0029: idempotent insert (on conflict do nothing)", sql.includes("on conflict (user_id, operation_id) do nothing"));
ok("0029: duplicate op returns without incrementing", sql.includes("'duplicate'"));
ok("0029: second removal starts 90-day cooldown", sql.includes("make_interval(days => v_cooldown_days)") && sql.includes("v_cooldown_days constant integer := 90"));
ok("0029: rest message consumed once (rested → true)", sql.includes("'rested'::text, true"));
ok("0029: anon cannot execute record_gem_removal", sql.includes("revoke all on function public.record_gem_removal(uuid, uuid, uuid, uuid[]) from anon"));
ok("0029: authenticated granted execute record_gem_removal", sql.includes("grant execute on function public.record_gem_removal(uuid, uuid, uuid, uuid[]) to authenticated"));

// reset_gem_skip_after_wear — verified, cooldown-preserving, idempotent.
ok("0029: reset_gem_skip_after_wear exists", sql.includes("function public.reset_gem_skip_after_wear("));
ok("0029: reset verifies gem is in the worn outfit", sql.includes("p_gem_item_id = any(v_rec.selected_item_ids)"));
ok("0029: reset never cancels an active cooldown", /update public\.wardrobe_items[\s\S]*?gem_cooldown_until is null/.test(sql));
ok("0029: reset only touches gem_skip_count (not availability)", !/reset_gem_skip_after_wear[\s\S]*?availability_status\s*=/.test(sql));
ok("0029: anon cannot execute reset", sql.includes("revoke all on function public.reset_gem_skip_after_wear(uuid, uuid) from anon"));
ok("0029: authenticated granted execute reset", sql.includes("grant execute on function public.reset_gem_skip_after_wear(uuid, uuid) to authenticated"));

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
process.exit(0);
