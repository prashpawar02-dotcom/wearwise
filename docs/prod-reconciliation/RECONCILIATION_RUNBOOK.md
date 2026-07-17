# WearWise — Production Migration Reconciliation Runbook (0020–0028) — EXECUTION-READY

**Status: document only. NOT executed. Do NOT run any hosted write, `supabase link`, `migration repair`, `db push`, or deploy until the named STOP / HUMAN APPROVAL gates are cleared. All hosted-facing steps are gated.**

Hosted project ref: `inoxmvvdoxloxwpykzrg`. Read-only audit: `docs/prod-reconciliation/prod_audit_readonly.sql`. Expected refs: `docs/prod-reconciliation/expected/`.

---

## 0. Verification mechanisms — distinct purposes (do not conflate)

1. **Local `supabase db reset`** — proves the *repository* migrations execute successfully, in order, on a clean local Postgres. It does **not** prove anything about production.
2. **Local integration tests** (`test:engine`, `test:atomic-wear:local`, `test:streak-concurrency:local`, `test:outfit-request-privileges:local`) — prove application↔database contracts (RLS, privileges, RPC behavior) locally.
3. **Production read-only audit** (`prod_audit_readonly.sql`) — proves live production **data + object preconditions** (SELECT-only).
4. **Isolated 0001–0022 baseline diff** — proves the **resulting production base schema** is equivalent to the repository's historical baseline (Stages 4–5). It compares resulting **schema states**; it does *not* attribute each difference to an individual migration, and it does *not* compare seed **data** (seed equivalence is the canonical fingerprints in §Evidence).
5. **`supabase db push --dry-run`** — proves which migration **versions the remote considers pending**. It must list exactly `0023 0024 0025 0026 0027 0028`. It is **not** proof that any migration SQL executed successfully (only `db push` + Stage-10 verification prove execution).

---

## Current production state (measured read-only, this session)

Ledger: `0002`–`0019` (plain) + `20260709121143` (=0021) + `20260709124859` (=0022). Missing: `0001`, `0020`, `0023`–`0028`.
Grants: permissive Supabase baseline (all 7 privileges to anon/authenticated/service_role) on every table → the app functions on prod, but 0024/0027/0028 hardening is absent and `anon` is over-privileged.

---

## Evidence already proven (preserve — do not weaken)

- **0020 canonical seed fingerprints (reproducible):** engine_config `6415de2e748e18d36e3b2162444fa1bb`, occasion_profiles `cc77b28b87bfcd450a13c0008775b904`, ethnic_pairing_rules `31b7908969b2bdd8b4ae98818f203fac` (hosted == repo-derived; see `expected/seed_fingerprints.md`). This is the **seed-data** equivalence proof (the baseline diff does not cover data).
- **0021 exact equivalence:** availability CHECK `= ANY('available','in_wash','unavailable','archived')`; `wardrobe_items_in_wash_since_idx (user_id, in_wash_since) WHERE availability_status='in_wash'`; profiles 5 cols exact; `profiles_wash_cycle_days_check (1..60)`, `profiles_postwear_dismissals_check (0..100)`; `laundry_wear_stats` PK(user_id,category) + RLS + 4 owner policies.
- **0022 exact equivalence:** daily_recommendations 5 cols exact; `swaps_used_nonneg (>=0)`, `options_used_nonneg (>=0)`; `drop_feedback` (pkey + user_idx + reason_idx) + RLS + 2 policies.
- **0023 SECURITY INVOKER + RLS dependency proof:** `confirm_daily_drop_wear(uuid, uuid[])` is SECURITY INVOKER (`prosecdef=false`), `search_path=public,pg_temp`, EXECUTE→authenticated only; `daily_recommendations` (`dailyrec_select_own`, `dailyrec_update_own`) and `wardrobe_items` (`wardrobe_owner_all`, `wardrobe_admin_read`) confine the invoker to the caller's own rows → cannot touch another user's rows.
- **0026 = HARD DEPLOYMENT BLOCKER:** new code writes `outfit_status`/`missing_slots`/`partial_reason`/`inventory_fingerprint` on every generation and every swap/option/mood/put-back; absent columns → those writes fail app-wide.
- **0027 streak privilege matrix:** authenticated=SELECT; service_role=SELECT,INSERT,UPDATE; anon=none.
- **0028 outfit_request privilege + RLS matrix:** authenticated=SELECT,INSERT,UPDATE; service_role=UPDATE; anon=none; broad `requests_owner_all`/`requests_admin_rw` replaced by `requests_owner_insert`/`requests_owner_select`/`requests_admin_all`.

