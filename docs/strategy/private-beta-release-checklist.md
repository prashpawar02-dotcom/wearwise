# WearWise — Private Beta Release Checklist

For inviting ~20–50 private beta users. Work top to bottom; the **Go / No-Go**
gate is at the end. Boxes are unchecked on purpose — tick them during the real
run-through on the deployed environment.

> Prerequisite: **commit and push all current work to `main`** and confirm Vercel
> Production is deploying that commit from the correct Root Directory. Much of the
> recent work is still uncommitted in the working tree.

---

## 1. Environment checklist (Vercel → Project → Settings → Environment Variables)

- [ ] `NEXT_PUBLIC_SUPABASE_URL` set (Production)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set — **server-only**, never `NEXT_PUBLIC_`
- [ ] `OPENAI_API_KEY` set — server-only (auto-tagging / drafts)
- [ ] `CRON_SECRET` set — long random string
- [ ] `NEXT_PUBLIC_POSTHOG_KEY` set (analytics on) + `NEXT_PUBLIC_POSTHOG_HOST`
- [ ] `NEXT_PUBLIC_SITE_URL` = the deployed origin (magic-link redirects)
- [ ] `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` **unset / not "true"** in Production
      (magic-link only; the dev password fallback must be off)
- [ ] `NEXT_PUBLIC_ANALYTICS_DEBUG` unset in Production
- [ ] No `.env`, `.env.local`, or `.env*.local` committed (verified: all gitignored)

Audit result: no secret is exposed as `NEXT_PUBLIC_*`; the service-role key is
referenced only in `src/lib/supabase-admin.ts` and imported only by the two
server routes (`/api/daily-drop/prepare`, `/api/cron/daily-drop/prepare`).

## 2. Database checklist

Apply **`schema.sql` first**, then migrations **0002 → 0011 in order** in the
Supabase SQL editor. All are required (the checklist below highlights the newest):

- [ ] `schema.sql` (profiles, wardrobe_items, outfit_requests, outfit_suggestions,
      feedback, worn_history, `is_admin()`, base RLS)
- [ ] 0002 auto-tagging · 0003 occasions · 0004 AI drafts
- [ ] 0005 AI usage logs
- [ ] 0006 outfit suggestion feedback
- [ ] 0007 wardrobe availability
- [ ] 0008 daily drop preferences
- [ ] 0009 daily recommendations
- [ ] 0010 server-controlled daily_recommendations insert
      (set `SUPABASE_SERVICE_ROLE_KEY` **before** applying)
- [ ] 0011 beta feedback (`beta_feedback`)

### SQL verification queries

```sql
-- Profiles: Daily Drop preference columns exist
select column_name from information_schema.columns
where table_schema='public' and table_name='profiles'
  and column_name in ('timezone','daily_drop_enabled','daily_drop_time',
                      'daily_drop_days','show_quiet_gems','weather_advice_enabled');
-- expect 6 rows

-- wardrobe_items.availability_status exists + check constraint
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='wardrobe_items' and column_name='availability_status';

-- daily_recommendations table exists
select to_regclass('public.daily_recommendations') as daily_recommendations;

-- beta_feedback table exists
select to_regclass('public.beta_feedback') as beta_feedback;

-- RLS enabled on the sensitive tables
select relname, relrowsecurity from pg_class
where relname in ('profiles','wardrobe_items','outfit_suggestions',
                  'daily_recommendations','beta_feedback');   -- relrowsecurity = true

-- Key RLS policies exist
select tablename, policyname from pg_policies
where schemaname='public'
  and tablename in ('daily_recommendations','beta_feedback','wardrobe_items','profiles')
order by tablename, policyname;

-- No duplicate daily recommendations per user/date (expect ZERO rows)
select user_id, local_date, count(*) from public.daily_recommendations
group by user_id, local_date having count(*) > 1;
```

## 3. Auth checklist

- [ ] Magic-link email sign-in works end-to-end (redirect back to `NEXT_PUBLIC_SITE_URL`)
- [ ] Password dev login is **disabled** in Production (flag off → no "Create account")
- [ ] Protected routes redirect: hitting `/dashboard` while signed out → `/login?next=…`
- [ ] API routes handle their own auth (middleware excludes `/api`; the manual
      prepare route checks the session, the cron route checks the bearer secret)
- [ ] Cron route rejects a missing/wrong `Authorization` header with **401**

## 4. Core user QA

- [ ] Sign up (magic link) and land on onboarding
- [ ] Onboarding saves (name, age range, city, styles) → dashboard
- [ ] Upload clothes (single + batch of ~10)
- [ ] AI tagging completes (ready / needs-review / graceful fail)
- [ ] Open an item → review/edit details → "Looks good"
- [ ] Closet Board renders zones, counts, and availability summary
- [ ] Mark an item "in wash" then "available" (updates + excluded from generation)
- [ ] Style Me: pick occasion + optional note → request created
- [ ] View outfit result page (approved look renders with signed images)
- [ ] Daily Drop preferences: enable, set custom time, save + reload persists
- [ ] Prepare Daily Drop (beta button) → Today's Drop card appears
- [ ] "Wear this" marks worn + updates last-worn
- [ ] Submit feedback (`/profile/feedback`) → success state
- [ ] Log out, then log back in

