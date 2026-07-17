-- =====================================================================
-- WearWise — PRODUCTION RECONCILIATION AUDIT (READ-ONLY) — FINAL REVISION
-- SELECT-ONLY: zero DDL/DML. Safe to paste into Supabase Studio → SQL Editor
-- against PRODUCTION. Never prints secrets. This file is READ-ONLY EVIDENCE
-- gathering only. Migration history/schema changes are performed exclusively
-- via the official Supabase CLI workflow in RECONCILIATION_RUNBOOK.md
-- (link → migration list → migration repair → db push --dry-run → db push).
-- Result labels in each block: [must be zero] | [exact expected] | [informational].
-- =====================================================================

-- ==== A. MIGRATION LEDGER (informational) ================================
select 'A.ledger' section, version, name from supabase_migrations.schema_migrations order by version;
select 'A.ledger_dupes [must be zero]' section, version, count(*) n
  from supabase_migrations.schema_migrations group by version having count(*) > 1;

-- ==== B. 0020 EQUIVALENCE [exact expected] ===============================
select 'B.1 wi_cols' section, column_name, data_type, is_nullable, coalesce(column_default,'(none)') col_default
  from information_schema.columns where table_schema='public' and table_name='wardrobe_items'
   and column_name in ('color_family','pattern_boldness','fabric','sleeve_length','fit','formality','warmth','min_temp_c','max_temp_c','weather_tags','cultural_tag','modesty_level','layering_role','accessory_role','footwear_formality','footwear_weather','set_id','set_required_components','in_wash_since','avoid_with','tag_confidence','photo_quality_flag')
  order by column_name;
select 'B.1 profiles_cols' section, column_name, data_type, is_nullable, coalesce(column_default,'(none)')
  from information_schema.columns where table_schema='public' and table_name='profiles'
   and column_name in ('excluded_colors','excluded_categories','excluded_footwear') order by column_name;
select 'B.1 dr_cols' section, column_name, data_type, is_nullable, coalesce(column_default,'(none)')
  from information_schema.columns where table_schema='public' and table_name='daily_recommendations'
   and column_name in ('confidence','factor_breakdown','is_dual_pick','engine_version') order by column_name;
select 'B.2 wi_constraints' section, conname, pg_get_constraintdef(oid) def
  from pg_constraint where conrelid='public.wardrobe_items'::regclass
   and conname in ('wardrobe_items_formality_range','wardrobe_items_modesty_range','wardrobe_items_warmth_range','wardrobe_items_pattern_boldness_range') order by conname;
select 'B.3 wi_set_idx' section, indexdef from pg_indexes where schemaname='public' and tablename='wardrobe_items' and indexname='wardrobe_items_set_idx';
select 'B.4 engine_tables_rls' section, tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('engine_config','occasion_profiles','ethnic_pairing_rules') order by tablename;
select 'B.5 engine_policies' section, tablename, policyname, cmd, roles::text, coalesce(qual,'') using_expr, coalesce(with_check,'') check_expr
  from pg_policies where schemaname='public' and tablename in ('engine_config','occasion_profiles','ethnic_pairing_rules') order by tablename, policyname;

-- B.6 SEED CANONICAL FINGERPRINTS (reproducible; type-normalized jsonb_agg).
-- EXPECTED (repository-derived; see docs/prod-reconciliation/expected/seed_fingerprints.md):
--   engine_config        = 6415de2e748e18d36e3b2162444fa1bb
--   occasion_profiles    = cc77b28b87bfcd450a13c0008775b904
--   ethnic_pairing_rules = 31b7908969b2bdd8b4ae98818f203fac
select 'B.6 engine_config_fp [exact expected]' section,
  md5(jsonb_agg(jsonb_build_object('k',key,'v',value::text) order by key)::text) hosted_fp
  from public.engine_config;
select 'B.6 occasion_profiles_fp [exact expected]' section,
  md5(jsonb_agg(jsonb_build_object('o',occasion,'ft',formality_target::text,'fmin',formality_min::text,'fmax',formality_max::text,'mp',max_pieces::text,'cm',round(comfort_multiplier::numeric,2)::text,'bf',bypass_formality::text,'ap',accessory_policy,'ao',activewear_only::text,'l',label) order by occasion)::text) hosted_fp
  from public.occasion_profiles;
select 'B.6 ethnic_rules_fp [exact expected]' section,
  md5(jsonb_agg(jsonb_build_object('k',kind,'s',subject_key,'o',object_key,'sc',scope,'m',message) order by subject_key,object_key,kind)::text) hosted_fp
  from public.ethnic_pairing_rules;

