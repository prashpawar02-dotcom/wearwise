# WearWise — Changelog

## Phase 4D — Onboarding v2 (2026-07-14)

Local-only, not committed/pushed/deployed. Rebuilt first-run onboarding as a
6-step flow (Welcome → Basic context → Style preference → Wardrobe
readiness → First-recommendation readiness → Completion) that collects only
fields the recommendation engine or product logic actually reads, gets a
new user to a valid first Today outfit as fast as their wardrobe allows,
and is safely resumable if exited mid-flow.

**Ground truth first.** Before writing any UI, audited every existing
profile field against the engine (`src/lib/engine/*`) and product routes:
`style_preferences` and `excluded_*` genuinely feed `scoring.ts`; `city`
feeds `getWeatherContext`; `full_name` is display-only but genuinely
rendered; `age_range` is collected by the OLD onboarding form but never
read anywhere in the engine or UI (grep-confirmed) — kept in the DB for the
existing settings form's backward compatibility, but NOT asked again in
the new flow's required path. `gender` was never a real field anywhere in
the schema or UI — not added.

**State model, minimal migration.** New migration
`supabase/migrations/0025_onboarding_v2.sql` (down file in
`supabase/rollbacks/`, NOT applied anywhere) adds exactly two columns to
`profiles`: `onboarding_step` (check-constrained enum of the 6 steps, for
resume) and `default_occasion` (free text, UI-validated). The other 4 of 6
required states (`new`, `completed`, `wardrobe_incomplete`, `ready`) are
derived — `new`/`completed` from existing `onboarded`, wardrobe states
computed LIVE from `wardrobe_items` (never persisted, so it can never go
stale) via the new pure module `src/lib/onboarding.ts`
(`computeWardrobeReadiness`, `computeOnboardingState`). `error` is
inherently transient UI state, not persisted. No RLS changes — reuses the
existing `profiles_update_own` policy precedent from 0008/0020/0021.

**Flow implementation.** `src/app/(app)/onboarding/onboarding-flow.tsx`
(new client component) implements all 6 steps with `Button size="full"`
primary actions, a progress indicator (not a long numbered list), skippable
optional fields (style preference), required-field validation before any
save (name + default occasion), never-block-on-footwear wardrobe logic
(`MIN_OUTFIT_ITEMS = 2`, tops+bottoms or one-piece + `wardrobeReady`), and
an honest "Ready for Today" vs. "Add one more item" readiness screen that
never fabricates a completed outfit. Every save is a targeted
`.update({ ...fields, onboarding_step: step })` — never an insert, so
`handle_new_user()`'s single profile-row creation is never duplicated.
Resume reads `profiles.onboarding_step` and never regresses progress
(`furthestOf`/`hasReached` in `src/lib/onboarding.ts`).

`src/app/(app)/onboarding/page.tsx` now branches on `profile.onboarded`:
true still renders the original `OnboardingForm` settings-edit component
completely unchanged (Profile → "Wardrobe preferences" entry point
preserved), false renders the new `OnboardingFlow` — so existing users are
never forced through onboarding again, and the dual-purpose route survives
intact. `occasion/new/occasion-form.tsx`'s "Use today's default" button now
prefers `profiles.default_occasion` when it matches a known occasion key,
falling back to the original weekday/weekend heuristic unchanged if unset.

**Telemetry.** Audited existing event names first (no collisions). Wired
exactly the 8 required stage events, each fired from exactly one call
site: `onboarding_started`/`onboarding_wardrobe_started`/`onboarding_ready`
via `ViewBeacon` (mount-identity dedup, same pattern as `today_viewed`),
the other 5 (`onboarding_context_completed`, `onboarding_style_completed`,
`onboarding_wardrobe_skipped`, `onboarding_completed`, `onboarding_failed`)
fired directly from save-success/skip/error handlers. No duplicate firing
on rerenders.

**Tests.** New `tests/engine/onboarding.test.ts` — real-execution tests
against the pure `src/lib/onboarding.ts` state/readiness logic, plus
structural wiring tests covering all 15 required scenarios (new user
enters onboarding, existing user bypasses it, skippable optionals,
enforced requireds, resume preserves answers and never duplicates the
profile row, honest wardrobe-incomplete state, missing footwear never
fabricates a full outfit, idempotent completion, working Today routing,
recoverable error state, every collected field proven used, all prior
Phase 1–4C tests still green, and no duplicate/stray telemetry). Added
`src/lib/wardrobe.ts`, `src/lib/onboarding.ts`, and
`tests/engine/onboarding.test.ts` to `tsconfig.test.json`.

Full suite: `npm run test:engine` → 8/8 files, 100% pass (including the
new onboarding suite). `npx tsc --noEmit` clean. `npm run lint` clean.
`npm run build` could not complete in this sandbox (backgrounded process is
killed when the shell call that started it ends — a session-isolation
limit of this environment, not a code defect; `tsc`+`lint` are the
verification ceiling reachable here). Manual localhost 390×844 acceptance
is pending the user's own run — see the Phase 4D final report for the
exact checklist.

## Table-privilege fix — migration 0024 (2026-07-11)

Local-only. Fixes a real, confirmed defect found by direct local
`information_schema.role_table_grants` inspection: on `public.profiles`,
`public.wardrobe_items`, and `public.daily_recommendations`, the
`authenticated` role held only `REFERENCES`, `TRIGGER`, and `TRUNCATE` — no
`SELECT`, `INSERT`, `UPDATE`, or `DELETE`. `service_role` also lacked
normal DML on these tables. RLS policies exist and are correctly scoped
(0001, 0007, 0009), but PostgreSQL's table-privilege layer is checked
**before** RLS is ever evaluated — a role with no table-level `SELECT`
grant is rejected at that layer regardless of how permissive its RLS
policies are, making the RLS policies for these three tables unreachable
dead code for `authenticated`, and for DML, for `service_role` too.

A **separate** security issue found in the same inspection: `anon` and
`authenticated` both held `TRUNCATE`, `TRIGGER`, and `REFERENCES` on these
tables. RLS does not gate `TRUNCATE` (it has no row-level concept — it
empties the whole table in one operation), so either role holding it was
unnecessary attack surface for a client-facing REST/RPC role.