**Preserved rules:** post-deploy, **retain additive 0025/0026 columns** (never auto-drop data columns); **never restore `anon` over-privilege** except as an explicitly-approved emergency, re-tightened immediately; a later **`0029_service_role_least_privilege`** is recommended (0024 grants service_role `ALL`, broader than the proven SELECT/INSERT/UPDATE need — see §0024 re-review).

---

## Repository migration matrix (0020–0028)

| Mig | Objects | Idempotent | Notable | Deps | Rollback file |
|---|---|---|---|---|---|
| 0020 | wardrobe_items+22, profiles+3, daily_rec+4; 4 CHECKs; set_idx; engine_config/occasion_profiles/ethnic_pairing_rules (+RLS+policies+seeds `on conflict do nothing`) | Yes; **contains backfill `UPDATE`** | present → **ledger baseline only, never re-run** | 0001 | `0020_..._down.sql` (schema-destructive; never on prod) |
| 0021 | availability CHECK + in_wash idx; profiles+5 +2 CHECKs; laundry_wear_stats(+RLS+4 pol) | Yes | recorded as timestamp (drift) | 0001/0007/0020 | present |
| 0022 | daily_rec+5 +2 CHECKs; drop_feedback(+2 idx +RLS+2 pol) | Yes | recorded as timestamp (drift) | 0009 | present |
| 0023 | fn `confirm_daily_drop_wear(uuid,uuid[])` SECURITY INVOKER; execute→authenticated | Yes | invoker needs authenticated SELECT/UPDATE | daily_rec+wardrobe_items+RLS | present |
| 0024 | revoke/grant on 3 tables; schema usage | Yes | service_role gets `grant all` (re-review) | 3 tables | present |
| 0025 | profiles+2 (onboarding_step, default_occasion) + CHECK | Yes | | profiles | present |
| 0026 | daily_rec+4 + outfit_status CHECK | Yes | | daily_rec | present |
| 0027 | revoke/grant streaks | Yes | | streaks | present |
| 0028 | revoke/grant outfit_requests; replace broad policies | Yes | | outfit_requests, is_admin | present |

---

# Execution stages (sequential; each gated)

## Stage 1 — Local branch and clean verification
- **Purpose:** prove the repository migrations (0001–0028) execute on a clean local DB and the app↔DB contracts pass, before touching production.
- **Commands (local only):**
  ```
  npx supabase@latest db reset
  npm run test:engine
  npm run test:atomic-wear:local
  npm run test:streak-concurrency:local
  npm run test:outfit-request-privileges:local
  npx tsc --noEmit
  npm run lint
  npm run build
  ```
- **Expected:** `db reset` applies 0001–0028 with no error; every command exits 0.
- **Stop conditions:** any migration error during reset; any non-zero exit. Fix locally before proceeding.
- **Approval:** none (local only).
- **Evidence to capture:** reset log tail; each command's exit code.

## Stage 2 — Backup and maintenance preparation
- **Purpose:** ensure a recovery point and a safe window (risk is **MEDIUM** — 0024/0027/0028 revoke privileges and 0028 replaces RLS, affecting the running app immediately).
- **Commands:** verify PITR enabled; take a snapshot (Dashboard → Database → Backups); record restore point + UTC timestamp; announce a low-traffic maintenance window + deploy freeze.
- **Expected:** a confirmed restore point; window scheduled.
- **Stop conditions:** PITR not enabled / no snapshot → STOP.
- **Approval:** Backup/snapshot creation itself is safe and needs no approval. **[APPROVAL CHECKPOINT — enter production-facing sequence]** requires explicit human sign-off BEFORE any of: (a) declaring the deploy freeze, (b) beginning the production maintenance sequence, (c) moving from local-only Stage 1 into the production-facing Stages 2→ onward.
- **Evidence:** snapshot ID + timestamp; PITR status; recorded approval for the production-facing sequence.

