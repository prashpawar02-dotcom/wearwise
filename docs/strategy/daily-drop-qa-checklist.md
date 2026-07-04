# Daily Outfit Drop — QA & Hardening Checklist (Phase 2)

Manual test notes for the Daily Outfit Drop backend before cron/notifications.
Everything here runs as the **signed-in user** (their Supabase session; RLS
applies). No cron, no notifications, no service-role writes.

## Required migrations (apply in Supabase, in order)

- `0008_daily_drop_preferences.sql` — profile preference columns (opt-in, time,
  days, timezone, quiet gems, weather advice).
- `0009_daily_recommendations.sql` — the `daily_recommendations` cache table
  + `unique(user_id, local_date)` + status check + owner-scoped RLS.

Both must be applied or the prepare route and dashboard read will error.

## Preconditions for a successful prepare

- Profile `daily_drop_enabled = true` (toggle it on in the You screen and Save).
- At least a wearable top + bottom (or a dress) with `availability_status =
  'available'` and `ai_tag_status` not `analyzing`/`failed`.
- Optional: a saved city + `weather_advice_enabled = true` for a weather line.

## Manual prepare (from the browser console while signed in)

```js
// Prepare today's drop (no-op if one already exists)
await fetch("/api/daily-drop/prepare", { method: "POST" }).then(r => r.json());

// Force a regenerate for today
await fetch("/api/daily-drop/prepare", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ force: true }),
}).then(r => r.json());
```

Notes: only `force` is honoured; any other body field is ignored. The user is
always taken from the session — you cannot pass a `user_id`.

## Expected responses

Success (prepared):
```json
{ "status": "prepared", "localDate": "2026-07-04", "recommendationId": "…",
  "reason": null, "failReason": null, "warning": null }
```

Disabled (opt-in off):
```json
{ "status": "disabled", "localDate": "…", "recommendationId": null,
  "reason": "daily_drop_disabled", "failReason": null, "warning": null }
```

Too few wearable items:
```json
{ "status": "failed", "localDate": "…", "recommendationId": "…",
  "reason": "too_few_items", "failReason": "too_few_items", "warning": null }
```
Other `failReason` values: `no_wardrobe`, `db_error`, `no_profile`.

Timezone fallback (no/invalid saved timezone): any response may include
```json
"warning": "timezone_missing_or_invalid_default_used"
```
meaning the default zone (Asia/Kolkata) was used for the local date. Save the You
screen once (captures the browser timezone) to clear it.

## Duplicate / force behaviour

- Two prepares on the same local date with `force:false` → the **same** row is
  returned the second time (`status:"exists"`), never a duplicate. Enforced by
  `unique(user_id, local_date)` + upsert `onConflict`.
- `force:true` → regenerates and **replaces** today's row in place (same id,
  same user/date); `selected_item_ids` are refreshed and `opened_at/worn_at/
  skipped_at` are reset. No duplicate row is created.

## Dashboard checks (Today screen)

- No recommendation for today → Today screen renders exactly as before (no card).
- `prepared`/`opened`/`worn` → "Today's Drop" card renders with signed
  thumbnails, item list, weather line (if any), reasoning, insight, "Wear this".
- `failed` → calm fallback card (no blame, no mention of notifications/AI).
- Some selected items deleted → card still renders (missing items are skipped);
  if **all** are gone, an honest "prepare a fresh outfit" note shows instead of
  an empty card.
- One signed-URL failing → that thumbnail is omitted; the card does not crash.
- "Wear this" → sets the recommendation `worn` and stamps `last_worn_at` on the
  chosen items — only for the signed-in user's own rows (RLS).

## RLS / privacy checks

- A user cannot read or update another user's `daily_recommendations` (owner-only
  select/update policies).
- The table stores `selected_item_ids` (UUIDs) only — verify no `image_path` or
  signed URL is ever written. Signed URLs are generated only at dashboard render.
- No service-role client is used anywhere in this flow.
- The prepare route never accepts a `user_id` from the client.

## Scheduled preparation (Phase 3A — server-controlled, no notifications)

Required migrations: 0008, 0009, **0010** (0010 removes the client insert-own
policy; inserts are now server-only via the service role).

Required env: `SUPABASE_SERVICE_ROLE_KEY` (server-only) and `CRON_SECRET`. Set
the service-role key **before** applying 0010, or prepare will be blocked.

Route: `GET|POST /api/cron/daily-drop/prepare` (Vercel Cron uses GET). Runs
every 30 min per `vercel.json`. It PREPARES drops only — it sends nothing.

Test — unauthorized (no/wrong secret) → **401**:
```bash
curl -i -X POST https://YOUR-APP/api/cron/daily-drop/prepare
curl -i -X POST https://YOUR-APP/api/cron/daily-drop/prepare \
  -H "Authorization: Bearer wrong-secret"
```

Test — authorized → **200** with a counts summary:
```bash
curl -s -X POST https://YOUR-APP/api/cron/daily-drop/prepare \
  -H "Authorization: Bearer $CRON_SECRET" | jq
# { "checked": N, "attempted": N, "prepared": N, "exists": N,
#   "failed": N, "skipped": N, "errors": [ { "userId": "…", "reason": "…" } ] }
```
(No wardrobe metadata is returned — counts + minimal error info only.)

Verify **one row per user/date**: run the authorized call twice within the same
local day. The second run should increment `exists`, not `prepared`, and the DB
must still hold a single `daily_recommendations` row for that `(user_id,
local_date)` (enforced by the unique constraint + upsert).

Verify **time-window skipping**: a user whose local time is NOT within
`[daily_drop_time, daily_drop_time + 30min)` on an active weekday counts toward
`skipped`, and no row is prepared for them. Users on an inactive weekday
(`daily_drop_days`) are also skipped.

Note: **notifications are still not live.** The cron only prepares/caches drops;
the Today dashboard shows them when the user opens the app.

## Known NOT live (future phases)

- Push notifications, web push, email, PWA service worker, any provider (Phase 4).
- "Skip" / "Swap one item" actions.
- Local-time window wraparound across midnight (drop times near 23:30–23:59 may
  miss the window on a 30-min cadence — acceptable for beta; revisit later).
