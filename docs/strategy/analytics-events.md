# WearWise — Analytics Events (Beta MVP)

Lightweight, privacy-first product analytics for the closed beta. Tool: **PostHog**
(loaded via the web snippet — no npm dependency). Helper: `src/lib/analytics.ts`
exposing `track(event, properties?)`. Off unless `NEXT_PUBLIC_POSTHOG_KEY` is set;
off in development unless `NEXT_PUBLIC_ANALYTICS_DEBUG=true`.

## Privacy rules

Only NON-SENSITIVE properties are ever sent:
- counts, categories, booleans, status strings
- route / source, occasion type, error reason codes
- item_count, availability_status, daily_drop status

**Never sent:** wardrobe image URLs, signed URLs, image paths, raw clothing
notes, user email, full names, exact wardrobe item names, body/appearance data.

`track()` never throws and no-ops when PostHog isn't loaded, so a failed or
disabled analytics call can never block a product action.

## Events & properties

### Onboarding / account
| Event | Properties |
|---|---|
| `onboarding_completed` | `city_present: boolean`, `style_preferences_count: number` |

### Wardrobe
| Event | Properties |
|---|---|
| `wardrobe_item_uploaded` | `category: string \| null`, `source: "upload"` |
| `wardrobe_item_tagged` | `status: "success" \| "failed" \| "needs_review"` |
| `closet_board_viewed` | `total_items`, `available_items`, `in_wash_items`, `needs_review_items` (all numbers) |
| `wardrobe_availability_changed` | `from_status: string`, `to_status: string` |

### Style Me
| Event | Properties |
|---|---|
| `style_me_started` | `occasion: string` |
| `outfit_request_created` | `occasion: string`, `wearable_item_count: number`, `weather_available: boolean` |
| `outfit_request_failed` | `reason: string` |

### Daily Drop
| Event | Properties |
|---|---|
| `daily_drop_preferences_saved` | `enabled: boolean`, `days_mode: "every_day" \| "weekdays" \| "custom"`, `weather_advice_enabled: boolean`, `quiet_gems_enabled: boolean`, `custom_time: boolean` |
| `daily_drop_prepare_clicked` | `source: "dashboard_beta_button"` |
| `daily_drop_prepare_result` | `status: string`, `fail_reason: string \| null`, `warning: string \| null` |
| `daily_drop_viewed` | `status: "prepared" \| "failed"`, `item_count: number`, `weather_available: boolean` |
| `daily_drop_worn` | `item_count: number` |

### Weather
| Event | Properties |
|---|---|
| `weather_city_saved` | `city_present: boolean` |
| `weather_context_loaded` | `available: boolean`, `category: string \| null` — **skipped this pass** (server-side) |

### Admin
| Event | Properties |
|---|---|
| `admin_outfit_approved` | `request_status: string` |
| `admin_outfit_rejected` | `reason_present: boolean` |
| `admin_ai_retry_clicked` | `source: string` |

## What is intentionally NOT tracked
- No typing, no per-keystroke, no per-scroll, no per-click noise.
- No wardrobe photos or any image reference.
- No PII (email, names, addresses).
- No raw free-text notes (only booleans/counts derived from them).

## Skipped in this pass (documented, not implemented)
- **Server-side analytics.** All events are client-side for the MVP. Server-only
  moments (`weather_context_loaded`, and the server-side outcome of the cron
  prepare) are not tracked yet — adding a server PostHog client is a later step.
- **`weather_context_loaded`** — weather is resolved in server components; firing
  it client-side would need prop plumbing. Deferred.
- **Cookie/consent banner** — not added this pass. PostHog is cookie-based; if the
  deployment targets regions requiring consent (EU/UK), add a consent gate before
  `loadPostHog` and default analytics off until consent. Tracked as follow-up.

## Future analytics ideas
- Funnel: onboarding → first upload → first outfit → first "wore it".
- Retention: returns within 7 days; Daily Drop opened vs prepared.
- Server-side prepare/cron outcomes for delivery reliability.
- Feature-flagged experiments (PostHog flags) once beta stabilises.
