# WearWise — Beta

> Know what to wear today, from clothes you already own.

A mobile-first PWA that helps Indian women (22–40) decide daily outfits from their
existing wardrobe. Closed-beta MVP — suggestions are **human-in-the-loop** (a stylist
curates and approves looks before the user sees them).

## Stack
Next.js 14 (App Router) · TypeScript · Tailwind · shadcn-style UI · Supabase
(Auth + Postgres + Storage) · Vercel-ready.

## Getting started

1. **Install**
   ```bash
   npm install
   ```

2. **Create a Supabase project**, then in the SQL editor run:
   ```
   supabase/schema.sql
   ```
   This creates all tables, RLS policies, the private `wardrobe` storage bucket, and a
   trigger that auto-creates a profile on signup.

3. **Configure env** — copy `.env.example` to `.env.local` and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```
   In Supabase → Authentication → URL config, add `http://localhost:3000/auth/callback`
   as a redirect URL.

4. **Run**
   ```bash
   npm run dev
   ```

5. **Make yourself an admin** (to access `/admin`): after signing in once, run in SQL:
   ```sql
   update public.profiles set is_admin = true where id = '<your-auth-user-id>';
   ```

## Demo seed (optional, for testing)

A small, self-contained demo lives in `supabase/seed.sql`. It attaches sample data to
**your real account** — it does *not* create fake users, expose photos, or weaken RLS.
Everything is tagged `seed` so it's trivial to remove later.

It creates: 1 demo profile, 10 wardrobe items, 1 outfit request, and 3 suggestions —
**1 already approved + 2 drafts** — so you can watch the approval gate work.

**Run it**

1. Make sure `schema.sql` has been run.
2. Sign in to the app once with your email (this creates your auth user).
3. Open `supabase/seed.sql`, set `target_email` to that email, and run the whole file in
   the Supabase SQL editor.

**Walk the full loop** (single account — cleanest privacy test)

1. **User sees wardrobe** — go to `/wardrobe`: 10 items appear (placeholder tiles, since
   no real photos are uploaded — photos stay private). Open any item to edit/tag/delete.
2. **User sees the approval gate** — open the request from the dashboard, or `/outfits/<id>`.
   You see **only 1 look** (the pre-approved one). Drafts are hidden by RLS. ✅
3. **(Optional) user creates a fresh request** — `/occasion/new`, pick an occasion. It'll
   show "we're curating" until an admin approves looks for it.
4. **Admin approves** — grant yourself admin for a moment:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where lower(email) = lower('YOUR_EMAIL'));
   ```
   Refresh `/admin/requests`, open the seeded request, and **Approve** Looks 2 and 3
   (you can also build a new look here).
5. **User sees 3 approved looks** — revoke admin again to view as a pure user:
   ```sql
   update public.profiles set is_admin = false
   where id = (select id from auth.users where lower(email) = lower('YOUR_EMAIL'));
   ```
   Reload `/outfits/<id>` → all **3 looks** now show. ✅
6. **Worn Today** — tap **Wear this today** on a look (logs `worn_history`, stamps
   `last_worn_at` on those items).
7. **Feedback** — tap **Give feedback**, rate the look, submit (writes `feedback`).

> Why the admin toggle? Keeping the demo account non-admin proves the privacy gate in
> step 2 out of the box. If you'd rather not toggle, set `grant_admin := true` at the top
> of `seed.sql` and skip steps 4–5's SQL — but then the user view also shows drafts
> (admins can read everything by design).

**Remove the demo** before production: set `target_email` in `supabase/seed_teardown.sql`
and run it. Then delete `supabase/seed.sql` and `supabase/seed_teardown.sql`.

## User flow
Landing (`/`) → Login (`/login`, magic link) → Onboarding (`/onboarding`) →
Dashboard (`/dashboard`) → Wardrobe (`/wardrobe`, `/wardrobe/upload`, `/wardrobe/[itemId]`)
→ New occasion (`/occasion/new`) → Outfit ideas (`/outfits/[requestId]`) →
Feedback (`/feedback/[suggestionId]`).

## Admin flow
`/admin` → users (`/admin/users`) and requests (`/admin/requests`). Open a request
(`/admin/requests/[requestId]`) to build up to 3 looks from the user's wardrobe and
**approve** them. Users only ever see *approved* suggestions (enforced by RLS).

## Privacy
- Wardrobe items and photos are **private by default**. The `wardrobe` storage bucket is
  not public; photos are served via short-lived signed URLs.
- RLS scopes every table to the owning user; admins get read access to wardrobes (to
  curate) and full access to suggestions.
- Users can delete any wardrobe item (removes the row **and** the stored photo).

## Project structure
```
src/
  app/            # routes (App Router)
  components/ui/  # shadcn-style primitives
  components/nav/ # header, bottom nav, sign-out
  lib/            # supabase clients, auth guards, types, signed images
middleware.ts     # session refresh + route protection
supabase/schema.sql
```

## Not in scope (by design)
No marketplace, virtual try-on, 3D avatar, social feed, shopping, or native app. The
beta solves exactly one problem: *what should I wear today?*
