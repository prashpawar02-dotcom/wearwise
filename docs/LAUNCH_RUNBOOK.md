# WearWise — Launch Runbook (Modules A–G)

Everything below is already built. This is the ordered checklist to take it live.

## 1. Database (Supabase SQL editor, in order)

Run migrations `0012` → `0019` from `supabase/migrations/`:

| Migration | Adds |
|---|---|
| 0012_subscriptions.sql | subscriptions + trial trigger (7d at profile creation) + billing_events (webhook idempotency) + analysis_purchases + `is_pro()` + **DB-enforced 15-item free cap** |
| 0013_streaks.sql | streaks (service-role writes only — unfakeable) |
| 0014_saved_looks.sql | Lookbook + DB-enforced free cap of 5 |
| 0015_push_subscriptions.sql | FCM tokens + reminder prefs |
| 0016_referrals.sql | share_tokens (public vote loop) + referrals |
| 0017_events.sql | app_events server analytics mirror |
| 0018_feature_flags.sql | feature_flags + seeded defaults (all auto/on) |
| 0019_daily_drop_cache.sql | alt-option cache on daily_recommendations + generation_cache memo table |

## 2. Environment variables (Vercel)

Already used: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`, weather + PostHog keys.

New:
```
NEXT_PUBLIC_APP_URL=            # https://your-domain
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_PLAN_ID_MONTHLY=       # create in Razorpay dashboard: ₹99/mo
RAZORPAY_PLAN_ID_YEARLY=        # ₹999/yr
RESEND_API_KEY=
RESEND_FROM=                    # e.g. WearWise <hello@yourdomain>
FCM_SERVER_KEY=                 # Firebase Cloud Messaging (legacy server key)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
# optional, makes rate limits cross-instance:
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```
Every integration is no-op-safe: a missing key degrades gracefully (push falls back to email, email skips, billing returns "not configured").

## 3. Razorpay dashboard

1. Create Plans: monthly ₹99, yearly ₹999 → put ids in env.
2. Webhook → `https://<domain>/api/billing/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`. Events: `subscription.activated/charged/pending/halted/cancelled/completed`, `payment.captured`.

## 4. Crons (vercel.json — already configured)

- `*/30 * * * *` daily-drop prepare (per-user local-time windows; 0 tokens — deterministic engine + alt-option cache)
- `*/30 * * * *` notify/morning (one primary push/day, quiet hours, dedupe)
- `30 13 * * *` streak-risk (19:00–21:00 IST local check, ≤2 contextual/week)
- `30 13 * * 0` weekly recap (Sunday evening IST)

## 5. Admin controls

`/admin/controls` (admin only): Auto ↔ Human ↔ Off per generation feature, kill-switches (swaps, share, notifications, referral, billing), AI budget ₹/day, per-user call caps, and **eco mode** (rules-only). Changes apply live (≤30s), no redeploy.

## 6. Smoke test (real phone)

signup → trial starts automatically → onboard (reminder time) → upload 10 → Today shows drop → Wear this (streak +1) → Save look → Another option (cache hit) → share → vote from second device (no login) → `/admin/controls` flip Occasions to Human → new request goes to `/admin/requests` → flip back.

Abuse checks: free user calling `/api/daily-drop/swap` → 402; client inserting 16th wardrobe item → DB trigger blocks; unsigned webhook → 401; replayed webhook → no-op; `/api/vote` hammering → 429.

## 7. Known deferred items (intentional)

- WhatsApp reminders: opt-in + approved templates required first (compliance) — email fallback live.
- Analysis PDF: delivered as rich HTML email + in-app report (no PDF lib dependency).
- Sentry: hook `global-error.tsx` + route logging to Sentry DSN when account is created; app_events captures server errors meanwhile.
- EXIF strip on upload: images are compressed client-side; add server-side strip when an image pipeline is introduced.
