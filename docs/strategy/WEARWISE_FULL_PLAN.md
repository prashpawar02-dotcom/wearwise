# WearWise — Full Product Plan (Free + Pro)

**Owner:** Prashant · **Planning model:** Opus 4.8 · **Build model:** Fable 5
**Status:** Extends the live skeleton (Next 14 + Supabase + Vercel). Aligns with migrations `0002–0011`, the `(app)` route group, and outfit validation. **Change from prior design: outfit generation is now fully automatic (human-less) by default.** The existing approval machinery is kept but demoted to an *optional safety switch* the admin can turn on per feature. Nothing here contradicts what is already built — it layers automation, monetization, retention, notifications, and hardening on top.

**Core promise:** *Upload your clothes once. Every morning, open the app and get one perfect outfit — plus 2 backups — from clothes you already own.*

**One-line product law:** Ship nothing that does not help the user decide what to wear, reduce decision stress, improve retention, or increase willingness to pay.

---

## 1. Where we are vs. where this plan takes us

| Already live | This plan adds |
|---|---|
| Auth, onboarding, wardrobe upload + auto-tag + manual correction | **Free trial → Pro paywall** (Razorpay) |
| Occasion select → AI draft outfits → human approve → view | **Streaks + daily habit loop** |
| Daily Drop (prefs, migration 0008–0010), feedback (0011) | **Push + WhatsApp/email notifications** (Resend, FCM, optional Twilio) |
| Wardrobe availability, worn-today, plan/analytics, admin | **PostHog analytics + Sentry**, sharing/vote loop, referral, security hardening |

We are not rebuilding. We are turning a working tool into a **habit product with a paid tier**.

---

## 2. The two plans (only two, as requested)

### 2.1 Design principle
The free tier must deliver **one full "aha" moment** (a real daily outfit from their own clothes) so the value is felt before the wall. The wall is placed at the moment of **peak want**, not before value.

### 2.2 Plan structure

**Basic (Free trial) — 7 days full access, then permanently limited**
- Days 1–7: full Pro experience unlocked (this is the addiction window).
- Day 8+: drops to a limited free tier that is *useful but incomplete* — enough to keep the habit and the FOMO alive, not enough to fully satisfy.

**Pro (Paid) — ₹99/month or ₹149/month, ₹999/year (2 months free)**
- Everything, always. Positioned as "your daily stylist for the price of one coffee a month."
- One-time alternative: **₹199 Manual Wardrobe Analysis** (a human/AI deep style report) as a low-friction first purchase that primes them to subscribe.

### 2.3 Exact feature gating

