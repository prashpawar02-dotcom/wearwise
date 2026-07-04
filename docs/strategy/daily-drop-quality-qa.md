# Daily Outfit Drop — Selector Quality QA

Manual test cases for the deterministic outfit selector in `src/lib/daily-drop.ts`.
Prepare a drop with the beta button on `/dashboard` (or `POST /api/daily-drop/prepare`)
after each setup. Daily Drop must be **enabled** in the You screen first.

Selector goals: a practical, complete-feeling outfit from **available** clothes;
honest reasoning; never fake a drop when required pieces are missing. Deterministic —
never call it "AI generated".

Machine fail reasons: `no_wardrobe`, `too_few_wearable_items`, `no_footwear_available`,
`outfit_roles_incomplete` (plus `disabled`, `no_profile`, `db_error`).

---

## Core outfits

### 1. Western everyday: top + bottom + shoes
- Setup: ≥1 available top, ≥1 available bottom, ≥1 available shoe.
- Expected: `prepared` with top + bottom + shoes. Reasoning names all three and
  mentions weather only if a city/weather was available.
- Bad: two tops and no bottom; shoes omitted when a wearable pair exists; layer
  added on a hot day.

### 2. Dress + shoes
- Setup: 1 available dress, 1 available shoe, no separates needed.
- Expected: `prepared` with dress + shoes (2 pieces). `occasion_context = daily`.
- Bad: adding a bottom under a dress; failing when a dress + shoes exist.

### 3. Traditional: kurta + bottom (+ dupatta)
- Setup: kurta/kurti (top) + leggings/palazzo/churidar (bottom); optionally a
  dupatta and juttis.
- Expected: `prepared`, `occasion_context = traditional`; dupatta included when
  present; juttis counted as shoes.
- Bad: dupatta treated as a top/bottom; juttis missed as footwear.

### 4. Traditional: saree (+ blouse)
- Setup: 1 saree; optionally a blouse (top) and shoes.
- Expected: `prepared`, traditional; saree is the core, blouse added if present.
- Bad: saree bucketed as a plain dress with no blouse when a blouse exists.

### 5. Traditional: lehenga + choli
- Setup: lehenga (bottom) + choli/blouse (top) + optional dupatta/shoes.
- Expected: `prepared`, traditional (top+bottom path), dupatta added if present.

---

## Footwear & completeness

### 6. Shoes missing (separates present)
- Setup: top + bottom available, **no** wearable shoes.
- Expected: `prepared` with top + bottom (2 pieces); reasoning adds "No footwear
  was available, so add a pair of shoes to finish it." Not a failure.
- Bad: failing a valid top+bottom just because shoes weren't uploaded.

### 7. All shoes in wash
- Setup: shoes exist but every pair is `in_wash`/`unavailable`; top+bottom available.
- Expected: same as #6 (shoes excluded, outfit still prepared, add-shoes note).
- Bad: including an in-wash shoe.

### 8. Lone core piece, no shoes
- Setup: only a single dress, no shoes, warm weather (no layer).
- Expected: `failed`, `no_footwear_available` — one piece can't stand alone.
- Bad: returning a 1-item "outfit".

### 9. Too many clothes in wash
- Setup: most items `in_wash`; fewer than 2 wearable remain.
- Expected: `failed`, `too_few_wearable_items`; calm fallback copy.
- Bad: pulling from in-wash items to fill the gap.

### 10. No top+bottom and no dress/saree
- Setup: only shoes + accessories available.
- Expected: `failed`, `outfit_roles_incomplete`.

---

## Weather

### 11. Hot / warm
- Setup: city set, hot day; layer available.
- Expected: no layer added; reasoning includes the weather advice line.
- Bad: adding a jacket on a hot day.

### 12. Rainy / cool / windy
- Setup: city set, rainy or <20°; layer available.
- Expected: a layer is added; reasoning notes "It's cooler out, so a layer was added…".

### 13. No weather city
- Setup: clear city in You (or weather advice off).
- Expected: `prepared` without weather; reasoning says "Weather isn't available
  right now, so this is based on your wardrobe and the day." No weather summary.
- Bad: inventing a temperature.

---

## Quiet gems & recency

### 14. Quiet gems ON
- Setup: `show_quiet_gems = true`; include an item unworn ≥21 days (or never worn).
- Expected: `daily_insight` mentions that piece with the real day count.
- Bad: claiming "quiet for N days" for a recently worn item.

### 15. Quiet gems OFF
- Setup: `show_quiet_gems = false`.
- Expected: neutral insight ("A fresh combination from N of your wearable pieces.");
  no quiet-gem callout.

### 16. Recently worn items
- Setup: some pieces worn today/yesterday, others long unworn.
- Expected: selector prefers least-recently-worn within each role.
- Bad: re-picking an item worn today when an unworn alternative exists.

---

## Robustness & actions

### 17. Deleted selected item
- Setup: prepare a drop, then delete one selected item from the wardrobe.
- Expected: card still renders (missing item skipped). If **all** selected items
  are deleted → honest note ("Some pieces … are no longer in your wardrobe").
- Bad: a crash or an empty card.

### 18. Failed recommendation exists
- Setup: any failure case above.
- Expected: calm failed fallback + "Try preparing again" (normal prepare, no force).
- Bad: raw machine reason shown to the user.

### 19. Wear this → last_worn_at
- Setup: a prepared drop; tap "Wear this".
- Expected: recommendation `status = worn`, `worn_at` set; each selected item's
  `last_worn_at = today`. Only the signed-in user's own rows change (RLS).
- Bad: updating another user's items; no last_worn_at change.

---

## Privacy / security (must hold in every case)

- `daily_recommendations` stores `selected_item_ids` only — no `image_path`, no
  signed URLs.
- Signed URLs are generated only at dashboard render, server-side.
- No service-role client; the prepare route always uses the session user.
- No cross-user reads/updates; no wardrobe data sent to third parties.

## Not live yet

Cron/scheduling (Phase 3); push/web-push/email/PWA/notifications (Phase 4);
Skip/Swap actions. No auto-generation on dashboard load.
