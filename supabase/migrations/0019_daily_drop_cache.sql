-- =====================================================================
-- 0019 — Token-saving caches (Module B).
-- alt_item_ids: pre-computed "another option" candidates stored with the
-- nightly drop so swaps/options read cache instead of recomputing or
-- calling the LLM. generation_cache memoizes identical generation inputs.
-- =====================================================================
alter table daily_recommendations
  add column if not exists alt_item_ids jsonb not null default '[]',  -- [[itemId,...],...]
  add column if not exists alt_cursor int not null default 0;

create table if not exists generation_cache (
  input_hash text primary key,        -- sha256 of {user, wardrobe_version, occasion, weather_bucket}
  user_id uuid,
  output jsonb not null,              -- cleaned suggestions (item ids only)
  created_at timestamptz default now()
);
create index if not exists generation_cache_user_idx on generation_cache (user_id, created_at desc);
alter table generation_cache enable row level security;
-- no policies: service role only.