-- ==== C. 0023 confirm_daily_drop_wear RPC (exact signature + RLS dep) =====
select 'C.1 rpc_signature [exact expected]' section, p.oid::text oid, p.proname,
       pg_get_function_identity_arguments(p.oid) arg_types, pg_get_function_result(p.oid) returns,
       l.lanname language, p.provolatile volatility, p.prosecdef security_definer,
       (select array_agg(cfg) from unnest(p.proconfig) cfg) proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname='public' and p.proname='confirm_daily_drop_wear';
select 'C.2 rpc_execute_grants [exact expected]' section, p.oid::text oid, pg_get_function_identity_arguments(p.oid) args,
       (select string_agg(distinct pr.grantee||':'||pr.privilege_type, ', ') from information_schema.routine_privileges pr
          where pr.specific_schema='public' and pr.specific_name = p.proname || '_' || p.oid) execute_grants
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='confirm_daily_drop_wear';
select 'C.3 dr_policies [exact expected own-row]' section, policyname, cmd, roles::text, coalesce(qual,'') using_expr, coalesce(with_check,'') check_expr
  from pg_policies where schemaname='public' and tablename='daily_recommendations' order by policyname;
select 'C.3 wi_policies [exact expected own-row]' section, policyname, cmd, roles::text, coalesce(qual,'') using_expr, coalesce(with_check,'') check_expr
  from pg_policies where schemaname='public' and tablename='wardrobe_items' order by policyname;
select 'C.4 authenticated_rpc_privs [exact expected true]' section,
  has_table_privilege('authenticated','public.daily_recommendations','select') dr_select,
  has_table_privilege('authenticated','public.daily_recommendations','update') dr_update,
  has_table_privilege('authenticated','public.wardrobe_items','select') wi_select,
  has_table_privilege('authenticated','public.wardrobe_items','update') wi_update;

-- ==== D. 0024 privileges (3 core tables) ================================
select 'D.grants [exact expected post-0024]' section, table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
  from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')
   and table_name in ('profiles','wardrobe_items','daily_recommendations') group by table_name, grantee order by table_name, grantee;
select 'D.schema_usage [exact expected true]' section, r.rolname role, has_schema_privilege(r.rolname,'public','usage') usage
  from pg_roles r where r.rolname in ('anon','authenticated','service_role');

-- ==== E. 0025 onboarding =================================================
select 'E.onboarding_cols [exact expected]' section, column_name, data_type, is_nullable, coalesce(column_default,'(none)')
  from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('onboarding_step','default_occasion') order by column_name;
select 'E.onboarding_check [exact expected]' section, conname, pg_get_constraintdef(oid) def
  from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_onboarding_step_check';

-- ==== F. 0026 recommendation authority ==================================
select 'F.auth_cols [exact expected]' section, column_name, data_type, is_nullable, coalesce(column_default,'(none)')
  from information_schema.columns where table_schema='public' and table_name='daily_recommendations' and column_name in ('outfit_status','missing_slots','partial_reason','inventory_fingerprint') order by column_name;
select 'F.outfit_status_check [exact expected]' section, conname, pg_get_constraintdef(oid) def
  from pg_constraint where conrelid='public.daily_recommendations'::regclass and conname='daily_recommendations_outfit_status_check';

-- ==== G. 0027 streaks ===================================================
select 'G.streaks_grants [exact expected post-0027]' section, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
  from information_schema.role_table_grants where table_schema='public' and table_name='streaks' and grantee in ('anon','authenticated','service_role') group by grantee order by grantee;
select 'G.streaks_rls_owner [exact expected]' section, rowsecurity, tableowner from pg_tables where schemaname='public' and tablename='streaks';
select 'G.streaks_policies [exact expected]' section, policyname, cmd, roles::text, coalesce(qual,'') using_expr from pg_policies where schemaname='public' and tablename='streaks' order by policyname;

-- ==== H. 0028 outfit_requests ===========================================
select 'H.or_grants [exact expected post-0028]' section, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
  from information_schema.role_table_grants where table_schema='public' and table_name='outfit_requests' and grantee in ('anon','authenticated','service_role') group by grantee order by grantee;
select 'H.or_policies [exact expected]' section, policyname, cmd, roles::text, coalesce(qual,'') using_expr, coalesce(with_check,'') check_expr
  from pg_policies where schemaname='public' and tablename='outfit_requests' order by policyname;
select 'H.is_admin_fn [exact expected: secdef=t, volatility=s, search_path=public]' section,
       p.prosecdef security_definer, p.provolatile volatility, (select array_agg(cfg) from unnest(p.proconfig) cfg) proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_admin';

