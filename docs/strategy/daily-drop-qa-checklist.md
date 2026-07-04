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

## Known NOT live (future phases)

- Cron / scheduled preparation (Phase 3).
- Push notifications, web push, email, PWA service worker, any provider (Phase 4).
- "Skip" / "Swap one item" actions (Phase 3).

## Pre-cron TODO

Before a scheduled job goes live, the `dailyrec_insert_own` policy should be
narrowed so prepared inserts are server-controlled (service role) rather than
client-session inserts. See the note in `0009_daily_recommendations.sql`.