**Fix.** New migration `supabase/migrations/0024_app_role_privileges.sql`
(historical migrations 0001–0023 untouched). Explicit revoke-then-grant,
not a diff: `REVOKE ALL ... FROM public/anon/authenticated` on each table,
then exactly the intended grants back:
`public.profiles` → `authenticated`: `SELECT, INSERT, UPDATE` (no
`DELETE` — the only account-deletion path uses the service-role client via
`admin.auth.admin.deleteUser`, cascading by FK, never a client-session
`DELETE`); `public.wardrobe_items` → `authenticated`:
`SELECT, INSERT, UPDATE, DELETE` (matches the existing `wardrobe_owner_all`
"for all" RLS policy — item deletion is a real existing capability);
`public.daily_recommendations` → `authenticated`: `SELECT, INSERT, UPDATE`
(no `DELETE` — 0009 documents "no DELETE policy ⇒ clients cannot delete
recommendations"). `service_role` gets `ALL` on all three tables. `anon`
gets zero table privileges on all three (no grant statement at all — RLS
is not relied on to stop `anon`, the table-privilege layer now does).
Schema `USAGE` on `public` confirmed present for `authenticated` and
`service_role`. No sequence grants needed or added — all three tables use
`id uuid primary key default gen_random_uuid()` (verified by inspecting
column defaults in 0001 and 0009, no `nextval(...)` anywhere).

**SECURITY INVOKER implication.** `confirm_daily_drop_wear` (0023) runs
with the *calling* role's own privileges. Before this migration, a real
`authenticated` caller would have hit this exact table-privilege wall on
its `SELECT ... FOR UPDATE` against `daily_recommendations` and its
`UPDATE` against `wardrobe_items` — meaning 0023's RPC could never have
actually succeeded end-to-end for a real signed-in user until 0024 also
landed. Table grants do not replace RLS or the RPC's own
ownership/exact-set/availability/row-lock validation — all of 0023's
checks remain fully mandatory and unchanged.

**Real execution proof (pglite, SET ROLE-enforced — not just
`information_schema` inspection).** Applied the full migration chain to a
genuine embedded Postgres twice: once through 0023 only, once with 0024
added, using real `SET ROLE authenticated` / `SET ROLE service_role` / `SET
ROLE anon` sessions (not the superuser connection every earlier pglite
check this project has run used) so GRANT/REVOKE is actually enforced, not
bypassed. Confirmed: before 0024, `authenticated` and `service_role` are
genuinely rejected on `SELECT`/`INSERT` against all three tables; after
0024, `authenticated` can `SELECT`/`INSERT`/`UPDATE` `profiles`,
`SELECT`/`INSERT`/`UPDATE`/`DELETE` `wardrobe_items`, and
`SELECT`/`UPDATE` `daily_recommendations`, is rejected on the `DELETE`s
that were never granted, is rejected on `TRUNCATE`, and — the real
payoff — **`confirm_daily_drop_wear` now succeeds end-to-end as a genuine
non-superuser `authenticated` session**, with `last_worn_at` actually
written from the locked recommendation's own `local_date`. `anon` remains
rejected on every table and still cannot call the RPC at all. One
interesting confirmed-by-execution detail: `authenticated`'s table-level
`INSERT` grant on `daily_recommendations` is present (matching the
requested matrix) but is still correctly blocked by RLS, because migration
0010 (pre-existing) removed the client-session `INSERT` policy entirely —
table grants and RLS are independent gates, and this proves both are doing
their job. This pglite verification is sandbox-local scratch tooling (not
part of the shipped migration set) — real Docker-backed proof against the
user's own local Supabase stack is still required before this is
considered fully verified (see Windows commands below).

**New structural test:** `tests/engine/table-privileges.test.ts` (44
assertions) proves: `anon` gets zero grants on all three tables;
`authenticated` gets exactly the intended DML matrix, never
`TRUNCATE`/`TRIGGER`/`REFERENCES`; `service_role` gets `ALL`; RLS is
untouched/still enabled; `confirm_daily_drop_wear` remains `SECURITY
INVOKER` and 0024 never touches its own grants; the RPC's `EXECUTE` grant
is still `authenticated`-only; and the integration script closes its
Postgres connection in a top-level `finally` block. Added to
`tsconfig.test.json`.

**Integration-script resource-cleanup fix.**
`scripts/test-atomic-wear-local.mjs`'s `fatal()` previously called
`process.exit(1)` directly from inside fixture-setup helpers, bypassing
the script's own cleanup entirely whenever it fired after `pgClient`
connected — a real path to the reported libuv `UV_HANDLE_CLOSING`-style
crash, since it could force-exit while a live Postgres socket was still
open. `fatal()` now throws a `FatalError` that always unwinds through one
top-level `try/catch/finally`; the `finally` always attempts to drop the
temporary rollback trigger and always awaits `pgClient.end()`. The
script's final statement is now `process.exitCode = success ? 0 : 1;` — no
`process.exit()` call anywhere in the script's own code, so Node drains
the event loop naturally instead of forcing termination mid-socket-close.
Also requires migrations through 0024 now, not just 0023: the script's own
fixture setup (`admin.from(...).insert(...)`) uses the service-role client,
which needed 0024's `service_role` grants to work in the first place.

**Unchanged:** migrations 0001–0023 (not edited for this fix), RLS
policies and their scope, `confirm_daily_drop_wear`'s own SQL logic,
`SECURITY INVOKER`, the RPC's `EXECUTE` grant.
`supabase/rollbacks/0024_app_role_privileges_down.sql` restores the
confirmed-defective pre-0024 state and is documented as rollback-mechanism
testing only, never for use against real data.

## Phase 4C local-date fix — migration 0023 (2026-07-11)

Local-only. Fixes a real, reproduced defect in `confirm_daily_drop_wear`:
the function set `wardrobe_items.last_worn_at` from
`clock_timestamp()::date` — the **database session's** calendar date — not
the recommendation's **user-local** calendar date
(`daily_recommendations.local_date`). Reproduced with a real embedded
Postgres execution: with `local_date = '2026-01-15'` and a server date of
`2026-07-11`, `last_worn_at` came back as `2026-07-11`, not `2026-01-15`.

**Fix.** The row already locked via `SELECT ... FOR UPDATE` now also
selects `local_date` (no second query, no new race). A new `v_local_date
date` variable is assigned from `v_rec.local_date` right after the
idempotency gate, and the `wardrobe_items` UPDATE now writes
`last_worn_at = v_local_date` instead of `v_now::date`. `worn_at` and
`updated_at` are unchanged — those are genuinely instant-in-time
`timestamptz` columns and correctly used `v_now` (`clock_timestamp()`,
captured once) before and after this fix; only the DATE column was wrong.

**Fail-closed.** `daily_recommendations.local_date` is `NOT NULL` (0009),
so a null value on the locked row should be structurally impossible — but
the function now checks for it explicitly and returns
`status: 'error', reason: 'missing_local_date'` with **zero writes** rather
than silently falling back to the server's date. Verified the `NOT NULL`
constraint is still enforced at the DB level (a direct insert attempt with
`local_date = null` fails at the database, confirming this branch really is
defense-in-depth against something the schema already prevents, not a gap
in the schema itself).

**Unchanged (regression-checked, not just asserted):** RPC signature (same
2 params, same 4-column return shape), row locking on both tables,
idempotency/"already" behavior with a stable `worn_at`, exact
order-independent item-set validation, availability re-check, transaction
rollback on any exception, `SECURITY INVOKER` and the `authenticated`-only
grant. `supabase/rollbacks/0023_atomic_wear_confirmation_down.sql` needed
no changes — the function signature and owned objects are unchanged, only
the body's write logic.

**Real verification performed.** No Docker in this sandbox, so
`npx supabase db reset` / the real local Supabase stack could not be run
here. Instead, the fixed function was executed for real against an
embedded Postgres engine (`@electric-sql/pglite`) after applying the full
`0001`→`0023` chain: confirmed `last_worn_at` now equals the deliberately
different `local_date` (`2026-01-15`), confirmed the `NOT NULL` constraint,
and re-confirmed duplicate-call stability and forced-trigger rollback both
still work unchanged. This is genuine SQL execution, not static-only
reasoning — but it is still not the user's real Docker-backed local
Supabase stack. `scripts/test-atomic-wear-local.mjs` (`npm run
test:atomic-wear:local`) — which does use the real stack — has its Section
H updated to assert `last_worn_at === local_date` as the now-expected
outcome; this must still be run against a real local Supabase stack to
close out the release gate.

**Files changed:** `supabase/migrations/0023_atomic_wear_confirmation.sql`
(fixed), `tests/engine/atomic-wear-confirmation.test.ts` (updated: proves
the old bug pattern is gone, the new `v_local_date` path is present, the
null-local_date fail-closed branch is present and writes nothing, and all
prior concurrency/rollback/security assertions still hold),
`scripts/test-atomic-wear-local.mjs` (Section H updated to expect the fix
to hold, plus a new assertion that the preserved date is deliberately
non-coincidental), this CHANGELOG entry. No Phase 4A/4B/4D files touched.

## Migration-chain repair — real 0001 baseline + rollback relocation (2026-07-11)

Local-only. Triggered by a verified local failure: running the forward
migration chain from scratch against a clean database failed applying
`0002_auto_tagging.sql` because `public.wardrobe_items` did not exist —
the chain had no `0001` and assumed `supabase/schema.sql` (a hand-run,
never-migrated file) as an implicit baseline.

**Root cause.** `schema.sql` was the original source of truth, run by hand
in the Supabase SQL editor, and was never split into the migration chain.
Over time it silently absorbed changes that were *also* shipped later as
forward migrations `0002`–`0004`: the auto-tagging columns on
`wardrobe_items` (+ the `ai_tag_status` enum type), the `'dinner_date'`
value of `occasion_type`, and the AI-outfit-draft columns on
`outfit_suggestions`. That overlap is exactly why a literal copy of
`schema.sql` into `0001` was refused — it would have made `0002`–`0004`
either error (duplicate column) or silently no-op, masking real drift
between the two paths.

**Overlap map (see `0001_initial_schema.sql` header comment for the full
version):**
- `0002_auto_tagging.sql` owns the `ai_tag_status` enum type and 9
  `wardrobe_items` columns (`ai_tag_status`, `ai_confidence`,
  `user_facing_name`, `sub_category`, `style`, `secondary_colors`,
  `ethnic_western_fusion`, `auto_tagged_at`, `user_corrected_tags`).
- `0003_occasions.sql` owns the `'dinner_date'` value of `occasion_type`
  (added via `ALTER TYPE ... ADD VALUE`); `0001`'s enum literal reverts to
  the original 8-value list.
- `0004_ai_outfit_drafts.sql` owns 4 `outfit_suggestions` columns
  (`avoid_note`, `missing_item_suggestion`, `ai_confidence`, `source`).
- Everything else in `schema.sql` (profiles, outfit_requests,
  `outfit_suggestions.{approved_by,approved_at}`, feedback, worn_history,
  `is_admin()`, `handle_new_user()`, all RLS policies, the `wardrobe`
  storage bucket + policies) has no overlapping forward migration and was
  reproduced in `0001` unchanged.
- Migrations `0005` onward introduce nothing that also appears in
  `schema.sql` — confirmed by inspection, not assumed.

**Rollback scripts relocated.** `*_down.sql` files are rollback/down
migrations, not forward migrations — the Supabase CLI applies every `.sql`
file under `supabase/migrations/` in order during `db reset`/`db push`, so
leaving down-scripts there meant they were unintentionally part of the
"up" chain. Moved (content byte-identical, verified via diff against the
prior committed blobs) to `supabase/rollbacks/` (not executed by the CLI):
`0020_engine_v2_schema_down.sql`, `0021_laundry_availability_down.sql`,
`0022_swap_trust_down.sql`, `0023_atomic_wear_confirmation_down.sql`.

**Production warning — read before touching the hosted project.**
`0001_initial_schema.sql` is for reproducible **local/clean databases
only**. The hosted WearWise Supabase project already has this schema and
migrations through `0022` applied via the original `schema.sql` +
forward-migrations path, and its Supabase migration-history table does
**not** contain a `0001` entry. Do **not** run `supabase link` or
`supabase db push`/`db reset --linked` against it with this new chain —
that would either error on already-existing objects or, if forced, is the
wrong tool for reconciling history. Production migration-history
reconciliation (marking `0001`–`0004` as already-applied via
`supabase migration repair` or equivalent, so the CLI's local history
matches reality) must be handled as its own deliberate, reviewed step
**before** `0023` can ever be applied there. No hosted command was run as
part of this repair — see the migration-chain-repair report for the exact
local-only verification performed.

**Files changed:** `supabase/migrations/0001_initial_schema.sql` (new),
`supabase/rollbacks/0020_engine_v2_schema_down.sql`,
`0021_laundry_availability_down.sql`, `0022_swap_trust_down.sql`,
`0023_atomic_wear_confirmation_down.sql` (moved, not edited), this
CHANGELOG entry and two path references updated elsewhere in this file.
No Phase 4 feature files touched.

## Phase 4C hotfix — Atomic Wear Confirmation (2026-07-11)

Local-only, prompted by a read-only transactional-integrity audit that found
the Phase 4C wear-confirmation route (`/api/daily-drop/wear`) was a RELEASE
BLOCKER: three independent PostgREST calls with no shared transaction, no
row locking, and no compare-and-set. Concretely, the audit proved: two
concurrent requests could both pass the application-level idempotency check;
`worn_at` could be silently overwritten by whichever request committed last;
the `wardrobe_items.last_worn_at` write's error was never checked, so a
partial failure (recommendation confirmed, wardrobe write silently dropped)
was permanent and unrepairable, because any retry short-circuited to
`"already"` before ever reaching the dangling write; and the availability
re-check ran outside any write-guarding transaction (TOCTOU race).

**Fix: the entire wear-confirmation contract moved into ONE PostgreSQL
function, called through ONE RPC, executed in ONE database transaction.**
Postgres itself is now the concurrency and atomicity boundary — not
application code, not client-side busy flags, not sequential structural
tests. (Those were, correctly, called out as insufficient evidence in the
audit — this fix does not repeat that mistake in its own verification: see
Testing honesty below.)

**Schema verified before writing SQL (not assumed):** `daily_recommendations
.selected_item_ids` is `uuid[]`, `.status`/`.worn_at`/`.updated_at` are
`text`(checked)/`timestamptz`/`timestamptz`; `wardrobe_items.last_worn_at` is
`date` (not timestamptz), `.availability_status` is `text` with a CHECK
constraint allowing exactly `'available' | 'in_wash' | 'unavailable' |
'archived'` (migrations 0007 + 0021).

**New migration**
- `supabase/migrations/0023_atomic_wear_confirmation.sql` (+ `supabase/rollbacks/0023_atomic_wear_confirmation_down.sql`) —
  defines `public.confirm_daily_drop_wear(p_recommendation_id uuid,
  p_item_ids uuid[])`. Full transaction, in order: resolve `auth.uid()` and
  reject unauthenticated → `SELECT ... FOR UPDATE` locks the
  `daily_recommendations` row (the true serialization point) → idempotency
  gate on the now-locked row (`status = 'worn'` → return `"already"` with the
  ORIGINAL `worn_at`, zero writes) → reject null/duplicate submitted IDs →
  exact order-independent set match against `selected_item_ids` (any
  mismatch → `"stale"`, zero writes) → `FOR UPDATE` locks the referenced
  `wardrobe_items` rows in deterministic `ORDER BY id` (deadlock-safe) →
  existence/ownership check → availability check (`<> 'available'` →
  `"stale"`, zero writes) → one shared `clock_timestamp()` (`v_now`) drives
  BOTH core writes → `wardrobe_items.last_worn_at = v_now::date` → `daily_
  recommendations.status='worn', worn_at=v_now, updated_at=v_now` → return
  `"confirmed"` with the stored `v_now`. No `EXCEPTION WHEN` block anywhere
  in the function body, so any error at any point rolls back every write
  made so far in the same call — there is no code path that commits one core
  write without the other.
- **Security: `SECURITY INVOKER`, not `DEFINER`.** Both tables already carry
  owner-scoped RLS policies (`dailyrec_update_own`, `wardrobe_owner_all`)
  that grant the authenticated owner exactly the access this function needs
  — INVOKER runs with the caller's own privileges, so RLS applies exactly as
  if the client ran these statements directly. `DEFINER` was deliberately
  NOT used: there is no cross-user aggregation and no reason for this
  function to run as its owner rather than the caller. `search_path` is
  still pinned (`public, pg_temp`) as defense in depth. `auth.uid()` is read
  internally — there is no `user_id` parameter, so the function can never be
  pointed at another user's data. `EXECUTE` is revoked from `PUBLIC` and
  `anon`; granted only to `authenticated`.
- Function name is `confirm_daily_drop_wear` (not `..._worn`) — deliberately
  chosen to avoid colliding with the retired `daily_drop_worn` telemetry
  string that the repo-wide retired-string scan checks for.

**API route rewritten**
- `src/app/api/daily-drop/wear/route.ts` — now a thin wrapper: authenticate,
  validate shape, call `supabase.rpc("confirm_daily_drop_wear", ...)`
  exactly once, map the result, log telemetry AFTER the result is known. The
  two independent `daily_recommendations`/`wardrobe_items` `.update()` calls
  are gone entirely. `if (error)` from the RPC call is checked before
  anything else and always fails closed — the switch over `rpcStatus` has no
  case that can return success for an unrecognized or errored result
  (`default` case returns `"unexpected_rpc_result"`, never `"ok"`).

**Client: laundry-failure visibility fixed**
- `src/components/wearwise/PostWearSheet.tsx` — new optional `error` prop;
  renders a visible inline error banner, the Done button relabels to "Try
  again", and a new "Skip for now" action lets the user explicitly move on.
  No change to the Phase 2 disposition logic itself.
- `src/app/(app)/dashboard/daily-drop-card.tsx` — `persistPostWear()` now
  checks the laundry route's actual response (`!res.ok || json.status !==
  "ok"` throws) instead of firing-and-forgetting. On failure it no longer
  unconditionally closes the sheet or calls `router.refresh()` in a
  `finally` block — the sheet stays open, the user's chosen dispositions
  survive untouched (they live in `PostWearSheet`'s own state, which never
  unmounts), and `postWearError` drives the visible message. Wear
  confirmation is never rolled back because of a laundry failure — they are,
  by design, separate transactions (laundry remains "optional" per the
  product contract; only its *visibility on failure* was the defect).
  `wearThis()`/`confirmWorn()`'s branching over `"ok"/"already"/"stale"`
  response statuses was already correct from the prior Phase 4C session and
  needed no functional change — the new RPC-backed route returns the same
  four-status shape the client already handled.

**Files changed**
- `supabase/migrations/0023_atomic_wear_confirmation.sql` — new.
- `supabase/rollbacks/0023_atomic_wear_confirmation_down.sql` — new (moved out of `supabase/migrations/` in the migration-chain repair; see top-of-file entry).
- `src/app/api/daily-drop/wear/route.ts` — rewritten (RPC wrapper).
- `src/components/wearwise/PostWearSheet.tsx` — added `error` prop + Skip action.
- `src/app/(app)/dashboard/daily-drop-card.tsx` — `persistPostWear()` rewritten for honest failure; doc comments updated for the new RPC path.
- `tests/engine/postwear-wiring.test.ts` — section 1 rewritten for the new thin route; new section 5 for laundry-failure visibility.
- `tests/engine/atomic-wear-confirmation.test.ts` — new, 33 assertions over the migration SQL text.
- `tsconfig.test.json` — added the new test file.

**Testing honesty — read before trusting this fix**
`npm run test:engine` (363 assertions, 10 suites, all green), `npx tsc
--noEmit` (clean), `npm run lint` (clean) all pass. **These are static/
structural checks. They prove the SQL and TypeScript are shaped correctly.
They do NOT prove concurrent-request behavior or transactional rollback —
that requires a real running Postgres instance.** No local/dev database was
available in this sandbox (no `postgres`/`docker`/`supabase` binary present,
no package-install permission, and the only reachable Supabase project via
MCP could not be confirmed as a disposable dev environment — it was treated
as production and was NOT touched: migration 0023 was not applied anywhere
this session). The following remain REQUIRED before this ships, and were
NOT executed:
- Two concurrent `confirm_daily_drop_wear` RPC calls against the same
  recommendation, verifying exactly one returns `"confirmed"` and one
  returns `"already"`, with a single stable `worn_at`.
- The same test verifying `wardrobe_items.last_worn_at` was written exactly
  once and no item outside the outfit changed.
- A forced exception injected after the `wardrobe_items` UPDATE, verifying
  neither table's write persisted (true rollback proof).
See IDEAS.md for this as a genuinely deferred, release-gating item.

No commit, push, deploy, or migration apply (to any environment) this
session.

## Phase 4C — Wore It flow (2026-07-10)

Local-only. Rebuilds "Wore It" as a two-step, server-validated confirmation
flow: **Wear this → confirm (exact owned items) → confirm worn → optional
laundry disposition → Done.** No commit, push, deploy, or migration this
session.

**Root defect fixed:** the old `wearThis()` wrote `daily_recommendations` and
`wardrobe_items` directly from the client with zero server-side validation —
no ownership re-check beyond RLS, no staleness re-check, no idempotency
guard. A double-tap, a stale cached recommendation, or a race with a swap in
another tab could silently write an incorrect wear record. Phase 4C moves
the write behind a single new server route with the same
ownership/staleness/idempotency contract already established by
`/api/daily-drop/swap`.

**Existing behavior reused, not rewritten:**
- `PostWearSheet.tsx`'s laundry-disposition step (smart defaults via
  `washDisposition()`, bulk "All to wardrobe"/"All to wash", per-item chips,
  the `/api/wardrobe/laundry` `postwear` action) — unchanged apart from
  telemetry renames.
- "Ask me less" reuses the existing `ASK_ME_LESS_THRESHOLD` /
  `postwear_prompt_dismissals` / `postwear_sheet_enabled` contract in
  `/api/wardrobe/laundry`'s `ask_me_less` action — no new eligibility model.
- The Phase 2 laundry engine tests (`tests/engine/laundry.test.ts`, 28
  assertions) were not touched and remain green.

**New server-validated write path**
- `src/app/api/daily-drop/wear/route.ts` (new) — `POST { recommendationId,
  itemIds }` → `{ status: "ok"|"already"|"stale"|"error", ... }`. Mirrors the
  swap route's pattern: auth → ownership-scoped fetch (`.eq("id",
  recommendationId).eq("user_id", user.id)`) → **idempotency gate checked
  first** (`rec.status === "worn"` → `"already"`, no write) → submitted
  `itemIds` must equal the recommendation's current `selected_item_ids`
  (mismatch → `"stale"`, no write) → apply-time re-check via
  `validateOutfitCurrent` (fail → `"stale"`) → scoped update
  (`daily_recommendations` + `wardrobe_items`, both filtered by
  `user_id`) → `logAppEvent("daily_drop_wear_confirmed", ...)`.

**New UI**
- `src/components/wearwise/WearConfirmSheet.tsx` (new) — step 1. Shows the
  exact owned items already rendered on the Today card (never re-derived or
  fabricated). One primary button whose action is state-driven: confirm
  (idle/error → retry) / refresh (stale) / continue (already, duplicate-safe).
  Disabled + non-dismissable while a request is in flight.
- `src/app/(app)/dashboard/daily-drop-card.tsx` — `wearThis()` now only opens
  the confirm sheet (no write, no fetch). New `confirmWorn()` calls
  `/api/daily-drop/wear` and drives the state machine (idle → submitting →
  ok/already/stale/error), opening the existing `PostWearSheet` on success
  when `postwearEnabled` is true. Removed the dead `saving` state (the
  confirm sheet now owns its own submitting indicator).

**Canonical telemetry (Phase 4C)** — one event per funnel stage:

| Stage | Event | Note |
|---|---|---|
| Wear this tapped | `wear_this_tapped` | unchanged (Phase 4B) |
| Confirm sheet opens | *(none — same instant as `wear_this_tapped`)* | no separate open event needed |
| Wear confirmed | `wear_confirmed` | **consolidated from `daily_drop_worn`** — same stage, proven: both fired at the exact moment the write succeeded |
| Laundry sheet opens | `postwear_sheet_opened` | renamed from `postwear_sheet_shown` |
| Laundry choice changed | `laundry_status_selected` | new — per-item chip taps and bulk actions |
| Laundry completed | `postwear_completed` | renamed from `postwear_sheet_completed` |
| Postwear flow failed | `postwear_failed` | new — fires for both the confirm-write failure and the laundry-persist failure, tagged `stage: "confirm"|"laundry"` |
| Ask me less shown | `ask_me_less_shown` | new — fires whenever the sheet (and therefore the button) is shown; eligibility is the existing `postwear_sheet_enabled` gate, nothing new |
| Ask me less enabled | `ask_me_less_enabled` | renamed from `ask_me_less_activated` |

Retired (repo-wide, proven absent): `daily_drop_worn`, `postwear_sheet_shown`,
`ask_me_less_activated`.

**Files changed**
- `src/app/api/daily-drop/wear/route.ts` — new.
- `src/components/wearwise/WearConfirmSheet.tsx` — new.
- `src/components/wearwise/PostWearSheet.tsx` — telemetry renames + additions
  only (`postwear_sheet_opened`, `ask_me_less_shown`, `ask_me_less_enabled`,
  `laundry_status_selected`); disposition logic untouched.
- `src/app/(app)/dashboard/daily-drop-card.tsx` — `wearThis()`/`confirmWorn()`
  rewrite (write moved server-side); `persistPostWear()` renamed event +
  failure telemetry; `daily_drop_worn` removed; renders `WearConfirmSheet`.
- `tests/engine/today-v2.test.ts` — section 9 updated for the
  `daily_drop_worn` → `wear_confirmed` consolidation; retired-string list
  extended with the three Phase 4C legacy names.
- `tests/engine/postwear-wiring.test.ts` — new, 32 assertions covering
  ownership/idempotency/staleness in the route, the write moving out of
  `wearThis()`, the full canonical/retired telemetry contract, and the
  confirm sheet's required states.
- `tsconfig.test.json` — added `tests/engine/postwear-wiring.test.ts`.

**Verification**
- `npm run test:engine` — 320 assertions across 9 suites, all green (82 in
  `today-v2.test.ts`; 32 new in `postwear-wiring.test.ts`; Phase 2's
  `laundry.test.ts` unchanged at 28/28).
- `npx tsc --noEmit` — clean. `npm run lint` — clean.
- `npm run build` — did not complete inside the sandbox's ~45s call budget
  (confirmed recurring sandbox limitation, same as every prior phase); not a
  reported pass. Requires the CEO's local `npm run build` + manual localhost
  check before this ships (Local-First Phase Gate).

No commit, push, deploy, or migration this session.

## Phase 4B follow-up — Telemetry deduplication fix (2026-07-10)

Local-only fix, prompted by a read-only telemetry audit that found four user
gestures firing 2-3 events each (old name + new required name coexisting, or
in one case a third name from a second component). No commit, push, deploy,
or migration this session; Phase 4C untouched.

**Canonical event contract established — one event per gesture:**

| Gesture | Before (duplicate) | After (canonical) |
|---|---|---|
| Open swap sheet | `daily_drop_swap_started` + `swap_opened` (card) + `swap_sheet_opened` (sheet mount) — 3 events | `swap_opened` only |
| Tap Another option | `daily_drop_another_option_clicked` + `another_option_tapped` | `another_option_tapped` only |
| Expand Why This Works | `why_expanded` + `why_this_works_opened` | `why_this_works_opened` only |
| Retry (constrained) | `daily_drop_prepare_clicked` + `today_retry_tapped` | `today_retry_tapped` only (`daily_drop_prepare_result` outcome event unchanged) |
| Choose a swap slot | `swap_slot_selected` + `swap_requested` (empty props) | `swap_requested` only, now carrying `{ slot }` |

Untouched — confirmed genuinely distinct intent/outcome pairs, not
duplicates: `wear_this_tapped`→`daily_drop_worn`, `save_look_tapped`→
`look_saved`/`paywall_hit`. `today_viewed` / `today_constrained_viewed`
firing semantics unchanged (see below).

**Files changed**
- `src/app/(app)/dashboard/daily-drop-card.tsx` — `openSwap()` fires only
  `swap_opened`; `anotherOption()` fires only `another_option_tapped`.
- `src/app/(app)/dashboard/prepare-drop-button.tsx` — `prepare()` fires only
  `today_retry_tapped`; `daily_drop_prepare_result` (the outcome event)
  unchanged.
- `src/components/wearwise/SwapSheet.tsx` — the `[open]`-keyed mount effect
  no longer fires any event (was `swap_sheet_opened`); `loadCandidates()`
  fires one `swap_requested` call carrying `{ slot }` (was two calls:
  `swap_slot_selected` + `swap_requested({})`).
- `src/components/wearwise/WhyThisWorks.tsx` — the expand handler fires only
  `why_this_works_opened`.
- `src/components/wearwise/ViewBeacon.tsx` — no functional change (its
  `[event]`-only effect dependency already satisfied "fire once per route
  mount, don't re-fire on refresh"). Doc comment rewritten to explicitly
  record the two different usage shapes: `today_viewed` (unconditional,
  constant event name, fires exactly once per route mount, `props` describe
  only the initial rendered state and are not kept in sync with later
  in-place state changes — intentional, not a bug) vs
  `today_constrained_viewed` (conditional on specific branches, correctly
  re-fires on a genuine transition into a constrained state). Also documents
  the React StrictMode dev-only double-invoke caveat and that no
  sessionStorage/localStorage/global dedup was added (none needed — component
  identity + the dependency array is the whole mechanism).
- `tests/engine/swap-wiring.test.ts` — one pre-existing assertion re-anchored
  from the now-removed `track("swap_sheet_opened"` string to
  `setView("slots")` (same protective intent: no `fetch()` in the mount
  effect); one assertion added confirming the mount effect fires no
  telemetry at all.
- `tests/engine/today-v2.test.ts` — replaced the old "telemetry wired" section
  with a canonical-contract section (23 new assertions) covering all 11
  required tests, plus a recursive scan of every `.ts/.tsx/.js/.jsx` file
  under `src/` proving all six retired strings are gone repo-wide.
- Doc comments in `daily-drop-card.tsx`, `prepare-drop-button.tsx`,
  `SwapSheet.tsx`, and `WhyThisWorks.tsx` that explained the fix were
  reworded to reference "the old duplicate event" / CHANGELOG.md instead of
  spelling out the retired identifier literally — so the repo-wide retired-
  string scan (and any future grep) proves genuine absence, not just
  absence-from-`track()`-calls.

**Verification**
- `npm run test:engine` — 287 assertions across 8 suites, all green (81 in
  `today-v2.test.ts`, up from 58; 20 in `swap-wiring.test.ts`, up from 19;
  206 unchanged elsewhere).
- `npx tsc --noEmit` — clean. `npm run lint` — clean.
- Repo-wide `grep -rn` for all six retired strings across `src/` — zero
  matches, confirmed both via the automated recursive test and a manual
  sweep.
- `npm run build` — did not complete inside the sandbox's call budget
  (confirmed again, same known limitation noted in the Phase 4A/4B entries).
  Production build remains a local step.


## Phase 4B — Today v2 (2026-07-10)

Built on the Phase 4A shell primitives (Screen/ContextStrip/ActionRow/
ScrollAudit). Local-only: no commit, push, deploy, or migration this
session; Phase 4C (post-wear flow) and later are untouched.

**Required hierarchy, now literal on screen:** compact header -> context
strip (date/weather/occasion) -> one Today's Drop hero -> primary action
(Wear this) -> secondary actions (Swap one thing / Another option / Save
look) -> Why This Works -> one compact supporting insight -> bottom nav
(via `<Screen>`, replacing the page's standalone `<BottomNav/>`).

**Files changed**
- `src/app/(app)/dashboard/page.tsx` — rewrapped in `<Screen>` +
  `<ContextStrip>`; compact single-row header; removed the page-level quick-
  stats grid, recent-requests list, last-worn line, and the wardrobe-wide
  `buildDailyInsight()`/`<DailyInsight>` (consolidated to the per-drop
  `dailyInsight`, see IDEAS.md). `ensureTodayDrop`'s single-write contract
  (Phase 3 hotfix 4) is byte-for-byte unchanged — only 3 new fields
  (`missingSlots`, `confidence`, `isDualPick`) were appended to the returned
  view object, sourced from data the row already stored. Added
  `today_viewed` / `today_constrained_viewed` telemetry via `ViewBeacon`.
- `src/app/(app)/dashboard/daily-drop-card.tsx` — reordered to hero -> primary
  action -> secondary actions -> Why This Works -> insight; removed the
  free-text trust-signal paragraph (weather/repeat/"uses available clothes
  only") and the header occasion chip (now in the context strip); added the
  honest partial-outfit badge (state C) and a dual-pick caption (state B/C).
  `openSwap`/`anotherOption` function names, their exact wiring, and every
  button label are unchanged — swap-wiring.test.ts passes untouched.
- `src/app/(app)/dashboard/loading.tsx` — rewritten to mirror the new
  hierarchy exactly (state A): header, context-strip chips, one hero block,
  one action row, Why-This-Works bar, one insight line. No fake copy.
- `src/app/(app)/dashboard/error.tsx` — new Today-specific error boundary
  (state F): human-readable message, retry button, no raw exception, fires
  `today_retry_tapped`.
- `src/app/(app)/dashboard/prepare-drop-button.tsx` — added
  `today_retry_tapped` alongside the existing `daily_drop_prepare_clicked`.
- `src/components/wearwise/SaveLookButton.tsx` — added `save_look_tapped` at
  tap-time and a visible error line on failure (the existing `state !==
  "idle"` guard already prevented duplicate rapid submissions).
- `src/components/wearwise/WhyThisWorks.tsx` — added `why_this_works_opened`
  alongside the existing `why_expanded`.
- `src/components/wearwise/ViewBeacon.tsx` — new: fires a `track()` event
  once per Server-Component branch, used for the two required `*_viewed`
  events. Effect depends only on the stable `event` string, so a
  `router.refresh()` that keeps the same branch does not re-fire it.
- `src/components/shell/ActionRow.tsx` — added an optional `sticky` prop
  (default `true`, unchanged for any future pinned usage); Today passes
  `sticky={false}` since its actions sit in normal document flow between the
  hero and Why This Works, per the required ordering.

**State handling (A-F)**
- A Loading — `dashboard/loading.tsx` skeleton, no layout jump, no fake data.
- B Complete — hero + Why This Works (engine-grounded) + insight.
- C Partial — `missingSlots` (currently only ever `["Shoes"]`) computed
  server-side from which canonical slots survived into the final item list;
  never fabricated; renders an amber (never red) badge naming the gap plainly.
- D Constrained — the existing "Build your wardrobe first" / generic failed
  card, now with `today_constrained_viewed` telemetry and unchanged retry.
- E Stale — untouched: Phase 3 hotfix 4's bounded regenerate-once contract.
- F Error — new `dashboard/error.tsx` boundary.

**Tests**
- `tests/engine/today-v2.test.ts` — 58 new structural assertions covering
  all 10 required tests (single hero, no legacy strings, actions-once via
  onClick-handler counts, swap/another-option separation, states A-F
  represented, honest missing-slot copy, `validateOutfitCurrent` still
  gating, retry present for both recoverable-failure paths, bottom nav via
  `<Screen>`/`<TabBar>`, and every required telemetry event name wired).
- `npm run test:engine` — 263 assertions across 8 suites, all green (58 new
  + 205 pre-existing, including dashboard-wiring and swap-wiring unchanged).
- `npx tsc --noEmit` — clean. `npm run lint` — clean. No raw hex in any
  touched file (grep-verified).
- `npm run build` — did not complete inside the sandbox's call budget
  (confirmed still running after 42s); this matches the known sandbox
  limitation from Phase 4A/handbook §9 Local-First Gate. Production build
  and the manual localhost check at 390×844 remain the CEO's local step.


## Phase 4A — Shared shell foundation + nav relabel (2026-07-10)

Foundation-only session (handoff `PHASE-4A-HANDOFF.md`). No pages wired, no
migrations, no commit/push/deploy — local build for manual localhost review.

**New library code**
- `src/lib/shell/tabs.ts` (pure) — `APP_TABS` (5 tabs, IA locked by CEO
  2026-07-10: Today `/dashboard` · Wardrobe `/wardrobe` · Style Me
  `/occasion/new` · Plan `/plan` · You `/profile`) + `isTabActive(pathname, tab)`.
  Relabel only — every route is a pre-existing stable route; `/lookbook` leaves
  the tab bar but the route stays reachable (deep links preserved).
- `src/lib/shell/scroll-audit.ts` (pure) — `SCROLL_BUDGET_FACTOR = 1.3` +
  `exceedsViewport(contentHeight, viewportHeight, factor)` backing the
  One-Screen Rule (§3.2).

**New shell components** (`src/components/shell/`)
- `TabBar.tsx` — the real bottom tab bar: renders `APP_TABS` via
  `isTabActive`, lucide icon map (today→Home, wardrobe→Shirt,
  styleme→Sparkles, plan→CalendarDays, you→User), active = plum + heavier
  stroke, tap targets ≥44px, width matches the app shell (max-w-440px).
- `Screen.tsx` + `ContextStrip.tsx` + `AnswerCard.tsx` + `ActionRow.tsx` — the
  fixed anatomy (§4.3): context strip (top) → scrollable answer region
  (`AnswerCard`, the only scrolling zone) → action row (thumb zone) → tab bar.
  Slot-based API (`<Screen contextStrip={..} actionRow={..}>{children}</Screen>`),
  token-only styling, 380px baseline. **Not wired into any real page yet** —
  that's Phase 4B.
- `ScrollAudit.tsx` — dev-only, mounted inside `Screen`; `ResizeObserver` +
  `exceedsViewport` warns in console when a screen exceeds the 1.3x viewport
  budget; hard no-op when `NODE_ENV === "production"`.

**In-place edit**
- `src/components/nav/bottom-nav.tsx` now re-exports `TabBar as BottomNav`.
  Public API (name + import path) unchanged, so all 7 consuming pages
  (dashboard, lookbook, outfits/[requestId], plan, profile, upgrade, wardrobe)
  needed zero edits and zero churn.

**Tests**
- `tests/engine/shell.test.ts` — 23 hand-rolled assertions: 5-tab order/labels/
  hrefs, key-uniqueness, `isTabActive` exact/nested/no-cross-activation cases
  (incl. Style Me active on `/occasion/new/xyz`, Plan NOT active on
  `/planning`), `exceedsViewport` boundary cases. Added to `tsconfig.test.json`
  `include` alongside the two new pure lib files.

**Verification**
- `npm run test:engine` — 205 assertions across 7 suites, all green (23 new +
  182 pre-existing: golden, laundry, swap, swap-wiring, validity,
  dashboard-wiring).
- `npm run typecheck` — clean. `npm run lint` — clean. No raw hex in any new
  file (grep-verified). No migrations. Repo ground truth matched the handoff
  exactly (bottom-nav import sites, migrations ending at 0022, tokens,
  `(app)/layout.tsx` — nothing to flag).


## Phase 3 hotfix 4 — Dashboard single-write recommendation contract (2026-07-10)

Local-only correctness fix (no schema/prod changes). Follow-up to the single-hero
dashboard audit: `ensureTodayDrop` could, in a TOCTOU availability race, perform
BOTH a create (missing row) AND a regeneration (stale check) in the same request.

Fix — `src/app/(app)/dashboard/page.tsx` `ensureTodayDrop`:
- A request now performs **at most one write-producing action**: exactly one
  create (missing row, `if (!rec)`) XOR one regenerate (pre-existing stale row,
  `else if`). The two are mutually exclusive branches, and an explicit
  `writeAttempted` flag + a `source: "existing" | "created" | "regenerated"`
  path variable make the contract explicit and guard against future refactors.
- Regeneration is reachable ONLY on the pre-existing-row branch — never after a
  create — so a create and a regenerate can never both run in one request.
- A **final `validateOutfitCurrent` always runs** on the selected IDs for
  existing, created, AND regenerated results (validation is never skipped for a
  freshly created row). If a created/regenerated outfit lost the create/validate
  race and is stale, the request **fails closed** to the honest constrained/retry
  state — it does NOT regenerate a second time.
- Preserved: `ignoreOptIn` bypasses only creation eligibility (no notifications);
  atomic upsert on `(user_id, local_date)` (backed by the live
  `daily_recommendations_user_date_unique` constraint); no legacy Best Pick
  fallback; exactly one Today's Drop hero; no stale/in-wash item can render.

Tests: `tests/engine/dashboard-wiring.test.ts` extended to 24 assertions (8 new
single-write guards: exactly one create + one regenerate, mutual exclusion,
`writeAttempted`, final-validation-always, created-stale-fails-closed). `tsc`
clean · ESLint clean · engine suite 182 assertions green. `next build` bundling
still can't complete inside the sandbox (webpack over the mount > shell time cap)
— verify locally.

## Phase 3 hotfix 3 — Single-hero Today dashboard (2026-07-10)

Local-only render-contract fix (no schema/prod changes). Root cause of two
divergent broken states:
- **Localhost showed two competing heroes:** the dashboard rendered the legacy
  Best Pick section UNCONDITIONALLY (`{bestPick ? <RealBestPick/> : <SampleBestPick/>}`)
  in addition to the new Today's Drop card, so a duplicate legacy card rendered
  underneath Today's Drop.
- **Production could fall back to legacy-only:** `loadTodayDrop()` only READ
  today's `daily_recommendations` row and returned `null` when none existed (it
  depended on the cron/manual prepare) and was gated on the notification opt-in;
  with no row, `DailyDropCard` was absent while the unconditional Best Pick still
  rendered — legacy-only.

Fix:
- The **dashboard now uses one authoritative Today's Drop path**: `ensureTodayDrop()`
  (get-or-create + validate). If today's row is absent it creates ONE from the
  current available wardrobe (idempotent upsert on `(user_id, local_date)`; one
  attempt per request; bypasses the notification opt-in via `prepareDailyDrop`'s
  new `ignoreOptIn`). Stale drops regenerate once from valid inventory. When no
  valid drop can be formed it shows one honest constrained state (or build-wardrobe
  onboarding) with a Retry — never the legacy Best Pick.
- The **legacy Best Pick dashboard fallback is removed**: `RealBestPick`,
  `SampleBestPick`, `buildBestPick`, the approved-`outfit_suggestions` query,
  "Best Pick Today", and "View full look & alternatives" are all gone from the
  dashboard render path. Exactly one `<DailyDropCard>` renders.
- The authenticated dashboard stays `export const dynamic = "force-dynamic"`
  (not globally cached), so laundry/swap/option/new-drop changes reflect on load.
- Different accounts may correctly receive different outfits/wardrobes/streaks/
  weather/titles — release comparison is structural, not content-identical.

Tests: new `tests/engine/dashboard-wiring.test.ts` (16 structural guards: single
`DailyDropCard`, no RealBestPick/SampleBestPick/buildBestPick, no "Best Pick
Today"/"View full look", ensureTodayDrop get-or-create with `ignoreOptIn`, stale
regenerate-once, honest constrained state, `force-dynamic`, no legacy suggestions
query). `tsc` clean · ESLint clean · engine suite 174 assertions green (incl. 16
dashboard + 19 swap-wiring). `next build` bundling still can't complete inside the
sandbox (webpack over the mount > shell time cap) — verify locally.

## Phase 3 hotfix 2 — Swap UI: slot-first flow + true button/handler separation (2026-07-10)

Local-only UI fix (no schema/prod changes). Reported: "Swap one thing" did
nothing / behaved like "Another option"; the slot-first flow wasn't visible.

Root cause (three compounding issues):
1. The **legacy Best-Pick card** (`RealBestPick`, dashboard/page.tsx) rendered
   "Swap one item" and "Another option" as `<Link>`s to `/outfits` — both just
   navigated to a full-look list, so they looked identical and never ran a real
   swap. Removed (Wear this + "View full look" remain); the Daily Drop card is
   the single, correct swap surface.
2. The **swap sheet mixed mood chips + a "New mood" full re-theme** into the
   same menu as the item chips, so it wasn't a clean slot picker and the
   full-outfit action sat inside the single-item swap sheet.
3. **"Another option" reused the swap sheet** (`initialAction="option"`).

Fix:
- **`SwapSheet.tsx` rebuilt as SLOT-FIRST, single-item ONLY.** First screen asks
  only "What do you want to swap?" ("The rest of your outfit will stay the
  same.") and shows just the slots present. No candidates/full look are fetched
  before a slot is chosen. Choosing a slot fetches replacements for that slot
  (all other items locked, shown as "Keeping …"); applying changes exactly one
  item; result row = Keep it / Try another / Put back. Mood chips, "New mood",
  and `initialAction` removed. Stale outfit → refresh + close honestly.
- **`daily-drop-card.tsx`:** "Another option" is now a completely separate
  handler (`anotherOption`) that calls only `/api/daily-drop/another-option`
  with its own loading state + message, and never opens the sheet or calls the
  single-slot route. "Swap one thing" opens the sheet only. Both triggers set
  `type="button"`; distinct `onClick`s; correct labels.

Tests: new `tests/engine/swap-wiring.test.ts` (19 structural regression checks:
slot-first sheet, no full-outfit/mood route in the sheet, separate handlers,
type=button, distinct loading state, correct labels). `tsc` clean · ESLint clean
· engine suite 158 assertions green. `next build` bundling still can't complete
inside the sandbox (webpack over the mount > shell time cap) — verify locally.

## Phase 3 hotfix — Stale-outfit render blocker + slot-first swap + explainability (2026-07-10)

Production blocker: the engine correctly excluded an `in_wash` item (engine-QA
showed `available: 9, in_wash: 1`), yet user-facing cards still rendered it, and
a legacy card showed free-generated copy ("Would complete it: A classic black
belt"). Proven root cause: **read/render paths never revalidated stored/cached
outfits against current availability**, and legacy `outfit_suggestions` copy
bypassed explainability. No schema change.

**Authoritative validator — `src/lib/outfit-validity.ts` (new, server-only).**
`validateOutfitCurrent(supabase, userId, itemIds, { ctx? })` reloads current
wardrobe rows (owner-scoped) and fails closed: `missing` (also covers other-user
via RLS), `in_wash`, `unavailable`, `archived`, and — when a ctx is passed —
`hard_filter_failed` (re-runs the hard-filter layer). Returns the still-available
rows in input order.

**Read paths repaired (never render stale).**
- Daily Drop (`dashboard/page.tsx` `loadTodayDrop`): validates the stored drop;
  if stale, **regenerates around what's clean** (`prepareDailyDrop force`) and
  re-validates; if nothing valid remains, shows an honest constrained state —
  never the dirty item. Emits `stale_outfit_blocked` / `stale_outfit_regenerated`.
- Legacy Best Pick (`buildBestPick`): skips any approved suggestion containing an
  unavailable/missing item (renders none rather than a stale look); the
  free-generated reasoning ("Why this works" paragraph, avoid tip, "Would
  complete it") is removed — the Daily Drop card's WhyThisWorks (1:1 from stored
  factors) is the canonical explanation.
- `/outfits/[requestId]`: same free copy removed; looks containing in-wash pieces
  are marked historical and never offered as today's wearable choice (Wore-this
  hidden).

**Write-time invalidation + concurrency (apply-time revalidation).**
- Laundry route: when an item leaves `available` (toggle/set_state/postwear-wash),
  best-effort regenerates today's active drop if it referenced that item (which
  also refreshes precomputed `swap_candidates` + `alt_item_ids`).
- Swap apply now revalidates the FULL resulting outfit (locked pieces included)
  at apply time — a precomputed candidate that went stale is rejected with
  `status:"stale"` and the client reloads fresh candidates. Another-Option
  validates its precomputed cache before serving (falls through to recompute).

**Slot-first Swap UX + telemetry.** The swap sheet opens on a slot picker
(Top/Bottom/Shoes/Layer/Accessory, computed server-side) before any candidate or
full look. Added `swap_sheet_opened`, `swap_slot_selected`, `stale_outfit_blocked`,
`stale_outfit_regenerated` (no duplicate firing).

**Tests / quality.** `tsc` clean · ESLint clean · engine suite green: 28 golden +
29 swap + **20 new validity/slot tests** (in_wash/unavailable/archived/missing/
hard-filter reasons, availability restore, order preservation, slot labels).
`next build` bundling was not runnable to completion inside the sandbox
(webpack over the mount exceeds the shell time cap) — verify on deploy.

## Phase 3 — Swap One Item · Another Option · Why This Works (2026-07-10)

The trust features. The outfit the user liked stays; only what they asked
changes; every outfit explains itself. Swaps move from Pro-gated to **free with
caps** (handbook §5 P3, the decided model), and every swap is lock-and-replace:
the rest of the look is contractually stable.

**Schema — migration `0022_swap_trust.sql` (+ down), applied to the `wearwise`
project (additive, reversible).**

- `daily_recommendations`: `swap_candidates` (precomputed top-5 per slot, IDs
  only), `base_item_ids` (pristine generated outfit), `pre_swap_item_ids`
  (exact pre-swap snapshot for undo), `swaps_used` / `options_used` cap counters
  (non-negative CHECKs). A fresh/re-prepared drop resets counters + undo.
- New `drop_feedback` table (👎 + one optional reason chip: too_formal /
  not_my_style / uncomfortable / weather / repeat), owner-insert + owner/admin
  read RLS. Corrections are append-only and **always free**.

**Engine (pure, tested).**

- `src/lib/engine/swap.ts` — lock-and-replace: swapping one item locks every
  other slot + occasion + formality window + colour theme; candidates must pass
  ALL hard filters against the locked items (fail closed) and are ranked by
  `outfit_score`, top-5. Layer/Accessory swaps resolve to "none — this outfit is
  complete" as a first-class result; core slots return a specific, actionable
  no-candidate message (never silently relaxes a filter). `moodSwap` changes the
  minimum items (1, max 2, fewest-changes-first) toward More formal / casual /
  comfortable / modest / Weather-safer. Every replacement's one-line reason is
  drawn 1:1 from a real scoring factor of the resulting outfit.
- `src/lib/swap-caps.ts` — decided caps: 3 swaps/day, 2 options/drop; first 3
  sessions cap-exempt. Confidence-framed cap copy verbatim from §5 P3 **with the
  Pro line omitted** (TODO hook `PRO_UPSELL_LINE` + `capMessage({ includePro })`
  for Phase 8).
- Generation precomputes top-5 candidates per outfit piece (`swap_candidates`)
  so a swap renders < 1s p75.

**API (cap-gated, server-authoritative, telemetry).**

- `POST /api/daily-drop/swap` reworked from Pro-gate to cap-gate; validates the
  replacement against the precompute (or re-derives), snapshots the pre-swap
  outfit, re-explains, counts the swap. `POST /mood-swap`, `POST /put-back`
  (undo; no cap refund), `POST /feedback` (always free) added.
  `POST /another-option` cap-gated (2/drop) with cache-first alternates.
  `GET /swap-candidates` returns lock-and-replace candidates + reasons + slot +
  cap. Events: `swap_requested`/`swap_kept`/`swap_reverted`, `another_option`,
  `cap_hit_swap`/`cap_hit_option`, `feedback_negative(reason)`, `why_expanded`.

**UI.**

- `SwapSheet` bottom sheet: item chips + mood chips + separated "New mood";
  result row **[Keep it] [Try another] [Put back]**; specific no-candidate + cap
  states; "Not for me" feedback with soft ack ("Noted — tomorrow gets sharper").
- `WhyThisWorks` collapsible chip on the Today card, rendered 1:1 from stored
  scoring factors. Today card's Swap / Show-another now open the sheet.

**Tests / quality.** `tsc` clean · ESLint clean · 29 new pure unit tests
(`tests/engine/swap.test.ts`) green alongside the existing 28 (golden +
laundry): cap counting incl. session exemption, unlocked-slot immutability,
undo integrity, explanation-factor 1:1 mapping, completion + mood-min-change.

## Phase 2 — Laundry / Availability System (2026-07-09)

The app now always knows what's clean, with zero nagging. Availability is a hard
filter everywhere (already true in the engine); Phase 2 makes the whole loop
around it real: a state machine, a quiet post-wear flow, a laundry basket, a soft
auto-return nudge, and honest constrained-inventory copy.

**Schema — migration `0021_laundry_availability.sql` (+ down), applied to the
`wearwise` project (additive, reversible).**

- `wardrobe_items.availability_status` CHECK widened to add `archived` (legacy
  `unavailable` kept). `in_wash_since` reconciled with status; partial index on
  `(user_id, in_wash_since)` for fast auto-return scans.
- `profiles`: `postwear_sheet_enabled`, `postwear_prompt_dismissals`,
  `wash_cycle_days` (default 4), `laundry_return_prompt_at`, `laundry_wash_note_at`.
- New `laundry_wear_stats` table (per-category wear/wash counters — learning
  stub, counts only) with owner-only RLS (select/insert/update/delete). Supabase
  security advisor confirms RLS enabled + policies present, no new lints.

**Engine + logic (pure, tested).**

- `src/lib/laundry.ts` — state transitions that keep `in_wash_since` honest
  (`toInWash`/`toAvailable`/`toArchived`/`toggleWashTransition`), post-wear smart
  defaults (`washDisposition`), wash-cycle estimate (`washCycleDaysFor`: 4d
  default, 14d dry-clean), soft auto-return (`readyToReturn`/`countReadyToReturn`),
  and the constrained-inventory honesty note (`constrainedInventoryNote`).
- `recommendOutfits` now returns `constrainedNote` on its result payload,
  computed from the full wardrobe (incl. in_wash). Availability filter confirmed
  as the single gate for drop, backups, Style Me, and swap candidates.

**Surfaces (each ships empty/loading/error states + telemetry).**

- `Sheet` bottom-sheet primitive (grabber, blur, 220ms spring, reduced-motion,
  Esc/scroll-lock) + global `prefers-reduced-motion` guard in `globals.css`.
- `PostWearSheet` — after "Wore It", per-item Wardrobe/Wash chips pre-answered
  with smart defaults (≤2 taps: one "Done"), bulk apply, and "Ask me less"
  (silences the sheet after 3, re-enable in You). Wired into the daily drop card
  and the occasion Wore-It button.
- Wardrobe: dedicated **Laundry basket** section (thumbnails, "in wash · Nd"
  badges, count header, multi-select "Laundry done", positive empty state:
  "Nothing in the wash. Everything's ready to wear."), a quiet **auto-return**
  badge (throttled, never a push), item-card one-tap toggle, and an item-detail
  availability control (available / in wash / archived).
- Drop reasoning gains the constrained-inventory line when >60% of an
  occasion-critical category is in the wash — once per wash-cycle, no push.

**Server.** Single write path `/api/wardrobe/laundry` (toggle, set_state,
bulk_clean, postwear, ask_me_less, dismiss_return_prompt, set_postwear_enabled) —
keeps `in_wash_since` honest, updates the learning stub, enforces the "ask me
less" + throttle preferences. Owner-scoped via RLS.

**Telemetry.** `laundry_marked`, `laundry_cleaned`, `postwear_sheet_shown`,
`postwear_sheet_completed`, `postwear_sheet_dismissed`, `ask_me_less_activated`
(+ `postwear_pref_changed`).

**Tests / gates.** New `tests/engine/laundry.test.ts` (28 assertions): in_wash
/archived/unavailable never surface via `eligiblePool` or `recommendOutfits`
(drop/backups/Style Me path); `isWearable` predicate (shared by swap); transitions
set/clear `in_wash_since`; auto-return timing (4d vs 14d dry-clean); smart
defaults; constrained note presence/absence + engine payload. Runner extended to
execute all `tests/engine/*.test.js`. `tsc` clean · `next lint` clean · engine
suite 62 + laundry 28 = 90 green.


## Phase 1 hotfix 2 — Everyday formality window + normalization diagnostics (2026-07-08)

Fixes a production report where `/api/admin/engine-qa?occasion=work` returned
`hero: null` (`afterAvailability: 3`, `candidatesBuilt: 0`) for a real 10-item
work wardrobe: 4 Top, 3 Bottom, 3 Kurta, 0 Footwear, all `availability_status =
'available'`.

**Root cause — not column normalization.** The engine already reads
`availability_status`, `category` ("Top"/"Bottom"/"Kurta", case-insensitive),
`user_facing_name`, and `sub_category` correctly. The conservative tag backfill
(migration 0020) assigns `formality = 2` to untagged tops/bottoms, and the
formality-window HARD filter for `work` (floor 3) excluded all of them — leaving
only the 3 backfilled kurtas (`formality = 3`, `cultural_tag = 'indian_ethnic'`),
which then had no bottom to pair with. Hence `afterAvailability: 3` / `hero: null`.

**Fix** (`src/lib/engine/filters.ts`): formality is a hard gate ONLY for
reputation occasions (interview / wedding_guest / formal_event, floor ≥ 4) —
these stay strict (unknown excluded; interview stays all-items ≥ 4). For everyday
occasions (work / casual / dinner / ethnic / festive) formality is a SOFT ranking
signal (scoring), with a ceiling guard so a too-formal piece can't be forced into
a lower-key occasion. No weather / cultural / availability rule relaxed; footwear
never fabricated.

Result for the reported wardrobe: `afterAvailability: 10`,
`partialCandidatesBuilt/Valid: 21`, `outfit_status: "partial"`, `missing_slots:
["footwear"]`, `partial_reason: "no_footwear_in_wardrobe"`, `fail_reason:
"partial_missing_footwear"`, `hero != null`.

Admin QA route (`/api/admin/engine-qa`) gains normalization diagnostics:
`categoryCountsRaw`, `categoryCountsAfterAvailability`, `availabilityStatusCounts`,
`eligiblePoolSize`, `rejectionCounts` (per hard filter), `normalizedItemsSample`.

Tests: +15 golden assertions (DB-shaped rows normalize; category→role mapping;
10-item no-footwear wardrobe → partial; null color_family/fabric don't block;
in_wash still excluded). **62/62 green.** No schema/migration change.

## Phase 1 hotfix — Partial outfit when footwear is missing (2026-07-08)

Constraint-based no-result states shouldn't be dead ends. When a valid garment
pairing exists but the wardrobe has no usable footwear, the engine returns a
**partial** outfit instead of `hero: null`.

- `engine/types.ts`: `OutfitCompleteness` (`"complete" | "partial"`),
  `MissingSlot`, `PartialReason`; `ScoredOutfit` gains `completeness`,
  `missingSlots`, `partialReason`; `RecommendationResult` gains `outfitStatus`,
  `missingSlots`, `partialReason`; diagnostics gain `partialCandidatesBuilt/Valid`.
- `recommend.ts`: tries COMPLETE outfits first (unchanged when any exist); only
  if none exist falls back to partial garment-only outfits — confidence capped
  **≤ 0.45**, `missing_slots: ["footwear"]`, honest note ("Top and bottom are
  ready. I do not have shoes in your wardrobe yet, so choose your own footwear."),
  `fail_reason: "partial_missing_footwear"`. No hard rule relaxed; footwear never
  fabricated; no accessory added to feel complete.
- Admin QA surfaces `outfit_status` / `missing_slots` / `partial_reason`.
- Tests: +23 golden assertions. No schema/migration change.

## Phase 1 — Recommendation Engine v2 + Schema (2026-07-07)

The generic outfit generator is replaced by a deterministic, rules-gated,
explainable pipeline: **HARD FILTERS → SCORING → RANK & EXPLAIN**. Every
engine-produced outfit now passes eight ordered, fail-closed filters and is
scored from a runtime-tunable weight table before it can be shown.

### Schema (migration 0020, reversible)
- Extended `wardrobe_items` with structured attributes: `color_family`,
  `pattern_boldness`, `fabric`, `sleeve_length`, `fit`, `formality` (1–5),
  `warmth`, `min_temp_c`/`max_temp_c`, `weather_tags`, `cultural_tag`,
  `modesty_level`, `layering_role`, `accessory_role`, `footwear_formality`,
  `footwear_weather`, `set_id` + `set_required_components`, `in_wash_since`,
  `avoid_with`, `tag_confidence` (jsonb), `photo_quality_flag`, with range
  CHECK constraints.
- Safe backfill for existing rows: conservative defaults; **never** auto-assigns
  `formality > 3`; unknown `cultural_tag` stays NULL and such ethnic-looking
  items are held back from auto-recommendation until confirmed.
- New global reference tables (RLS: all authenticated read, admin write):
  `engine_config` (scoring/penalty weights, thresholds, colour rules),
  `occasion_profiles` (formality window, piece caps, comfort multiplier,
  accessory policy — includes gym & interview without an enum migration),
  `ethnic_pairing_rules` (cultural legality as **data rows**, seeded with
  belt/kurta, dupatta/western, lehenga/choli, saree/belt).
- `profiles` gains absolute-exclusion columns (`excluded_colors/categories/footwear`).
- `daily_recommendations` gains `confidence`, `factor_breakdown` (jsonb),
  `is_dual_pick`, `engine_version`.
- Rollback: `supabase/rollbacks/0020_engine_v2_schema_down.sql` (moved out of `supabase/migrations/` in the migration-chain repair; see top-of-file entry).

### Engine (`src/lib/engine/*`, pure & dependency-free)
- `filters.ts` — ordered fail-closed hard filters: availability · weather/fabric ·
  formality window (occasion window) · cultural pairing legality (rule table) ·
  modesty floor · user absolute exclusions · structure completeness ·
  piece-count cap by occasion.
- `scoring.ts` — weighted sum of color_harmony, formality_coherence, occasion_fit,
  comfort, user_style_alignment, novelty; minus repeat, weather_soft, pattern_risk,
  accessory_irrelevance penalties. Every factor persists its raw value, weight and
  signed contribution.
- `guards.ts` — `AccessoryRelevanceGuard` (default = no accessory; needs a
  justification), `DupattaLayerGuard`, `PatternClashGuard`, `ShoeCompatibilityGuard`.
- `templates.ts` — structure templates incl. ethnic sets (set integrity is a
  filter) and gym/activewear (formality bypassed, comfort ×2, no accessories,
  footwear allowed).
- `recommend.ts` — pipeline returning hero + 2 backups + confidence; dual-pick
  honest mode below threshold; never fabricates an outfit (null + reason).
- `config.ts` defaults mirror the migration seeds; `loadContext.ts` hydrates
  from the DB and falls back to defaults gracefully.

### Wiring & enforcement
- `outfitValidation.ts` (the fail-closed **3-place** gate — AI generation, admin
  curation UI, server approve API) extended with the cultural hard rules
  (belt-over-kurta/saree, dupatta-without-ethnic-anchor). Pattern **extended, not
  bypassed**.
- `engineOutfits()` now delegates to the v2 pipeline, so the occasion and
  analysis generate routes transparently use it.
- Daily-drop prepare scores its selected outfit and **stores** the factor
  breakdown + confidence + dual-pick flag (selection logic unchanged; Phase 4
  rewires selection itself).
- Optional admin QA route `GET /api/admin/engine-qa` returns per-outfit factor
  breakdowns + diagnostics.

### Tests & quality
- 24 golden assertions (`tests/engine/golden.test.ts`), all green: belt+kurta
  blocked; dupatta never on western; wool blocked ≥30 °C; in-wash never emitted;
  interview all items formality ≥4; gym activewear-only; one-piece never with a
  separate bottom; 10-item wardrobe → hero + 2 backups; 60-item wardrobe scored
  under the 800 ms budget.
- Runner `scripts/run-engine-tests.mjs` (`npm run test:engine`) compiles the pure
  engine subset with `tsc` and runs esbuild-free (works in the CI sandbox); on
  Windows use `npx tsx tests/engine/golden.test.ts`.
- `tsc --noEmit` clean · ESLint clean on all new/touched files.
