-- =====================================================================
-- 0012 — Subscriptions (Free trial -> Pro), billing idempotency,
-- Manual Analysis purchases, and DB-level free-tier caps.
-- Additive only. Writes to these tables are SERVICE ROLE ONLY.
-- =====================================================================

create table if not exists subscriptions (
  user_id uuid primary key references auth.users on delete cascade,
  plan text not null default 'free',              -- 'free' | 'pro'
  status text not null default 'trialing',        -- trialing|active|past_due|canceled|expired
  trial_ends_at timestamptz,                      -- now()+7 days at signup
  current_period_end timestamptz,
  razorpay_subscription_id text,
  razorpay_customer_id text,
  updated_at timestamptz default now()
);
alter table subscriptions enable row level security;
create policy "own subscription read" on subscriptions
  for select using (auth.uid() = user_id);
-- writes ONLY via service role (webhook/server). No client write policy.

-- Webhook idempotency: one row per processed Razorpay event id.
create table if not exists billing_events (
  event_id text primary key,
  event_type text not null,
  payload_summary jsonb default '{}',
  processed_at timestamptz default now()
);
alter table billing_events enable row level security;
-- no policies: service role only.

-- One-time Manual Wardrobe Analysis purchases (Rs.199 primer).
create table if not exists analysis_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  razorpay_order_id text unique,
  status text not null default 'created',   -- created|paid|delivered|failed
  report jsonb,                              -- generated report content
  created_at timestamptz default now(),
  delivered_at timestamptz
);
alter table analysis_purchases enable row level security;
create policy "own analysis read" on analysis_purchases
  for select using (auth.uid() = user_id);
-- writes service role only.

-- ---------- helper: is the user effectively Pro right now? ----------
create or replace function public.is_pro(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from subscriptions s
      where s.user_id = uid
        and (s.status = 'active'
             or (s.status = 'trialing' and s.trial_ends_at > now()))
    )
    or exists (select 1 from profiles p where p.id = uid and p.is_premium);
$$;

-- ---------- start the 7-day trial the moment a profile exists ----------
create or replace function public.start_trial_on_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into subscriptions (user_id, plan, status, trial_ends_at)
  values (new.id, 'free', 'trialing', now() + interval '7 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_start_trial on profiles;
create trigger trg_start_trial after insert on profiles
  for each row execute function public.start_trial_on_profile();

-- Backfill: existing users get a trial from now (fair for beta users).
insert into subscriptions (user_id, plan, status, trial_ends_at)
select id, 'free', 'trialing', now() + interval '7 days' from profiles
on conflict (user_id) do nothing;

-- ---------- DB-enforced free cap: 15 wardrobe items ----------
-- Defense-in-depth: the API also enforces via getEntitlements, but a hostile
-- client inserting directly through PostgREST hits this trigger.
create or replace function public.enforce_wardrobe_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_pro(new.user_id) then return new; end if;
  if (select count(*) from wardrobe_items where user_id = new.user_id) >= 15 then
    raise exception 'wardrobe_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_wardrobe_cap on wardrobe_items;
create trigger trg_wardrobe_cap before insert on wardrobe_items
  for each row execute function public.enforce_wardrobe_cap();
