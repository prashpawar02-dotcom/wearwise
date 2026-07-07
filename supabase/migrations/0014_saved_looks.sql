-- =====================================================================
-- 0014 — Lookbook (saved looks). Owner-scoped RLS; free cap of 5 enforced
-- at the DB as defense-in-depth (API enforces via getEntitlements too).
-- =====================================================================
create table if not exists saved_looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  suggestion_id uuid,                 -- optional link to an outfit suggestion
  recommendation_id uuid,             -- optional link to a daily recommendation
  title text,
  item_ids uuid[] not null default '{}',
  created_at timestamptz default now()
);
create index if not exists saved_looks_user_idx on saved_looks (user_id, created_at desc);
alter table saved_looks enable row level security;
create policy "own looks all" on saved_looks
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.enforce_looks_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_pro(new.user_id) then return new; end if;
  if (select count(*) from saved_looks where user_id = new.user_id) >= 5 then
    raise exception 'lookbook_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_looks_cap on saved_looks;
create trigger trg_looks_cap before insert on saved_looks
  for each row execute function public.enforce_looks_cap();
