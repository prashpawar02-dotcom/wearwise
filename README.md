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

## Deploy to Vercel (private beta)

This is the exact sequence to get the closed-beta MVP live for a handful of
phone users. No new features — just configuration.

### 1. Environment variables (set in BOTH places)

| Variable | Where | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase -> Settings -> API | Yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase -> Settings -> API | Yes | Anon key (safe in browser; RLS protects data) |
| `NEXT_PUBLIC_SITE_URL` | you | Yes | Your deployed origin, e.g. `https://wearwise.vercel.app` |
| `OPENAI_API_KEY` | OpenAI | Yes | **Server-side only** — never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` | you | No | Dev only. Leave **unset** in production (magic-link only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | No | Not used by the app today. If ever set, server-side only |

In Vercel: **Project -> Settings -> Environment Variables** (scope: Production).
Locally: copy `.env.example` to `.env.local`.

### 2. Database — run migrations in the Supabase SQL editor

For a **fresh** Supabase project, run, in order:

1. `supabase/schema.sql` — all tables, RLS, the private `wardrobe` bucket, and the
   profile-on-signup trigger. (This already includes the auto-tag, occasions, and
   AI-draft columns, so migrations `0002`–`0004` are baked in and need not be run
   again on a fresh DB — they are idempotent `add column if not exists` no-ops.)
2. `supabase/migrations/0005_ai_usage_logs.sql` — the `ai_usage_logs` metering table
   (admin-read-only). **Not** part of `schema.sql`, so it must be run separately.

For an **existing** DB created before these migrations, run any you have not yet
applied, in order: `0002_auto_tagging.sql`, `0003_occasions.sql`,
`0004_ai_outfit_drafts.sql`, `0005_ai_usage_logs.sql`.

### 3. Supabase Auth config

- **Authentication -> URL Configuration**
  - Site URL: `https://your-app.vercel.app`
  - Redirect URLs: add `https://your-app.vercel.app/auth/callback`
    (keep `http://localhost:3000/auth/callback` for local dev).
- **Authentication -> Providers -> Email**: keep **magic link** enabled.
  Email confirmation can stay on for real users.

### 4. Deploy

- Import the repo into Vercel (Framework preset: **Next.js**; build command
  `next build`; no extra config).
- Add the env vars above, then **Deploy**.
- After the first deploy, confirm `NEXT_PUBLIC_SITE_URL` matches the live URL and
  redeploy if you changed it.

### 5. Make yourself admin, then invite 3 users

1. Open the live URL on your phone, sign in once with your email (creates your user).
2. In Supabase SQL editor:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where lower(email) = lower('YOUR_EMAIL'));
   ```
3. Share the URL with your 3 beta testers. Each signs in with their own email
   (magic link). They stay non-admin and see only **approved** looks.
4. You curate from `/admin/requests`, generate AI drafts, **approve**, and only then
   do testers see suggestions. Watch real cost at `/admin/ai-usage`.

### Pre-invite safety checklist (all currently true in the code)

- [x] Magic-link login only in production (password fallback gated behind
  `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN`, unset = off).
- [x] `/admin/*` is admin-only (middleware auth + `requireAdmin()` on every page);
  the draft-generation API also re-checks `is_admin`.
- [x] Wardrobe items and photos are private (RLS + private storage bucket; signed
  URLs only). Storage is **not** public.
- [x] Users see only `status = 'approved'` suggestions (RLS). AI drafts are never
  auto-approved.
- [x] `OPENAI_API_KEY` is read server-side only; never shipped to the browser.
- [x] Service-role key is not referenced by app code.

## Auto-tagging (v0.2)

Uploading a photo is the only thing the user does — WearWise identifies the rest with
AI (OpenAI `gpt-4o-mini`). Manual tagging still exists but is now **optional correction**,
not a required step.

**Flow:** upload photo → image saved privately → row created with `ai_tag_status='analyzing'`
→ the item screen calls the server route `/api/wardrobe/[itemId]/autotag` → the route reads
the private image server-side, sends it to the model, validates the result against the
allowed values, and updates the row → the user sees a confirmation card with **Looks good**
and a secondary **Edit details** link. If confidence is low the card shows a "please check"
note; if the AI fails, it falls back to the manual edit form.

**Setup:** add your key to `.env.local` (server-side only — never `NEXT_PUBLIC_`):

```
OPENAI_API_KEY=sk-...
```

Then run the DB migration `supabase/migrations/0002_auto_tagging.sql` in the Supabase SQL
editor (adds the auto-tag columns to `wardrobe_items`; additive, RLS unchanged). Restart
`npm run dev` so the new env var loads.

**Privacy:** the photo is read server-side and inlined to the model as base64 — it is never
made public and no public/signed URL is handed out. RLS is unchanged; the key never reaches
the browser. The upload screen shows: *"We use AI to identify clothing type, colour, and
style from your wardrobe photos. Your wardrobe stays private."*

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
