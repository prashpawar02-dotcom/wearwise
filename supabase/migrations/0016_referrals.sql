-- =====================================================================
-- 0016 — Share/vote growth loop + referrals.
-- share_tokens: NO broad RLS select — the public vote route reads by token
-- via service role and is rate-limited. No PII in this table.
-- =====================================================================
create table if not exists share_tokens (
  token text primary key,             -- random, URL-safe
  user_id uuid not null references auth.users on delete cascade,
  suggestion_ids uuid[] not null default '{}',
  options jsonb not null default '[]',  -- [{key,title,item_ids}] snapshot (ids only)
  votes jsonb not null default '{}',    -- {optionKey: count}
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
alter table share_tokens enable row level security;
create policy "own tokens read" on share_tokens for select using (auth.uid() = user_id);
-- inserts/updates via service role (share API), public reads via service role only.

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users on delete cascade,
  referred_user_id uuid references auth.users on delete set null,
  source_token text,
  credited boolean not null default false,
  created_at timestamptz default now()
);
alter table referrals enable row level security;
create policy "own referrals read" on referrals for select using (auth.uid() = referrer_user_id);
-- writes service role only.