## Stage 3 — Fresh production read-only audit
- **Purpose:** re-measure live preconditions (state can drift since this session).
- **Commands:** Supabase Studio → SQL Editor → paste `docs/prod-reconciliation/prod_audit_readonly.sql` → Run.
- **Expected:** all `[must be zero]` = 0; 0020 block matches; 0021/0022 (J/K) match; 0023–0028 absent; B.6 fingerprints == `expected/seed_fingerprints.md`.
- **Stop conditions:** any `[must be zero]` nonzero; any 0020/0021/0022 mismatch; any 0023–0028 already partially present (→ treat as drift, do not proceed with a plain push).
- **Approval:** none (read-only).
- **Evidence:** the full audit result set.

## Stage 4 — Isolated 0001–0022 baseline construction
- **Purpose:** build a clean local schema containing **exactly** migrations 0001–0022 so it can be diffed against production without the 0023–0028 delta. Never modifies the active branch or hosted Supabase.
- **Commands (Windows PowerShell; run from the owner's repo root; local only, no hosted contact):**
  ```powershell
  # --- Paths (Windows-safe, quoted; the temp worktree is a SIBLING of the project) ---
  Set-Location "G:\projects\WearWise\WearWise Product + Build"
  $proj = (Get-Location).Path
  $wt   = "G:\projects\WearWise\wearwise-baseline-0022"

  # --- COMMITTED-BASELINE GUARD (item 2): a worktree from HEAD EXCLUDES uncommitted
  #     and untracked files, so HEAD is a valid historical baseline ONLY if migrations
  #     0001-0022 have no tracked modifications, no staged changes, and no untracked
  #     files. Inspect ONLY 0001-0022 via explicit git pathspecs. ---
  $base = 1..22 | ForEach-Object { "supabase/migrations/{0:0000}_*.sql" -f $_ }
  $modified  = git diff        --name-only -- $base   # working tree vs HEAD
  $staged    = git diff --cached --name-only -- $base  # index vs HEAD
  $untracked = git ls-files --others --exclude-standard -- $base  # untracked
  if ($modified -or $staged -or $untracked) {
    throw "STOP: migrations 0001-0022 are not fully committed. HEAD cannot be used as the historical baseline."
  }
  Write-Host "Committed-baseline guard passed: 0001-0022 are clean at HEAD."

  # --- Create the temp worktree from HEAD (active checkout untouched) ---
  git worktree add "$wt" HEAD
  Set-Location "$wt"

  # --- Remove ONLY 0023-0028 from the TEMP worktree (never the active checkout) ---
  Remove-Item "supabase\migrations\0023_*.sql","supabase\migrations\0024_*.sql","supabase\migrations\0025_*.sql","supabase\migrations\0026_*.sql","supabase\migrations\0027_*.sql","supabase\migrations\0028_*.sql"

  # --- Prove 0023-0028 are absent and exactly 0001-0022 remain ---
  if (Get-ChildItem "supabase\migrations\002[3-8]_*.sql" -ErrorAction SilentlyContinue) {
    Set-Location "$proj"; throw "STOP: 0023-0028 still present in the temp worktree."
  }
  $present = Get-ChildItem "supabase\migrations\*.sql" | Select-Object -ExpandProperty Name | Sort-Object
  $present
  if ($present.Count -ne 22) {
    Set-Location "$proj"; throw "STOP: expected 22 baseline files (0001-0022), found $($present.Count)."
  }

  # --- Build the historical baseline on the LOCAL stack (never hosted); keep evidence ---
  npx supabase@latest db reset 2>&1 | Tee-Object -FilePath "$proj\docs\prod-reconciliation\evidence_stage4_reset.txt"
  ```
- **Expected:** the guard prints "passed"; `$present` lists exactly the 22 files 0001–0022 (no 0023–0028); local `db reset` applies 0001–0022 with no error.
- **Stop conditions:** guard `throw` (0001–0022 not committed); any 0023–0028 file remains in the temp worktree; `$present.Count ≠ 22`; reset error. On any stop, run the **Defensive cleanup** block below.
- **Approval:** none (local only; no hosted contact yet).
- **Evidence:** the `$present` listing; `evidence_stage4_reset.txt` (reset output).

## Stage 5 — Historical baseline diff (0001–0022 vs production)
- **Purpose:** prove the production base schema equals the repository's 0001–0022 baseline (resulting **schema states**, not per-migration attribution).
- **Commands (Windows PowerShell; run inside the temp worktree `$wt` from Stage 4):**
  ```powershell
  supabase link --project-ref inoxmvvdoxloxwpykzrg      # [GATE A]
  supabase db diff --linked --schema public 2>&1 | Tee-Object -FilePath "$proj\docs\prod-reconciliation\evidence_stage5_diff.txt"
  ```
  `db diff` builds a local shadow from the temp 0001–0022 migrations, introspects the **remote** schema (read-only), and prints the difference.
- **Expected / acceptance rule:** **no real `public`-schema differences.** Ignore **platform-owned noise only** (objects in `auth`/`storage`/`graphql`/`realtime`/extension schemas, Supabase-managed roles/default grants) — restrict attention to `public`. A `public` diff that is empty (or contains only clearly platform-managed grant noise) proves 0001–0022 schema equivalence. **Seed-data equivalence is NOT covered here** — it is the canonical fingerprints (Stage 3 / Evidence).
- **Stop conditions:** **any unexplained `public`-schema difference** → STOP; do not repair or push; investigate the specific object.
- **Approval:** **[GATE A]** before `supabase link`. **[APPROVAL CHECKPOINT — historical baseline equivalence proven]** must be signed off before Stage 6.
- **Evidence:** `evidence_stage5_diff.txt` (annotated: platform-noise vs real public drift). Then clean up (PowerShell; the temp worktree is intentionally "dirty" because 0023–0028 were removed, so `--force` is required to remove the git-managed worktree — this never touches the active checkout):
  ```powershell
  Set-Location "$proj"                                   # back to the active project
  git worktree remove "$wt" --force                      # remove the git-managed temp worktree
  git worktree prune
  ```

---

## Defensive cleanup (run if Stage 4 or Stage 5 stops or fails — AFTER capturing evidence)
Purpose: safely tear down the temporary baseline environment without ever touching the active checkout. **Never** use a broad recursive delete (`Remove-Item -Recurse -Force`) against the project, and **never** delete migrations from the active checkout — worktree teardown is git-managed only.
```powershell
# 1) Always return to the active project first:
Set-Location "G:\projects\WearWise\WearWise Product + Build"

# 2) Stop the temporary local Supabase stack ONLY if you started a SEPARATE one for the
#    baseline (a plain `supabase db reset` uses the default local stack; skip this line if
#    you did not run a separate `supabase start`):
# supabase stop --project-id wearwise-baseline-0022

# 3) Remove the temporary worktree (git-managed; safe). `--force` is expected because
#    0023-0028 were removed inside it. This deletes ONLY the sibling temp worktree,
#    never the active project and never any active migration file:
git worktree remove "G:\projects\WearWise\wearwise-baseline-0022" --force
git worktree prune

# 4) Confirm the active checkout is intact (all 28 migrations still present):
(Get-ChildItem "supabase\migrations\*.sql").Count   # expect 28
```
Stop condition: if step 4 reports anything other than 28, STOP — the active checkout may have been altered; investigate before proceeding.

## Stage 6 — Project link and migration-list inspection (active project)
- **Purpose:** attach the real project (with 0001–0028) and capture the authoritative ledger divergence.
- **Commands (in the active project dir):**
  ```
  supabase link --project-ref inoxmvvdoxloxwpykzrg      # [GATE A]
  supabase migration list
  ```
- **Expected:** `migration list` shows remote has `0002–0019` + the two timestamp rows, and is missing `0001, 0020, 0023–0028`; local has `0001–0028`.
- **Stop conditions:** the list differs from the above and from Stage-3 evidence → STOP and reconcile understanding before any repair.
- **Approval:** **[GATE A]** before `supabase link`.
- **Evidence:** raw `migration list` output.

## Stage 7 — Migration-history repair (one command at a time)
- **Purpose:** make the remote ledger match the local files, with a `migration list` check between every step. **Remove the timestamp rows BEFORE applying the canonical 0021/0022 versions.**
- **Commands — run EXACTLY one at a time; re-run `migration list` and confirm expected state after each:**
  ```
  supabase migration repair --status reverted 20260709121143
  supabase migration list
  supabase migration repair --status reverted 20260709124859
  supabase migration list
  supabase migration repair --status applied 0001
  supabase migration list
  supabase migration repair --status applied 0020
  supabase migration list
  supabase migration repair --status applied 0021
  supabase migration list
  supabase migration repair --status applied 0022
  supabase migration list
  ```
  Do **not** use multi-version repair arguments. `applied 0001` is warranted only because Stage 5 proved 0001–0022 equivalence; if Stage 5 was not clean, STOP.
- **Expected after the final list:** remote ledger = `0001–0022` (no timestamp rows), and `0023–0028` still pending.
- **Stop conditions:** any `migration list` after a repair differs from the expected incremental state → STOP; do not run the next repair.
- **Approval:** **[GATE B]** before the first `migration repair`; each subsequent repair also requires explicit human go-ahead.
- **Evidence:** each `migration list` between commands.

## Stage 8 — db push dry run
- **Purpose:** confirm exactly which versions the remote will apply.
- **Commands:** `supabase db push --dry-run`
- **Expected / acceptance rule:** the plan lists **exactly** `0023, 0024, 0025, 0026, 0027, 0028` — in that order — and nothing else (never 0001–0022). This proves *pending set*, not execution success.
- **Stop conditions:** the plan includes any 0001–0022 (history repair incomplete) or omits any 0023–0028 → STOP.
- **Approval:** **[APPROVAL CHECKPOINT — dry run lists exactly 0023–0028]** before Stage 9.
- **Evidence:** the dry-run plan.

## Stage 9 — Production migration application
- **Purpose:** apply 0023–0028.
- **Commands:** `supabase db push`
- **Expected:** each migration reports success in order; the ledger gains `0023–0028`.
- **Transaction / partial-failure model (read carefully):** per repository inspection, every statement in 0023–0028 is transaction-compatible (no `CREATE INDEX CONCURRENTLY` / `ALTER TYPE ADD VALUE` / `VACUUM`). Whether the CLI wraps each migration in a transaction must be confirmed from the installed CLI version + the `db push` output at run time — **do not assume the whole sequence is atomic.** Treat **each migration as an independent production checkpoint**: e.g., 0023 may commit while 0024 or a later migration fails. On **any** failure: STOP the push, go to Stage 14 with the §Partial-failure table; run `supabase migration list` + `prod_audit_readonly.sql` before deciding retry / repair / forward-fix. **Never** blindly re-run the full push after a partial failure; **never** hand-insert a ledger row to conceal a failed migration.
- **Stop conditions:** any migration error.
- **Approval:** **[GATE C]** before `supabase db push`.
- **Evidence:** full `db push` output; post-push `migration list`.

## Stage 10 — Per-migration verification
- **Purpose:** prove each migration actually took effect (dry-run and push logs are not sufficient).
- **Commands:** re-run `prod_audit_readonly.sql`; check each block `[exact expected]`:
  - **0023** (C.1–C.4): function present, `security_definer=f`, `proconfig={search_path=public,pg_temp}`, `arg_types = p_recommendation_id uuid, p_item_ids uuid[]`, EXECUTE=authenticated only; dr/wi own-row policies present; authenticated dr/wi SELECT+UPDATE true.
  - **0024** (D): `anon` = 0 rows on all 3 tables; `authenticated` = SELECT,INSERT,UPDATE on profiles/daily_recommendations and SELECT,INSERT,UPDATE,DELETE on wardrobe_items; service_role present; schema usage true. **Smoke-test the app immediately after 0024.**
  - **0025** (E): both columns exact; `profiles_onboarding_step_check` present.
  - **0026** (F): all 4 columns exact; `daily_recommendations_outfit_status_check` present.
  - **0027** (G): `anon` 0 rows; `authenticated` = SELECT; service_role = SELECT,INSERT,UPDATE; streaks RLS/owner unchanged. **Smoke-test after 0027.**
  - **0028** (H): `anon` 0 rows; `authenticated` = SELECT,INSERT,UPDATE; service_role = UPDATE; broad policies absent; the 3 command-specific policies present with exact defs; `is_admin` unchanged. **Smoke-test after 0028.**
- **Expected:** every block matches; medium-risk smoke checks (login, Style Me insert, streak check-in) pass after 0024/0027/0028.
- **Stop conditions:** any block does not match → STOP; go to Stage 14.
- **Approval:** **[APPROVAL CHECKPOINT — every migration verification green]** before Stage 11.
- **Evidence:** post-push audit result set.

## Stage 11 — Application deployment
- **Purpose:** ship the new app build (which depends on 0026, and 0023/0025 if Wore-It/Onboarding v2 are included).
- **Commands:** your standard deploy (e.g., Vercel promote) — only after Stage 10 is green and 0026 is verified present.
- **Expected:** deploy succeeds; app boots.
- **Stop conditions:** 0026 not verified present → do NOT deploy.
- **Approval:** **[GATE D]** before deploying application code.
- **Evidence:** deploy ID + commit.

## Stage 12 — Production smoke test
- **Purpose:** confirm real user paths.
- **Checks:** Today generates + persists (outfit_status/inventory_fingerprint populated → 0026); partial reason renders honestly; Swap/Another Option/Put-back persist; streak check-in 200; Style Me inserts + opens `/outfits/[id]`; Wore-It confirm succeeds (0023); Onboarding v2 writes onboarding_step (0025) if shipped.
- **Expected:** all pass.
- **Stop conditions:** any core path fails → Stage 14.
- **Approval:** none (observation).
- **Evidence:** checklist results.

## Stage 13 — Post-deploy audit and stabilization
- **Purpose:** final consistency snapshot.
- **Commands:** re-run `prod_audit_readonly.sql`.
- **Expected:** ledger contiguous `0001…0028`; all `[must be zero]` zero; `[exact expected]` all match; `[informational]` (e.g. `I.3 dr_rowcount`) may be nonzero.
- **Stop conditions:** any regression → Stage 14.
- **Approval:** none (read-only).
- **Evidence:** final audit set; sign-off.

## Stage 14 — Rollback or forward-repair decision
Use the §Partial-failure table and the pre/post-deploy rules below.

---

## Partial-failure table

| Failure point | Likely impact | App stays live? | Stop deployment? | Rollback vs forward-repair | Exact next inspection |
|---|---|---|---|---|---|
| **History repair (Stage 7)** | Ledger inconsistent; no schema changed | Yes | Yes (do not push) | Neither — re-inspect; correct the specific repair with the official CLI (never hand-edit ledger) | `supabase migration list` after each command |
| **0023** | Wore-It RPC missing; rest unaffected | Yes | Pause | Forward-fix (re-apply 0023) preferred; no data written yet → pre-deploy revert allowed | `migration list` + audit block C |
| **0024** | Grants partially changed; anon may still be over-privileged OR authenticated mid-revoke | Usually (baseline still permissive if revoke didn't commit) | Yes | Forward-repair the grant matrix (never restore anon over-privilege); or PITR if partial-commit left a broken state | audit block D (per-role privs on all 3 tables) |
| **0025** | onboarding_step/default_occasion missing | Yes (default_occasion degrades to casual) | Only if Onboarding v2 in this release | Forward-fix (re-apply 0025); additive → safe | audit block E |
| **0026** | Authoritative columns missing | Yes **until app deploy**; **hard blocker for the new app** | **Yes — do not deploy app** | Forward-fix (re-apply 0026) BEFORE any app deploy | audit block F |
| **0027** | streak grants partially changed | Yes (baseline permissive if uncommitted) | Yes | Forward-repair grant matrix | audit block G |
| **0028** | outfit_request grants/policies partially changed; RLS could be mid-replace | Risk: if old policies dropped but new not created, Style Me reads/writes could fail | Yes | Forward-repair to the full 0028 end-state; if policies half-applied, PITR is safest | audit block H (policies + grants) |
| **Application deployment (Stage 11)** | New build failed/broken with schema already migrated | Depends on deploy platform | Yes | **Roll back the application first** (redeploy previous build); **retain 0025/0026 columns**; do not touch schema | app logs + Stage-13 audit |

---

## Rollback strategy — pre-deploy vs post-deploy

**A. Pre-deploy** (migration applied, app not yet deployed, no new app data written): revert the specific migration that failed by running its exact rollback file then reverting its ledger row via the CLI, e.g. for 0026: run `supabase/rollbacks/0026_recommendation_authority_down.sql`, then `supabase migration repair --status reverted 0026`. Per migration the exact rollback file is `supabase/rollbacks/0023_atomic_wear_confirmation_down.sql`, `…/0024_app_role_privileges_down.sql`, `…/0025_onboarding_v2_down.sql`, `…/0026_recommendation_authority_down.sql`, `…/0027_streak_privileges_down.sql`, `…/0028_outfit_request_privileges_down.sql`. Cleaner alternative: restore the pre-window PITR snapshot. **0020: never run its schema-down on prod** (drops data columns/tables); a 0020 issue is ledger-only.

**B. Post-deploy** (new app live, data written under new columns):
1. **Roll back the application first** (redeploy the previous build).
2. **Retain additive 0025/0026 columns** — never auto-drop data columns; old code ignores unknown columns.
3. **0023 RPC:** do not drop (breaks Wore-It); forward-fix.
4. **Privilege/RLS defects (0024/0027/0028):** **forward-repair** (a new corrective migration), not the down file — reverting restores `anon` over-privilege. **Never restore anon over-privilege** except as an explicitly-approved emergency, re-tightened immediately.

---

## Release-blocker matrix (strict)

| Mig | If prod lacks it | Class |
|---|---|---|
| **0026** | Every daily-drop + swap/option/mood/put-back WRITE fails → Today broken app-wide | **HARD DEPLOYMENT BLOCKER** |
| **0023** | Wore-It confirm → function-missing error | **HARD blocker for Wore-It** |
| **0025** | Onboarding v2 write fails; default_occasion read degrades to `casual` | **HARD blocker for Onboarding v2**; default_occasion degraded-safe |
| **0024 / 0027 / 0028** | App works (permissive baseline); `anon` over-privileged; 0028 RLS broad | **Safe to defer functionally; security-recommended** |

---

## 0024 re-review — `grant all to service_role`
`GRANT ALL` = SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES (7). Server code uses SELECT/INSERT/UPDATE only; **no** service_role DELETE on the 3 tables (account deletion is `auth.admin.deleteUser` + FK cascade); TRUNCATE/TRIGGER/REFERENCES unused. Do **not** change 0024 here. Warrant a follow-up **`0029_service_role_least_privilege`** reducing service_role to `SELECT, INSERT, UPDATE` (+ wardrobe_items DELETE only if a genuine server delete appears). Security hardening item, not a blocker.

---

## Final-audit result labels
- **[must be zero]:** A.ledger_dupes; I.1; I.2 (all four); I.4; I.5 (both).
- **[exact expected]:** all B.* (incl. B.6 fingerprints), C.*, D (post-0024) + schema_usage, E, F, G (post-0027), H (post-0028), J (0021), K (0022).
- **[informational]:** A.ledger listing, I.3 dr_rowcount, L.0001_inventory, any grant listing captured before its migration is applied.

---

## Approval gates — summary
- **[APPROVAL CHECKPOINT — enter production-facing sequence]** before leaving local-only Stage 1: declaring the deploy freeze / starting the production maintenance sequence / entering Stage 2 onward (backup creation itself is ungated).
- **[GATE A]** before every `supabase link` (Stages 5 and 6).
- **[GATE B]** before the first `supabase migration repair` (Stage 7); each subsequent repair also requires go-ahead.
- **[GATE C]** before `supabase db push` (Stage 9).
- **[GATE D]** before application deployment (Stage 11).
- **[APPROVAL CHECKPOINT]s** after: historical baseline equivalence proven (Stage 5); dry run lists exactly 0023–0028 (Stage 8); every migration verification green (Stage 10).

---

## Remaining unknowns (require CLI/live run at execution time)
1. `supabase migration list` / the isolated `db diff --linked` output — the authoritative divergence + 0001–0022 equivalence (cannot run the CLI here). Stage-7 repair steps are confirmed against Stage 6/5 output.
2. `supabase db push --dry-run` plan — must be exactly 0023–0028.
3. Actual CLI transaction behavior at run time (installed version) — confirm from `db push` output; do not assume whole-sequence atomicity.
4. Live `[must be zero]` and seed-fingerprint values at execution time — re-run Stage 3 first.
Everything else is evidence-backed from this session's read-only measurements.