## 5. Admin QA

- [ ] Admin (profiles.is_admin=true) can reach `/admin`
- [ ] Pending outfit requests list loads
- [ ] Approve a valid suggestion (blocked if structurally invalid)
- [ ] Reject a suggestion
- [ ] Retry AI drafts (generate-drafts)
- [ ] Suggestion images load (signed URLs)
- [ ] User list loads
- [ ] AI usage logs page loads (`/admin/ai-usage`)

## 6. Mobile / responsive QA

- [ ] iPhone SE (320–375px): no horizontal scroll, cards fit
- [ ] Standard iPhone (390–414px)
- [ ] Android Chrome
- [ ] Desktop Chrome (centered mobile-first column, ~440px shell)
- [ ] Tap targets ≥ ~40px; bottom nav (Today/Wardrobe/Style Me/Plan/You) usable
- [ ] Loading skeletons show on navigation; no layout shift when content lands

## 7. Privacy / security checklist

- [ ] Wardrobe images are **not** public — private bucket, short-lived signed URLs only
- [ ] Signed URLs generated at render only; never stored in `daily_recommendations`
      or `beta_feedback`
- [ ] No service-role key in the client bundle (confined to `supabase-admin.ts`,
      server routes only)
- [ ] Analytics sends **no** image URLs/paths, item names, email, or names — only
      counts/categories/booleans/status codes
- [ ] `beta_feedback` stores only typed message + type + coarse context (+ user_id)
- [ ] Cron logs contain no secrets, wardrobe data, or full profiles (reason codes only)
- [ ] Notifications are NOT live (no push/email/web-push)
- [ ] No public social/sharing routes

## 8. Analytics checklist (verify events land in PostHog)

- [ ] `onboarding_completed`
- [ ] `wardrobe_item_uploaded`
- [ ] `closet_board_viewed`
- [ ] `style_me_started`
- [ ] `outfit_request_created`
- [ ] `daily_drop_preferences_saved`
- [ ] `daily_drop_prepare_clicked`
- [ ] `daily_drop_prepare_result`
- [ ] `daily_drop_worn`
- [ ] `feedback_submitted`

(Also present: `wardrobe_item_tagged`, `wardrobe_availability_changed`,
`outfit_request_failed`, `daily_drop_viewed`, `weather_city_saved`,
`feedback_started`, `feedback_failed`, admin approve/reject/retry.)

## 9. Feedback checklist

- [ ] Feedback form submits and shows the thank-you state
- [ ] Validation: message required, 10–1000 chars, no double submit
- [ ] A normal user cannot read others' feedback (no user SELECT policy)
- [ ] Admin can review rows in Supabase (`beta_feedback_admin_read` via `is_admin()`)

## 10. Known limitations to tell beta users

- Daily Drop **scheduled preparation is still being tested**; on the current plan
  it runs once a day (~7:00 AM IST) and best serves users near that time.
- **Notifications are not live yet** — open the app to see your daily pick.
- Recommendations **improve with more uploaded clothes** (aim for 10+).
- Weather advice **needs a city** saved in You.
- No virtual try-on. No shopping recommendations. No social sharing.

## 11. Launch decision — Go / No-Go

**GO if all are true:**
- [ ] All critical user flows pass (upload, Style Me, Daily Drop, feedback)
- [ ] No broken auth (magic link works; protected routes redirect)
- [ ] No exposed private images (signed URLs only)
- [ ] Production build succeeds (`npm run build`)
- [ ] Feedback works
- [ ] Analytics events arrive in PostHog
- [ ] Cron route returns 401 (unauth) and a JSON summary (authed)

**NO-GO if any are true:**
- [ ] Uploads fail
- [ ] Auth fails
- [ ] Private images leak (unsigned/public)
- [ ] RLS broken (cross-user reads possible)
- [ ] Daily Drop crashes the dashboard
- [ ] Production deploy 404s core routes (`/api/health`, `/dashboard`)
- [ ] Required migrations missing

---

## Post-beta fixes (non-critical, documented — do NOT block launch)

- **Admin pagination**: request/user lists are unpaginated; fine at beta scale,
  add pagination before wider rollout.
- **Server-side analytics**: cron/prepare outcomes and `weather_context_loaded`
  are not tracked (client-only MVP).
- **Cron cadence**: Hobby = once/day; custom-time precision needs Vercel Pro or an
  external scheduler. Midnight-window wraparound (~23:30–23:59) not handled.
- **Consent banner**: PostHog is cookie-based; add a consent gate before wider/EU
  rollout.
- **`/api/health`**: temporary deploy probe — remove once deployment is confirmed.
- **Column-level UPDATE restriction** on `daily_recommendations` (clients can
  currently update any owned column; tighten to lifecycle fields later).
