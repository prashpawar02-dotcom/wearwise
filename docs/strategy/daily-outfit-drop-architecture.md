# Daily Outfit Drop — Backend Architecture Plan

Status: **Design only.** No production notifications, cron jobs, push providers, or
schema changes ship in this pass. This document decides the shape before we build.

Author pass: architecture-plan-only. Scope guardrail: WearWise MVP principle —
"one painful problem, one simple solution: what should I wear today?"

---

## 1. Summary — recommended MVP architecture

Prepare one outfit per user per local date, cache it in a dedicated table, and let
the **already-authenticated** Today screen read it. Treat notifications as a *thin,
text-only* delivery layer bolted on **after** the prepare-and-cache loop is proven.

Recommended MVP path, in order:

1. **Prepare + cache** a daily recommendation server-side (new `daily_recommendations`
   table + two profile columns). This is the real work and the real value.
2. **Trigger** it with **Vercel Cron → a protected Next.js route handler** that runs
   every 15–30 min and prepares drops for users whose local drop-time has arrived.
3. **Deliver** with **PWA Web Push** as the first channel — but only after step 1–2
   are solid. Until then, the drop is "pull" (user opens Today and it's already there),
   which delivers the core value with zero notification risk.
4. **Deep-link** notifications to `/dashboard?drop=today`.

Rationale: the valuable, testable, privacy-safe part is *preparing the right outfit
and having it ready when the user opens the app*. Notifications only change *how the
user is reminded*. Building prepare+cache first means every later channel (web push,
email, Expo, WhatsApp) is a swap at the edge, not a rebuild.

---

## 2. What already exists (checked before proposing anything)

| Need | Existing support | Gap |
|---|---|---|
| City preference | `profiles.city` (text, nullable) | none — reuse as-is |
| Wardrobe availability | `wardrobe_items.availability_status` = `available` \| `in_wash` \| `unavailable` (migration 0007) | none — reuse as-is |
| Weather | `getWeatherContext(city)` server-side (Open-Meteo, returns `null` on failure, never throws) | none — reuse as-is |
| Outfit shape / item refs | `outfit_suggestions.item_ids uuid[]`, `title`, `description`, `ai_confidence`, `source` | model is **request-driven** (needs an `outfit_request`), status enum is `draft/approved/rejected`, human-in-the-loop. Wrong lifecycle for a system-generated daily drop |
| Notification preference | `profile/daily-drop-preferences.tsx` is **preview-only, not persisted** | no columns, no timezone, no persistence |
| Feedback / learning | `outfit_suggestion_feedback` (migration 0006), `wardrobe_items.last_worn_at` | reusable signal source; no "wore today's drop" write path yet |

Conclusion: **city, availability, and weather are already covered.** We need (a) a
small number of persisted notification-preference columns on `profiles`, and (b) one
new cache table for the daily recommendation. Do **not** overload `outfit_suggestions`
— its request/approval lifecycle would force fake `outfit_requests` rows and muddy the
admin queue.

---

## 3. Data model proposal

### 3a. `profiles` — additive columns (notification preferences)

Keep it to the minimum that the loop actually reads. Everything defaults to a safe,
opted-**out**, privacy-first state.

```sql
alter table public.profiles
  add column if not exists timezone            text,            -- IANA, e.g. 'Asia/Kolkata'; null => fall back to a default tz
  add column if not exists daily_drop_enabled  boolean not null default false,       -- master opt-in (off until user turns it on)
  add column if not exists daily_drop_time     time    not null default '07:30',      -- preferred local drop time
  add column if not exists daily_drop_days      smallint[] not null default '{0,1,2,3,4,5,6}', -- 0=Sun..6=Sat; active days
  add column if not exists show_quiet_gems      boolean not null default true,        -- surface under-worn "quiet gem" items
  add column if not exists weather_advice_enabled boolean not null default true;      -- include weather line in the drop
```

Notes:
- `daily_drop_enabled` is the single opt-in gate. If false, we never prepare or notify.
- `timezone` + `daily_drop_time` + `daily_drop_days` are the scheduling inputs. Storing
  timezone on the profile (not inferring per-request) is what makes multi-timezone
  correct later without a rebuild.
- These are covered by the existing `profiles_update_own` RLS policy (user can edit
  only their own row) — **no new policy needed** for preferences.

### 3b. `daily_recommendations` — the cache (new table, migration 0008)

One row per user per local date. This is the "today's pick is ready" record.

```sql
create table if not exists public.daily_recommendations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  local_date     date not null,                 -- the user's LOCAL calendar date this drop is for
  occasion       occasion_type,                 -- best-guess context (nullable; defaults to 'casual' at prepare time)
  context_label  text,                          -- human label carried alongside the enum, e.g. "Workday"
  weather_summary text,                          -- SHORT text only, e.g. "28°C, light rain". null if weather unavailable
  weather_available boolean not null default false,
  item_ids       uuid[] not null default '{}',  -- references wardrobe_items.id (availability-filtered at prepare time)
  reasoning      text,                          -- "why it works" copy
  daily_insight  text,                          -- one calm insight line
  confidence     real,                          -- optional 0..1 match score if the generator provides one
  status         text not null default 'prepared', -- prepared | opened | worn | skipped | failed
  fail_reason    text,                          -- set when status='failed' (too_few_items | no_city | generation_error | ...)
  notified_at    timestamptz,                   -- when a notification was queued/sent (null until delivery layer exists)
  opened_at      timestamptz,
  worn_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint daily_recommendations_status_check
    check (status in ('prepared','opened','worn','skipped','failed')),
  constraint daily_recommendations_user_date_unique
    unique (user_id, local_date)                 -- ONE recommendation per user per local date
);

create index if not exists daily_recommendations_user_date_idx
  on public.daily_recommendations(user_id, local_date desc);
```

Design decisions:
- **Uniqueness `(user_id, local_date)`** enforces one-primary-outfit-per-morning at
  the database level. The prepare job uses `insert ... on conflict (user_id, local_date)
  do nothing` (or `do update` only when re-preparing a `failed` row) so a cron that
  runs every 15 min is idempotent and never produces duplicates.
- **`local_date`, not a timestamp** — the "one per day" contract is about the user's
  calendar day in *their* timezone. Compute it from `profiles.timezone` at prepare time.
- **No image URLs, ever.** The table stores `item_ids` only. Signed URLs are resolved
  at read time, server-side, inside the authenticated Today screen — exactly like the
  dashboard does today. Signed URLs never land in this table or any payload.
- **`status`** as a checked text column (matching the codebase convention used for
  `availability_status`) rather than a new enum type — cheaper to evolve, one migration.

### 3c. Wore-it confirmation

Reuse existing signals; add no third table:
- On "Wore it," set `daily_recommendations.status='worn'`, `worn_at=now()`, and
  update each chosen item's `wardrobe_items.last_worn_at` (owner-scoped write, same as
  existing wardrobe updates). That closes the learning loop using data we already track.