-- ==== J. 0021 EQUIVALENCE [exact expected] ==============================
select 'J.wi_avail_check' section, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.wardrobe_items'::regclass and conname='wardrobe_items_availability_status_check';
select 'J.in_wash_idx' section, indexdef from pg_indexes where schemaname='public' and tablename='wardrobe_items' and indexname='wardrobe_items_in_wash_since_idx';
select 'J.profiles_cols' section, column_name, data_type, is_nullable, coalesce(column_default,'(none)') from information_schema.columns
  where table_schema='public' and table_name='profiles' and column_name in ('postwear_sheet_enabled','postwear_prompt_dismissals','wash_cycle_days','laundry_return_prompt_at','laundry_wash_note_at') order by column_name;
select 'J.profiles_checks' section, conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.profiles'::regclass and conname in ('profiles_wash_cycle_days_check','profiles_postwear_dismissals_check') order by conname;
select 'J.laundry_wear_stats' section,
  (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.laundry_wear_stats'::regclass and contype='p') pk,
  (select rowsecurity from pg_tables where schemaname='public' and tablename='laundry_wear_stats')::text rls,
  (select string_agg(policyname||'('||cmd||')', ', ' order by policyname) from pg_policies where schemaname='public' and tablename='laundry_wear_stats') policies;

-- ==== K. 0022 EQUIVALENCE [exact expected] ==============================
select 'K.dr_cols' section, column_name, data_type, is_nullable, coalesce(column_default,'(none)') from information_schema.columns
  where table_schema='public' and table_name='daily_recommendations' and column_name in ('swap_candidates','base_item_ids','pre_swap_item_ids','swaps_used','options_used') order by column_name;
select 'K.dr_checks' section, conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.daily_recommendations'::regclass and conname in ('daily_recommendations_swaps_used_nonneg','daily_recommendations_options_used_nonneg') order by conname;
select 'K.drop_feedback' section,
  (select string_agg(indexname, ', ' order by indexname) from pg_indexes where schemaname='public' and tablename='drop_feedback') indexes,
  (select rowsecurity from pg_tables where schemaname='public' and tablename='drop_feedback')::text rls,
  (select string_agg(policyname||'('||cmd||')', ', ' order by policyname) from pg_policies where schemaname='public' and tablename='drop_feedback') policies;

-- ==== L. 0001 INVENTORY (baselining input; NOT exact equivalence) =======
-- 0001 is the whole base schema; exact equivalence is proven by the ISOLATED
-- 0001-0022 baseline diff (RECONCILIATION_RUNBOOK.md Stages 4-5: a temp worktree
-- with only 0001-0022 + local db reset + `db diff --linked --schema public`),
-- NOT by hand here and NOT by a full-branch diff (the branch has 0023-0028).
-- This block is an informational health check only.
select 'L.0001_inventory [informational]' section,
  (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') public_tables,
  (select count(*) from pg_policies where schemaname='public') public_policies,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') public_functions,
  (select string_agg(t.typname, ', ' order by t.typname) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e') enums,
  (select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('is_admin','handle_new_user')) key_functions,
  (select string_agg(tgname, ', ') from pg_trigger where tgname='on_auth_user_created' and not tgisinternal) auth_trigger;

-- ==== I. DATA-SAFETY PRECONDITIONS ======================================
select 'I.1 bad_availability [must be zero]' section, availability_status, count(*) n
  from public.wardrobe_items where availability_status is not null and availability_status not in ('available','in_wash','unavailable','archived') group by availability_status;
select 'I.2 range_violations [must be zero]' section,
  (select count(*) from public.wardrobe_items where formality is not null and formality not between 1 and 5) formality_oob,
  (select count(*) from public.wardrobe_items where modesty_level is not null and modesty_level not between 1 and 5) modesty_oob,
  (select count(*) from public.wardrobe_items where warmth is not null and warmth not between 1 and 5) warmth_oob,
  (select count(*) from public.wardrobe_items where pattern_boldness is not null and pattern_boldness not between 0 and 3) pattern_oob;
select 'I.3 dr_rowcount [informational]' section, count(*) n from public.daily_recommendations;
-- 0025 onboarding_step outside the allowed set — works whether or not the column
-- exists (to_jsonb ->> yields NULL when absent; NULL is allowed).
select 'I.4 bad_onboarding_step [must be zero]' section, count(*) n from public.profiles p
  where (to_jsonb(p) ->> 'onboarding_step') is not null
    and (to_jsonb(p) ->> 'onboarding_step') not in ('welcome','context','style','wardrobe','ready','completed');
select 'I.5 orphans [must be zero]' section,
  (select count(*) from public.streaks s left join auth.users u on u.id=s.user_id where u.id is null) orphan_streaks,
  (select count(*) from public.outfit_requests r left join auth.users u on u.id=r.user_id where u.id is null) orphan_outfit_requests;
-- =====================================================================
-- END READ-ONLY AUDIT. Nothing above modifies the database.
-- =====================================================================
