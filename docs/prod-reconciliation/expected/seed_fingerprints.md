# 0020 seed — repository-derived expected fingerprints (read-only reference)

Canonical, reproducible fingerprints computed from the migration `0020_engine_v2_schema.sql`
seed literals using type-normalized `jsonb_agg` (order-stable, null-safe, numeric-normalized).
Verified this session: hosted values equal these repository-derived values exactly.

| Table | Expected md5 |
|---|---|
| engine_config | `6415de2e748e18d36e3b2162444fa1bb` |
| occasion_profiles | `cc77b28b87bfcd450a13c0008775b904` |
| ethnic_pairing_rules | `31b7908969b2bdd8b4ae98818f203fac` |

Hosted fingerprint SQL (in `prod_audit_readonly.sql`, block B.6):
```sql
-- engine_config
md5(jsonb_agg(jsonb_build_object('k',key,'v',value::text) order by key)::text)
-- occasion_profiles
md5(jsonb_agg(jsonb_build_object('o',occasion,'ft',formality_target::text,'fmin',formality_min::text,
  'fmax',formality_max::text,'mp',max_pieces::text,'cm',round(comfort_multiplier::numeric,2)::text,
  'bf',bypass_formality::text,'ap',accessory_policy,'ao',activewear_only::text,'l',label) order by occasion)::text)
-- ethnic_pairing_rules
md5(jsonb_agg(jsonb_build_object('k',kind,'s',subject_key,'o',object_key,'sc',scope,'m',message)
  order by subject_key,object_key,kind)::text)
```

To REGENERATE the expected values independently (repo-derived, read-only), run the same
expressions over a `VALUES (...)` list built from the 0020 seed rows (see the session's
`ec_expected/op_expected/er_expected` CTEs). The hosted and expected md5 must be identical
before approving the 0020 ledger baseline.