- "Swap one item" / "Another option" mutate the cached row's `item_ids` (and may bump
  `status` back to `prepared`); they do not create new rows.

### RLS for `daily_recommendations`

Follow the established owner-scoped, append-controlled pattern (mirrors 0006/0007):

```sql
alter table public.daily_recommendations enable row level security;

-- Read: owner only.
create policy "daily_rec_select_own" on public.daily_recommendations
  for select using (user_id = auth.uid());

-- Update: owner only (open/wear/skip/swap from the authenticated app).
create policy "daily_rec_update_own" on public.daily_recommendations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- INSERT is performed by the prepare job using the service-role key (bypasses RLS),
-- NOT by clients. Do NOT add a client insert policy — clients never create drops.
-- (Service role is local/server-only per project security rules; never NEXT_PUBLIC_*.)
```

---

## 4. Scheduling recommendation

**Recommended MVP: Vercel Cron → a protected Next.js route handler.**

- Add a route like `app/api/cron/prepare-daily-drops/route.ts` (implementation is a
  *later* pass — not this one).
- Vercel Cron hits it on a fixed cadence (every 15 or 30 min). Each run:
  1. Compute "now" in each candidate user's timezone.
  2. Select opted-in users (`daily_drop_enabled = true`) whose local weekday is in
     `daily_drop_days` and whose `daily_drop_time` falls within the window just passed,
     **and** who don't already have a `daily_recommendations` row for their `local_date`.
  3. Prepare + cache the drop for each (availability-filtered, weather-optional).
- **Protect the route**: require a secret header/`CRON_SECRET` that only Vercel Cron
  knows; reject any other caller. Uses the service-role key server-side to write cached
  rows. Never exposed to the client.

Why this over the alternatives:
- **Vercel Cron** — we're already deploying on Vercel; zero new infra, first-class fit
  with a Next.js route handler, easy to protect and observe. ✅ MVP choice.
- **Supabase scheduled functions (pg_cron / Edge Functions)** — viable, but splits the
  generation logic out of the Next.js codebase (duplicating weather + availability +
  generation code in a second runtime). Reconsider only if generation moves fully into
  Postgres/Edge. ❌ for MVP.
- **Dedicated background worker / queue** — correct at scale (tens of thousands of
  users, retries, backpressure), overkill for a private beta. Design the prepare step as
  a pure, idempotent function so it can be lifted into a worker later without a rewrite.
  ⏳ later.

