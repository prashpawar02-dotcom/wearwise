# Daily Outfit Drop — Deployment Checklist (Phase 3)

Server-controlled scheduled preparation, **no notifications**. Use this before
enabling the cron in production.

## 1. Required environment variables (Vercel → Project → Settings → Env Vars)

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | anon key (RLS-protected) |
| `NEXT_PUBLIC_SITE_URL` | public | deployed origin, for magic-link auth |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | bypasses RLS — NEVER `NEXT_PUBLIC_` |
| `CRON_SECRET` | **server-only** | long random string; protects the cron route |
| `OPENAI_API_KEY` | server-only | existing (auto-tagging) |

Set `SUPABASE_SERVICE_ROLE_KEY` **before** applying migration 0010.

## 2. Required migrations (Supabase SQL editor, in order)

- [ ] `0008_daily_drop_preferences.sql` — profile preference columns
- [ ] `0009_daily_recommendations.sql` — cache table + owner-scoped RLS
- [ ] `0010_daily_recommendations_server_insert.sql` — remove client insert
      (apply only after the service-role key is set)

## 3. Vercel cron config

`vercel.json` (already in repo):
```json
{ "crons": [ { "path": "/api/cron/daily-drop/prepare", "schedule": "*/30 * * * *" } ] }
```
Vercel Cron issues a GET every 30 minutes and adds `Authorization: Bearer
<CRON_SECRET>` automatically when `CRON_SECRET` is set.

## 4. Pre-deploy checks

- [ ] `npm run lint` and `npx tsc --noEmit` pass.
- [ ] `npm run build` succeeds.
- [ ] All env vars set for the Production environment.
- [ ] Migrations 0008/0009/0010 applied to the production Supabase project.
- [ ] Confirm no secret is exposed: `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`
      are NOT referenced in any `src/` client component and NOT `NEXT_PUBLIC_`.

## 5. Post-deploy checks

- [ ] Unauthorized cron call returns **401**:
      `curl -i -X POST https://YOUR-APP/api/cron/daily-drop/prepare`
- [ ] Authorized cron call returns a **200** counts summary:
      `curl -s -X POST https://YOUR-APP/api/cron/daily-drop/prepare -H "Authorization: Bearer $CRON_SECRET" | jq`
- [ ] Vercel **Logs** show `[cron:daily-drop] started / checked / completed` with
      no wardrobe data, paths, or secrets.
- [ ] Set your own profile drop time to just before "now", enable Daily Drop,
      wait for (or manually trigger) the cron, then open `/dashboard` and confirm
      Today's Drop appears.
- [ ] Run the cron twice in the same local day → second run increments `exists`,
      not `prepared`.

## 6. Manual SQL verification

```sql
-- Opted-in users the cron will consider:
select id, timezone, daily_drop_time, daily_drop_days
from profiles
where daily_drop_enabled = true and timezone is not null and daily_drop_time is not null;

-- One recommendation per user per local date (expect ZERO rows):
select user_id, local_date, count(*)
from daily_recommendations
group by user_id, local_date
having count(*) > 1;

-- Today's prepared drops (no image data stored — item IDs only):
select user_id, local_date, status, array_length(selected_item_ids, 1) as item_count, fail_reason
from daily_recommendations
order by created_at desc
limit 50;
```

## 7. Custom drop-time compatibility

The cron parses `daily_drop_time` by splitting on `:`, so custom times save and
schedule correctly: `13:50`, `18:10`, `23:30` (and `HH:MM:SS` variants) all map
to the right same-day minute offset.

**Known limitation:** no midnight wraparound. A drop time within 30 minutes of
midnight (≈`23:30`–`23:59`) may miss its window on the 30-minute cadence.
Acceptable for beta; revisit if users request late-night times.

## 8. Rollback

- Pause scheduling: remove the `crons` entry from `vercel.json`, or unset
  `CRON_SECRET` (route then 500s and prepares nothing). No data loss.
- Revert 0010 (restore client inserts): re-create `dailyrec_insert_own` and point
  the manual route at the session client. Not recommended.
- Cached rows are safe to keep or delete; the next prepare re-creates them.

## 9. Known NOT live (do not claim these)

- Notifications of any kind: push, web push, email, PWA service worker (Phase 4).
- "Skip" / "Swap one item" actions.
- Morning *delivery* — the cron only PREPARES the cached drop; users see it when
  they open the app. Keep beta copy: "Morning delivery is coming later."