| Capability | Free (after day 7) | Pro |
|---|---|---|
| Wardrobe items | Up to **15 items** | **Unlimited** |
| Daily Drop (today's outfit) | **1 outfit/day, no swaps** | 1 hero + **unlimited swaps & "another option"** |
| Occasions per outfit request | Casual + Office only | **All**: ethnic, festive, travel, party, family occasion |
| Outfit ideas per request | 1 | **3 curated** |
| Save looks ("Lookbook") | Up to **5 saved** | **Unlimited** |
| Streaks + reminders | Yes (retention hook stays free on purpose) | Yes + streak freeze |
| Weather-aware suggestions | No | **Yes** |
| Plan-ahead (pack for trip / week planner) | No | **Yes** |
| Colour/pattern styling tips | Generic | **Personalised** |
| Manual Wardrobe Analysis report | Paid add-on (₹199) | 1 free/quarter |
| Share outfit card + friend vote | Yes (this is growth — keep free) | Yes + branded card |
| Ads / upsell nudges | Light, tasteful | None |

**Why these lines:** Streaks and sharing stay free because they drive retention and virality. The *satisfaction* levers (swaps, 3 ideas, all occasions, unlimited closet, weather, planning) are Pro because they are what a daily user will pay to keep after tasting them in the trial.

---

## 3. Monetization psychology (why people pay)

1. **Loss aversion, not feature envy.** After 7 days the user has a streak, a Lookbook, uploaded clothes, and a morning habit. The paywall says *"Keep your streak and your full stylist"* — they are protecting something they already own, which converts far better than "unlock features."
2. **Anchor high, sell low.** Show ₹149/mo struck through beside ₹99/mo launch price and ₹999/yr ("2 months free"). The yearly looks smart next to monthly.
3. **Micro-commitment ladder.** ₹199 one-time Manual Analysis → habit → subscription. A user who has paid once pays again 3–5× more easily.
4. **Effort justification.** They spent time uploading 10–15 clothes. That sunk effort makes the wardrobe feel like *their asset inside the app* — leaving means abandoning it.
5. **Social proof + identity.** "Join 12,000 women who never stress about what to wear." Ties the product to who they want to be (put-together, effortless).
6. **Peak-end paywall timing.** Trigger the upgrade sheet right after a *successful* moment (they tapped "Wore this today" or shared a card), never after a failure.
7. **Reciprocity.** The free tier genuinely helps daily. People pay to reward a product that has already helped them for a week.

**Pricing rule:** never discount below ₹79/mo effective; discount by *adding time* (extra free days, streak freezes) instead, to protect perceived value.

---

## 4. Retention & "open once daily" addiction loop

The whole product is engineered around **one intentional daily open, every morning**, forming a habit via the Hook Model (Trigger → Action → Variable Reward → Investment).

### 4.1 The morning loop
1. **Trigger (external):** 7:00–8:30am push / WhatsApp: *"👗 Your outfit for today is ready — tap to see it."* (time is user-set in onboarding; defaults to their usual wake window).
2. **Action:** one tap opens the **Daily Drop** — a single large hero outfit card, already assembled, zero decisions required.
3. **Variable reward:** the outfit changes daily and is never fully predictable; "another option" and swaps make it a small slot-machine of *good* surprises. Occasional bonus: "Festive-ready look for Diwali week 🎉."
4. **Investment:** they tap **"Wore this today"** (feeds the streak + last-worn tracking), rate it, or save it to Lookbook. Each action makes tomorrow's drop smarter — the app visibly improves *because* they use it.

### 4.2 Streak system (free, on purpose)
- **What:** consecutive days the user opens the drop or logs an outfit.
- **Appearance:** a warm flame/ribbon counter top-right of the dashboard, with milestone celebrations at 3, 7, 14, 30, 100 days (confetti + a shareable "30-day streak" card).
- **Streak freeze:** Pro users get 2 freezes/month (miss a day without losing the streak) — a concrete Pro perk that also reduces churn.
- **Loss framing in notifications:** *"Don't break your 12-day streak — your outfit is waiting."*

### 4.3 Other retention loops
- **Lookbook (investment vault):** saved looks accumulate; the more saved, the higher the switching cost.
- **"Rediscover" nudge:** *"You haven't worn this kurta in 43 days — style it today?"* (uses last-worn data already tracked) — solves the real "I forgot I own this" pain and creates novelty from their own closet.
- **Weekly recap:** Sunday summary: outfits worn, most-worn colour, "you saved ~35 min of decision time this week." Quantifying saved time reinforces value.
- **Occasion pre-alerts:** festival calendar (Diwali, Karwa Chauth, weddings season, Holi) → *"3 festive looks ready for you"* a few days before — perfectly on-niche for Indian women 22–40.
- **Share + vote loop (viral):** "Can't decide? Ask a friend" generates a card with 2–3 options a friend taps to vote on → brings a non-user into the app → signup prompt.

### 4.4 Notification discipline (so it stays wanted, not annoying)
- Max **1 primary daily push** (the morning drop) + at most **2 contextual/week** (streak-risk, occasion, rediscover).
- All times user-controlled; quiet hours respected; every notification is *useful*, never "come back" spam.
- Channel priority: **Push (FCM) → WhatsApp (opt-in, Twilio) → Email (Resend)** fallback. WhatsApp is the highest-open channel in India; make it the hero once opted in and compliant.

---

## 5. Feature catalogue — appearance, location, working

Each feature below lists: **What · Where (location in app) · How it looks · How it works (tech) · Tier · Retention/monetization role.**

### 5.1 Onboarding & first outfit in <5 min *(success metric #1 & #2)*
- **Where:** `/onboarding` (exists) → `/wardrobe/upload`.
- **Looks:** warm ivory screens, 3 short steps (name/style vibe → set morning reminder time → upload first clothes). A progress ring ("2 of 3"). Big friendly CTA buttons in muted rose.
- **Works:** capture style prefs + reminder time (extends daily-drop preferences, migration 0008); guided multi-image upload → auto-tag (0002) → user confirms. On reaching ~5 items, immediately generate the first outfit so value lands inside 5 minutes.
- **Tier:** Free. **Role:** activation — the single most important funnel step.

### 5.2 Wardrobe / Closet
- **Where:** `/wardrobe` (closet-board exists), item detail `/wardrobe/[itemId]`.
- **Looks:** Pinterest-style grid of large clothing cards on ivory, filter chips (Type / Colour / Occasion / Available), charcoal text, minimal chrome.
- **Works:** upload → Supabase Storage → auto-tag type/colour/pattern → manual correction editor. Availability toggle (0007) = "at the cleaners / packed / lent out" so suggestions never use unavailable items.
- **Tier:** Free capped at 15 items; Pro unlimited. **Role:** the investment asset; the cap is a natural, honest upgrade reason.

### 5.3 Daily Drop *(the core habit surface)*
- **Where:** `/dashboard` → `daily-drop-card` (exists).
- **Looks:** ONE full-width hero outfit card (top + bottom + optional dupatta/accessory + footwear thumbnails), occasion tag, weather line (Pro), and three actions: **Wore this today · Swap an item · Another option**. Streak flame top-right. Deliberately uncluttered — the anti-decision-fatigue screen.
- **Works:** nightly cron (`/api/cron/daily-drop/prepare`, exists) pre-computes each user's drop from available items + prefs + (Pro) weather + last-worn recency, **auto-validated by the outfit validator (fails closed) and served with no human step.** Swaps hit `/api/daily-drop/swap` & `swap-candidates`; another option hits `/api/daily-drop/another-option` (all exist). Free = view-only 1 drop; Pro = unlimited swaps/options.
- **Tier:** Free (1, no swap) / Pro (full). **Role:** the daily open; the swap limit is the most-felt Pro trigger.

### 5.4 Occasion-based outfit request
- **Where:** `/occasion/new` → `/outfits/[requestId]` (exist).
- **Looks:** occasion picker as illustrated tiles (Office, Casual, Ethnic, Festive, Travel, Party, Family function). Results as swipeable large cards; Pro shows 3, Free shows 1.
- **Works:** request → `generate-drafts` (AI) → **auto-validate (fail-closed) → shown instantly to user, no human step.** The outfit validator still runs on every result and silently regenerates/repairs invalid combos before the user sees them. Human approval is OFF by default; the admin can flip this feature to "Human-approve" mode via the toggle panel (§5.11) if quality ever needs a manual gate.
- **Tier:** Free (Casual/Office, 1 idea) / Pro (all occasions, 3 ideas). **Role:** the "big event" pull — festive/wedding needs are where Indian users most want help and will pay.

### 5.5 Lookbook (saved looks)
- **Where:** new tab `/lookbook` (add to bottom nav).
- **Looks:** saved outfit cards grid; tap to re-view, mark worn, or share.
- **Works:** save = row linking outfit → user; "worn today" writes to worn history (feeds analytics + streak + last-worn). Free capped at 5.
- **Tier:** Free (5) / Pro (unlimited). **Role:** investment vault → switching cost.

### 5.6 Plan-ahead (week planner + trip packing) — **Pro**
- **Where:** `/plan` (exists; extend).
- **Looks:** a 7-day strip or trip list; each day/slot gets an assigned outfit; "pack list" summary for travel.
- **Works:** batch-generate outfits across days respecting no-repeat + weather + occasions; export/share pack list.
- **Tier:** Pro. **Role:** high-value differentiator; travel wardrobes are in the core niche.

### 5.7 Weekly recap + insights
- **Where:** `/plan/worn-history-analytics` (exists; surface as a weekly card + notification).
- **Looks:** friendly stats card — outfits worn, colour mix, cost-per-wear hint, "minutes saved."
- **Works:** aggregates worn history; Sunday cron sends recap notification.
- **Tier:** Free basic / Pro detailed. **Role:** value reinforcement → willingness to pay.

### 5.8 Share + friend vote (growth loop)
- **Where:** action on any outfit card → `/vote/[token]` public page (new, no-auth view).
- **Looks:** branded outfit card (ivory + WearWise mark), 2–3 options, tap-to-vote, subtle "Make your own with WearWise" CTA.
- **Works:** generate signed public token → lightweight public route (rate-limited, no PII) → votes tallied back to owner; voter sees signup prompt.
- **Tier:** Free (viral by design). **Role:** K-factor growth + success metric #5.

### 5.9 Manual Wardrobe Analysis (first-purchase primer) — **₹199 one-time**
- **Where:** `/analysis` upsell + delivered report.
- **Looks:** a premium mini-report: colour palette that suits them, gaps ("you have no neutral bottoms"), 10 outfit combos from current closet.
- **Works:** deeper AI pass (batched, low-cost) + optional human review; delivered as an in-app report + emailed PDF (Resend).
- **Tier:** Paid add-on / 1 free per quarter for Pro. **Role:** low-friction first payment that de-risks subscribing.

### 5.10 Upgrade / paywall surface
- **Where:** `/upgrade` sheet, triggered contextually.
- **Looks:** clean bottom sheet, warm imagery, anchored pricing (₹149 → ₹99, ₹999/yr "2 months free"), single primary CTA, testimonial line, "cancel anytime."
- **Works:** Razorpay checkout → webhook → set `subscription_status`/`plan` → unlock via a single `getEntitlements(user)` gate used everywhere.
- **Tier:** n/a. **Role:** conversion.

### 5.11 Admin Feature Control Panel (on/off + Auto vs Human toggles) — **new**
- **Where:** `/admin/controls` (extend the existing `admin` area).
- **Looks:** a simple settings board of labelled toggle switches grouped by feature, each showing current mode and a coloured state (green = Auto/On, amber = Human-approve, grey = Off). A "changes apply live" note.
- **Works:** a single `feature_flags` table (one row of key→value, service-role write) read by a cached `getFlags()` helper. Every generation path checks its flag:
  - **Generation mode** per feature (Daily Drop, Occasions, Manual Analysis): `auto` (default, human-less) or `human` (routes results to the existing `/admin/requests` approval queue before the user sees them).
  - **Feature on/off kill-switches:** Daily Drop, Occasions, Swaps, Manual Analysis, Share/Vote, Notifications, Referral — each can be disabled instantly (incident control, cost control, or staged rollout).
  - **Cost guardrails:** global daily AI budget cap, per-user daily generation cap, and a "eco mode" master switch (§7.6) — all adjustable here without a deploy.
- **Tier:** internal (admin only, `is_admin` gated). **Role:** lets you run human-less by default but flip any feature to manual review or off in seconds — no code change, no redeploy.

```sql
-- 0018_feature_flags.sql
create table feature_flags (
  key text primary key,        -- e.g. 'daily_drop.mode', 'occasions.enabled', 'ai.daily_budget'
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz default now()
);
alter table feature_flags enable row level security;
create policy "admin read flags" on feature_flags for select
  using (exists (select 1 from profiles p where p.id=auth.uid() and p.is_admin));
-- writes: service role only (admin API route verifies is_admin, then writes).
-- Defaults seeded: *.mode='auto', *.enabled=true.
```

---

## 6. Information architecture / navigation

**Bottom tab bar (mobile-first PWA):**
`Today (Daily Drop)` · `Closet` · `Occasions (+)` · `Lookbook` · `Profile`
- "Today" is the default landing every session — reinforces the daily habit.
- Streak flame + notification bell live in the top bar on Today.
- Upgrade nudges appear only contextually (never a nagging tab).

---

## 7. Build-ready technical architecture

### 7.1 Stack (confirmed, low-cost)
Next.js 14 (App Router, TS) · Tailwind + shadcn/ui · Supabase (Postgres + Auth + Storage + RLS) · Vercel (hosting + cron) · **Razorpay** (payments) · **Resend** (email) · **Firebase Cloud Messaging** (web push, free) · optional **Twilio/WhatsApp** (opt-in reminders) · **PostHog** (product analytics, generous free tier) · **Sentry** (errors, free tier). AI via your existing provider, called server-side only, batched + cached.

### 7.2 New/changed data model (additive migrations `0012+`)

```sql
-- 0012_subscriptions.sql
create table subscriptions (
  user_id uuid primary key references auth.users on delete cascade,
  plan text not null default 'free',              -- 'free' | 'pro'
  status text not null default 'trialing',        -- trialing|active|past_due|canceled|expired
  trial_ends_at timestamptz,                      -- now()+7 days at signup
  current_period_end timestamptz,
  razorpay_subscription_id text,
  razorpay_customer_id text,
  updated_at timestamptz default now()
);
alter table subscriptions enable row level security;
create policy "own subscription read" on subscriptions
  for select using (auth.uid() = user_id);
-- writes ONLY via service role (webhook/server). No client write policy.

-- 0013_streaks.sql
create table streaks (
  user_id uuid primary key references auth.users on delete cascade,
  current_count int not null default 0,
  longest_count int not null default 0,
  last_active_date date,
  freezes_remaining int not null default 0
);
alter table streaks enable row level security;
create policy "own streak read" on streaks for select using (auth.uid()=user_id);

-- 0014_saved_looks.sql  (Lookbook)
create table saved_looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  suggestion_id uuid,               -- link to approved outfit suggestion
  created_at timestamptz default now()
);
alter table saved_looks enable row level security;
create policy "own looks all" on saved_looks
  using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- 0015_push_subscriptions.sql (FCM tokens + reminder prefs)
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  fcm_token text not null,
  reminder_time time default '07:30',
  channel text default 'push',      -- push|whatsapp|email
  timezone text default 'Asia/Kolkata',
  enabled boolean default true,
  unique(user_id, fcm_token)
);
alter table push_subscriptions enable row level security;
create policy "own push all" on push_subscriptions
  using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- 0016_referrals.sql (share/vote + referral growth)
create table share_tokens (
  token text primary key,           -- random, signed
  user_id uuid not null references auth.users on delete cascade,
  suggestion_ids uuid[] not null,
  votes jsonb default '{}',
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
-- public vote route reads by token via service role + rate limit; no broad RLS select.

-- 0017_events.sql (server-side analytics mirror; PostHog is primary)
create table app_events (
  id bigint generated always as identity primary key,
  user_id uuid,
  name text not null,
  props jsonb default '{}',
  created_at timestamptz default now()
);
```

### 7.3 Entitlement gate (single source of truth)
One server helper `getEntitlements(userId)` returns `{ plan, isTrialActive, limits }`. Every gated action (swap, 3-ideas, save #6, occasion type, upload #16) calls it **server-side**. Never trust the client for gating — the client only hides/greys UI; the API enforces.

```ts
// pseudo
const e = await getEntitlements(userId);
if (action === 'swap' && !e.limits.unlimitedSwaps) return deny('upgrade');
```

### 7.4 New API routes
- `POST /api/billing/create-subscription` → Razorpay order/subscription.
- `POST /api/billing/webhook` → verify signature, update `subscriptions` (service role).
- `POST /api/streaks/checkin` → idempotent daily increment/reset.
- `POST /api/looks` / `DELETE /api/looks/[id]` → Lookbook (enforce free cap).
- `POST /api/push/register` → store FCM token.
- `POST /api/share` → create token; `GET /api/vote/[token]` + `POST /api/vote/[token]` → public, rate-limited.
- Cron: `GET /api/cron/notify/morning` (send drops), `/api/cron/notify/streak-risk`, `/api/cron/recap/weekly` (Vercel Cron, secured by `CRON_SECRET`).

### 7.5 Notifications pipeline
Nightly `daily-drop/prepare` (exists) → morning cron reads `push_subscriptions` per timezone window → sends via FCM (free) with Resend email fallback; WhatsApp only for opted-in + template-approved users. All sends logged to `app_events`. Respect quiet hours + per-user reminder_time.

### 7.6 Cost & token control (aggressive — human-less means AI is the main cost, so cut tokens hard)

Because generation is now automatic, AI tokens are the dominant variable cost. The goal: **most daily outfits cost ~zero new tokens.** Techniques, in priority order:

1. **Rule-engine first, AI last (biggest saver).** Outfit assembly is primarily a *matching problem*, not a language problem. Do colour/pattern/occasion pairing with a deterministic rules engine over the already-stored tags (type, colour, pattern, formality, season). AI is only called when the rules engine can't produce enough valid combos. For a tagged wardrobe, ~80–90% of daily drops need **no LLM call at all**.
2. **Tag once, never re-tag.** Auto-tag on upload only; store structured tags. All future outfit logic reads tags — zero image/LLM cost per outfit. Never re-send an image the app has already tagged.
3. **Nightly batch + cache.** Pre-compute each user's drop + a few "another option" candidates in ONE nightly job and cache them. Opening the app reads the cache = 0 tokens. Swaps first pull from cached candidates before any live call.
4. **Small model + tight prompts.** When AI is needed, use the cheapest sufficient model with a compact structured prompt (IDs + short tags, not prose; JSON out, low max-tokens). No verbose system prompts. Trim context to only the candidate items.
5. **Dedupe & memoize.** Identical wardrobe+occasion+weather inputs return the cached result. Hash the input; reuse the output.
6. **Per-user + global caps (admin-adjustable, §5.11).** Free users get cached results only (no live AI on demand); Pro on-demand swaps are capped/day. A global daily AI budget cap + "eco mode" (rules-only, AI paused) protects against cost spikes and attacks.
7. **Batch API / off-peak.** Run the nightly job via batch pricing where available.
- **Infra:** Supabase free/low tier + Vercel Hobby/Pro; FCM push free; PostHog + Sentry free tiers; Resend free tier. Images compressed on upload, served via CDN.
- **Target:** blended AI cost per active user in the low single-digit rupees/month — a small fraction of the ₹99 price, so Pro is profitable from user ~1 and free users are cheap to serve.

---

## 8. Security hardening (so it doesn't crack under attack)

Generation is now human-less, so the **outfit validator (fail-closed) becomes the primary quality/safety gate** — keep it enforced in all 3 places (AI gen, any admin path, server approve API) and make it run automatically before any result reaches a user. The admin can re-enable human review per feature via the toggle panel (§5.11) but it is off by default. Add:

1. **RLS everywhere, deny-by-default.** Every table has RLS on; users can only read/write their own rows. Billing/streak/share writes are **service-role only** (no client write policy) so a user can't self-upgrade or fake a streak.
2. **Server-side entitlement enforcement.** Gating lives in API routes, never only in the client. Assume the client is hostile.
3. **Webhook signature verification.** Razorpay webhooks verified via HMAC secret before any DB write; reject unsigned/replayed events (idempotency key on event id).
4. **Auth on every route.** Middleware (`middleware.ts`, exists) guards `(app)` and `admin`; admin routes additionally check an `is_admin` claim/allowlist. Public routes (`/vote/[token]`) are the *only* unauthenticated surface and are read-scoped + rate-limited.
5. **Rate limiting + abuse protection.** Per-IP and per-user limits on AI generation, uploads, vote, and auth endpoints (Upstash Redis or Vercel middleware). Blocks scraping, cost-bombing, and brute force.
6. **Input validation everywhere.** Zod schemas on every API body/param; reject oversized/invalid uploads (type + size + dimension checks) before storage — prevents malicious file / storage-abuse attacks.
7. **Storage security.** Signed URLs, per-user folders, no public bucket listing; strip EXIF/GPS from uploaded images (privacy + safety for the target audience).
8. **Secrets hygiene.** All keys in Vercel/Supabase env only; service-role key never shipped to client; rotate on exposure. `.env.local` git-ignored (confirm).
9. **CSRF/CORS + headers.** Same-origin API, strict CORS, security headers (CSP, HSTS, X-Frame-Options) via `next.config`/middleware.
10. **PII minimisation + compliance.** Store the minimum; WhatsApp/marketing sends require explicit opt-in (India DPDP + WhatsApp policy); provide account + data deletion. No third party sees raw wardrobe images.
11. **Monitoring.** Sentry for errors, alerting on auth failures/spikes; PostHog for anomaly detection; log admin actions.
12. **Dependency & CI.** `npm audit`/Dependabot; type-check + lint + build gate in CI before deploy (note: sandbox can't reach npm registry — verify structurally, run installs/builds in a networked env).

---

## 9. Success metrics & instrumentation (PostHog events)

Map every project success metric to a tracked event:

| Goal | Event | Target |
|---|---|---|
| Upload ≥10 clothes | `wardrobe_item_added` (count≥10) | ≥60% of signups |
| First outfit <5 min | `first_outfit_generated` (Δ from signup) | median <5 min |
| Save ≥1 look | `look_saved` | ≥40% |
| Return within 7 days | `session_start` D1–D7 | D7 retention ≥25% |
| Share / ask a friend | `share_created`, `vote_cast` | ≥15% share rate |
| Willing to pay | `upgrade_started`, `subscription_active`, `analysis_purchased` | trial→paid ≥5–8% |

North-star: **7-day retained users who logged an outfit ≥4 of last 7 days** (habit formed).

---

## 10. Build roadmap (phased, executable)

**Phase 0 — Foundations (already largely done).** Auth, wardrobe, tagging, occasions, AI drafts, daily drop, feedback, validation, admin. ✅

**Phase 0.5 — Go human-less + admin toggles.** Switch generation to auto by default (validator-gated), build the rules-engine-first assembler (§7.6), add the Admin Feature Control Panel + `feature_flags` (`0018`). → removes the manual bottleneck and slashes tokens immediately.

**Phase 1 — Habit core.** Streaks (`0013`), Lookbook (`0014`), redesigned Today/Daily Drop hero, bottom-nav IA. → hits retention metrics.

**Phase 2 — Notifications.** FCM web push (`0015`) + morning/streak/weekly crons + reminder-time onboarding step + Resend fallback. → drives daily open.

**Phase 3 — Monetization.** Subscriptions (`0012`), `getEntitlements` gate, `/upgrade` paywall, Razorpay + webhook, ₹199 Manual Analysis, contextual paywall timing. → revenue.

**Phase 4 — Growth.** Share/vote public loop (`0016`), referral, weekly recap sharing. → K-factor.

**Phase 5 — Harden & scale.** Rate limiting, Zod everywhere, Sentry/PostHog wired, security checklist §8 complete, load/attack testing. → production-grade.

Each phase ships behind a flag, is independently testable, and combines into the full product.

---

## 11. Definition of done (per feature)
A feature is done only when: (1) works end-to-end on mobile PWA, (2) gated server-side by entitlements, (3) RLS-protected, (4) instrumented with PostHog events, (5) errors captured in Sentry, (6) validated inputs, (7) passes the outfit validator where relevant, and (8) no console/type/build errors. See the companion **Fable 5 build prompt** for the executable version of this.