**Multi-timezone**: handled from day one by storing `timezone` on the profile and
having the cron evaluate local time per user. MVP can start with a single default
timezone fallback (e.g. `Asia/Kolkata`) when `timezone` is null, but the *architecture*
already supports per-user timezones — no rebuild required to turn it on.

---

## 5. Notification provider recommendation

**Recommendation: build a provider abstraction now (interface only), ship PWA Web Push
as the first concrete channel in a later pass, and until then run the drop as pull.**

Concretely:
- **Now (this pass): nothing installed.** Define a thin internal contract like
  `notify(userId, { title, body, url })` in the plan so the prepare loop can call a
  no-op today and a real channel later. Payload is **text + deep-link only**.
- **First real channel: PWA Web Push** (VAPID + Service Worker + `PushSubscription`).
  Reasons: the app is already a mobile-first PWA; web push is free, standards-based, no
  third-party sees wardrobe data, and it needs no app-store release. Caveat to note for
  later: iOS Safari requires the PWA be **installed to the home screen** before web push
  works — acceptable for a private beta, and we degrade gracefully (users who haven't
  installed simply get the pull experience).
- **Interim reminder option**: if we want a nudge before web push is built, a **calm
  daily email via Resend** ("Today's outfit is ready — open WearWise") is the
  lowest-risk stopgap and reuses a stack component already in the project. Text-only,
  deep-links to `/dashboard?drop=today`. Optional, not required for value.

Comparison:

| Option | Fit now | Verdict |
|---|---|---|
| **PWA Web Push** | Web app, no vendor sees data, free | ✅ first real channel (later pass) |
| **Email (Resend)** | Already in stack, text-only, safe | ✅ optional interim nudge |
| **Expo push** | Only if a React Native app ships | ⏳ later, behind the abstraction |
| **Firebase Cloud Messaging** | Powerful but adds Google dependency + web setup overhead | ❌ not for MVP |
| **OneSignal** | Fast to add, but a 3rd party would receive user/device identifiers | ❌ conflicts with privacy-first stance |
| **WhatsApp** | High open rates, but template approval + per-message cost + PII to Meta | ⏳ much later, if ever |

Do **not** install or wire any provider in this pass.

---

## 6. Privacy & security rules (binding)

These are hard constraints for every later implementation pass:

- Notification payload is **text only**: a title ("Today's outfit is ready") and a body
  ("Open today's pick"), plus the deep-link URL. Nothing else.
- **No wardrobe image URLs** in any payload. **No signed URLs** in any payload or in the
  cache table. Signed URLs are resolved server-side, at read time, only inside the
  authenticated Today screen (same pattern the dashboard already uses).
- **No wardrobe metadata to third parties.** Item names, colors, categories, occasion
  tags, and counts never leave our backend toward a notification vendor.
- The app **fetches the full recommendation after an authenticated open** — the
  notification is a doorbell, not a delivery of content.
- Prepare job uses the **service-role key server-side only**; it is local/server-only,
  never printed, never referenced in `src/`, never exposed as `NEXT_PUBLIC_*`.
- Opt-in is explicit (`daily_drop_enabled` defaults false). No drops or notifications
  for users who haven't turned it on.

---

## 7. Weather dependency

- Use `profiles.city` → `getWeatherContext(city)` **server-side** at prepare time.
- Store only a **short text `weather_summary`** (e.g. "28°C, light rain") + a
  `weather_available` boolean in the cache. Never store raw provider payloads.
