-- =====================================================================
-- WearWise Beta — DEMO SEED  (safe to delete before production)
-- ---------------------------------------------------------------------
-- This does NOT create fake auth users and does NOT weaken RLS or make
-- any photo public. It attaches demo data to a REAL account that has
-- already signed in once (via the magic-link login).
--
-- HOW TO USE
--   1. Run schema.sql first (once).
--   2. Sign in to the app once with your email so an auth user exists.
--   3. Set TARGET_EMAIL below to that same email.
--   4. Run this whole file in the Supabase SQL editor.
--
-- Re-running is safe: it clears any previous demo rows (tagged 'seed')
-- for this user and recreates them.
--
-- To remove all demo data later, run supabase/seed_teardown.sql.
-- =====================================================================

do $$
declare
  -- >>> EDIT THIS to the email you log in with <<<
  target_email text := 'REPLACE_WITH_YOUR_LOGIN_EMAIL';

  -- Leave false to test the privacy gate as a normal user (recommended).
  -- The README shows a one-line SQL to grant admin when you want to approve.
  grant_admin   boolean := false;

  uid   uuid;
  ids   uuid[];
  r_id  uuid;
begin
  if target_email = 'REPLACE_WITH_YOUR_LOGIN_EMAIL' then
  raise notice 'Skipping optional user-specific seed because target_email is still the placeholder.';
  return;
end if;

select id
into uid
from auth.users
where lower(email) = lower(target_email);

if uid is null then
  raise notice 'Skipping optional user-specific seed because no local auth user exists for %.', target_email;
  return;
end if;

  -- ---- profile -------------------------------------------------------
  insert into public.profiles (id, full_name, age_range, city, style_preferences, is_admin, onboarded)
  values (uid, 'Demo User', '26-30', 'Pune', array['Minimal','Elegant'], grant_admin, true)
  on conflict (id) do update set
    full_name         = excluded.full_name,
    age_range         = excluded.age_range,
    city              = excluded.city,
    style_preferences = excluded.style_preferences,
    is_admin          = excluded.is_admin,
    onboarded         = true;

  -- ---- clean any previous demo rows (idempotent) ---------------------
  -- Deleting the seed request cascades to its suggestions.
  delete from public.outfit_requests where user_id = uid and notes = 'seed';
  delete from public.wardrobe_items   where user_id = uid and notes = 'seed';

  -- ---- 10 wardrobe items ---------------------------------------------
  -- image_path points at the private 'wardrobe' bucket. No files are
  -- uploaded, so the app shows a placeholder tile (photos stay private).
  -- Upload a real photo from /wardrobe/<id> to see the full visual.
  with ins as (
    insert into public.wardrobe_items
      (user_id, image_path, category, color, pattern, occasion_tags, notes)
    values
      (uid, uid||'/seed-01.jpg', 'Kurta',     'Maroon',      'Embroidered', array['ethnic','festive']::occasion_type[],               'seed'),
      (uid, uid||'/seed-02.jpg', 'Top',       'Ivory',       'Solid',       array['work','casual']::occasion_type[],                   'seed'),
      (uid, uid||'/seed-03.jpg', 'Bottom',    'Charcoal',    'Solid',       array['work']::occasion_type[],                            'seed'),
      (uid, uid||'/seed-04.jpg', 'Dupatta',   'Gold',        'Embroidered', array['ethnic','festive','family_function']::occasion_type[],'seed'),
      (uid, uid||'/seed-05.jpg', 'Saree',     'Plum',        'Floral',      array['festive','family_function','party']::occasion_type[],'seed'),
      (uid, uid||'/seed-06.jpg', 'Dress',     'Sage Green',  'Printed',     array['casual','party']::occasion_type[],                  'seed'),
      (uid, uid||'/seed-07.jpg', 'Footwear',  'Tan',         'Solid',       array['ethnic','festive']::occasion_type[],                'seed'),
      (uid, uid||'/seed-08.jpg', 'Outerwear', 'Indigo',      'Solid',       array['casual','travel']::occasion_type[],                 'seed'),
      (uid, uid||'/seed-09.jpg', 'Bottom',    'Black',       'Solid',       array['casual','work','travel']::occasion_type[],          'seed'),
      (uid, uid||'/seed-10.jpg', 'Top',       'Rose',        'Printed',     array['casual','college']::occasion_type[],                'seed')
    returning id
  )
  select array_agg(id) into ids from ins;

  -- ---- 1 outfit request ----------------------------------------------
  insert into public.outfit_requests (user_id, occasion, notes, status)
  values (uid, 'work', 'seed', 'in_review')
  returning id into r_id;

  -- ---- 3 suggestions: Look 1 APPROVED, Looks 2 & 3 DRAFT -------------
  -- Start with one approved look so the user immediately sees the gate
  -- working (only approved looks are visible). Approve the other two in
  -- /admin to reveal all three.
  insert into public.outfit_suggestions
    (request_id, user_id, title, description, item_ids, status, position, approved_by, approved_at)
  values
    (r_id, uid, 'Easy office elegance',
      'Crisp ivory top with charcoal trousers — polished and comfortable for a full work day.',
      array[ids[2], ids[3], ids[7]], 'approved', 1, uid, now()),
    (r_id, uid, 'Smart & relaxed',
      'A softer take: rose printed top with black palazzo and a denim layer for the commute.',
      array[ids[10], ids[9], ids[8]], 'draft', 2, null, null),
    (r_id, uid, 'Desk-to-dinner',
      'Sage dress that carries you from the office into an evening out, minimal accessories.',
      array[ids[6], ids[8], ids[7]], 'draft', 3, null, null);

  raise notice 'Seed complete for % (uid %). is_admin=%. Items=10, request=1, suggestions=3 (1 approved).',
    target_email, uid, grant_admin;
end $$;
