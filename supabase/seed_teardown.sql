-- =====================================================================
-- WearWise Beta — REMOVE DEMO SEED  (run before production)
-- Deletes every row created by seed.sql for the given account.
-- Does not touch any real data the user created themselves.
-- =====================================================================

do $$
declare
  target_email text := 'REPLACE_WITH_YOUR_LOGIN_EMAIL';
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(target_email);
  if uid is null then
    raise notice 'No auth user for %, nothing to remove.', target_email;
    return;
  end if;

  -- Suggestions cascade from the request; feedback cascades from suggestions.
  delete from public.outfit_requests where user_id = uid and notes = 'seed';
  delete from public.wardrobe_items   where user_id = uid and notes = 'seed';

  -- Optional: revoke the demo admin flag (leave profile row intact).
  update public.profiles set is_admin = false where id = uid;

  raise notice 'Demo seed removed for %.', target_email;
end $$;