- Weather is **optional**: `getWeatherContext` already returns `null` on any failure and
  never throws. If it returns null, prepare the drop **without** weather and set
  `weather_available = false`, then say so honestly in the UI ("Weather unavailable.
  WearWise used your wardrobe and occasion.").
- No re-fetch in the notification path — the summary is already cached with the drop.

---

## 8. Laundry / availability dependency

The prepare step selects candidate items with:

```
availability_status = 'available'
```

i.e. it **excludes** `in_wash` and `unavailable` items (reusing the existing
`isWearableItem` helper). This mirrors what Style Me and the generate-drafts route
already do — one shared filter, no divergence. If too few wearable items remain, the
drop fails gracefully (see §9).

---

## 9. Failure states & fallback copy

Every prepare run must resolve to a *state*, never a crash. `status` / `fail_reason`
capture it; the Today screen renders honest copy.

| Condition | Handling | Copy |
|---|---|---|
| User not opted in (`daily_drop_enabled=false`) | Skip entirely — no row, no notify | (no drop) |
| No wardrobe items | `status='failed'`, `fail_reason='no_wardrobe'` | "Add a few clothes to get tomorrow's outfit." |
| Too few wearable items (after availability filter) | `status='failed'`, `fail_reason='too_few_items'` | "Add a few clothes to get tomorrow's outfit." |
| No city set | Prepare **without** weather; `weather_available=false` | "Weather unavailable. WearWise used your wardrobe and occasion." |
| Weather fetch returns null | Prepare **without** weather; `weather_available=false` | "Weather unavailable. WearWise used your wardrobe and occasion." |
| AI generation failure | `status='failed'`, `fail_reason='generation_error'`; do NOT invent an outfit | "We couldn't prepare today's outfit. Open Style Me to create one." |
| Notification provider failure (later) | Drop is still cached; `notified_at` stays null; retry next window. Never lose the drop because delivery failed | (silent; pull still works) |

Principle: a delivery failure must never destroy a successfully prepared drop, and a
failed prepare must never fabricate an outfit.

---

## 10. Deep links

**Recommendation: `/dashboard?drop=today`.**

- `/dashboard` already exists, is the Today screen, is `force-dynamic`, and already
  reads approved suggestions + weather. Reusing it avoids a route migration.
- The `?drop=today` param lets the Today screen (a) scroll to / highlight the Daily Drop
  card and (b) fire the `daily_drop_notification_opened` event and set the cached row's
  `status='opened'` / `opened_at`.
- A dedicated `/today` route is a nice-to-have later (cleaner URL, easier to reason
  about), but not worth a route move for the beta. If we add it, alias it to the same
  view and keep `/dashboard?drop=today` working.

---

## 11. Events / instrumentation

No analytics wiring in this pass. Reserve these names so later instrumentation
(PostHog is already in the stack) is consistent:

- `daily_drop_prepared`
- `daily_drop_notification_queued`
- `daily_drop_notification_opened`
- `daily_drop_viewed`
- `daily_drop_worn`
- `daily_drop_swapped`
- `daily_drop_skipped`
- `daily_drop_failed`

Each should carry a stable `local_date` + `recommendation_id` for funnel analysis
(prepared → opened → viewed → worn) without any wardrobe content in the properties.

---

## 12. Implementation phases

- **Phase 0 — this pass:** this document. No code, no schema.
- **Phase 1 — persist preferences:** migration 0008 profile columns (§3a) + make
  `daily-drop-preferences.tsx` actually save (replace the preview banner). Still no
  drops, no notifications. Smallest real step.
- **Phase 2 — prepare + cache (pull only):** migration 0008 `daily_recommendations`
  table (§3b) + a pure, idempotent `prepareDailyDrop(userId, localDate)` server function
  (availability-filtered, weather-optional, fail-safe). Today screen reads the cached
  drop if present, else falls back to current behavior. **This is where the product value
  lands** — outfit is ready when the user opens the app.
- **Phase 3 — scheduling:** protected Vercel Cron route that calls `prepareDailyDrop`
  per opted-in user at their local time. Still no notifications; the drop is simply
  pre-warmed before the user opens the app.
- **Phase 4 — delivery:** provider abstraction + PWA Web Push (VAPID + service worker +
  subscription capture), text-only payload, deep-link to `/dashboard?drop=today`.
  Optional Resend email nudge as interim.
- **Phase 5 — learning + instrumentation:** wire "Wore it" → `last_worn_at`, the event
  names above via PostHog, and light preference learning (quiet-gem surfacing, occasion
  bias). No streaks, no guilt, no scoring.

---

## 13. Do NOT build yet (explicit)

- ❌ Production push notifications (any channel).
- ❌ Scheduled jobs / cron of any kind.
- ❌ Push provider integrations (Web Push, FCM, OneSignal, Expo, WhatsApp).
- ❌ Expo / Firebase / APNs setup.
- ❌ Sending any real notification.
- ❌ The `daily_recommendations` table / migration 0008 (this pass is design only).
- ❌ Persisting notification preferences (still preview-only until Phase 1).
- ❌ Streaks, guilt loops, addiction mechanics, body scoring, public/social pressure.
- ❌ Any wardrobe image or signed URL in a payload or cache row.
- ❌ Any change to app behavior in this pass except adding this document.

---

## 14. Migration summary (proposed, not applied)

If/when Phases 1–2 proceed, a **single new migration `0008_daily_outfit_drop.sql`**
covers both parts:

1. `alter table public.profiles add column ...` — six preference columns (§3a),
   protected by the existing `profiles_update_own` policy (no new policy).
2. `create table public.daily_recommendations ...` (§3b) + `(user_id, local_date)`
   unique constraint + owner-scoped RLS (select/update; no client insert — service role
   writes) (§3b RLS).

Additive only. Reuses `occasion_type`, `wardrobe_items.availability_status`,
`profiles.city`. No changes to `outfit_requests` / `outfit_suggestions`.
