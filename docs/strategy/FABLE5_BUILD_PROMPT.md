# WearWise — Fable 5 Build Execution Prompt

> Copy everything below the line into Fable 5 as the build brief. It is written to be executed module by module. Opus 4.8 planned it; Fable 5 builds, debugs, and hardens until it runs smoothly. Read the companion `WEARWISE_FULL_PLAN.md` for full rationale — this file is the executable spec.

---

## ROLE & MISSION

You are building **WearWise**, a mobile-first PWA that tells Indian people (18–60) what to wear each day from clothes they already own. A working Next.js 14 + Supabase skeleton already exists (auth, wardrobe upload + auto-tag, occasions, AI drafts, daily drop, feedback, validation, admin). **Do not rebuild it. Extend it.** Ship a full production app — not a prototype — with a Free trial → Pro paywall, daily-habit retention loops, notifications, an admin control panel, and security hardening. Build in the phases below, in order. After each phase: run type-check, lint, build; fix every error before moving on.

## HARD RULES (apply to every module)

1. **Human-less by default.** Outfit generation is fully automatic. No manual approval step in the user flow. The **outfit validator (fail-closed)** runs automatically on every result before a user sees it and silently regenerates/repairs invalid outfits.
2. **Admin can override per feature.** Build a `feature_flags`-driven Admin Control Panel with on/off kill-switches and an **Auto ↔ Human-approve** toggle per generation feature. Default = auto. When flipped to human, results route to the existing `/admin/requests` queue first.
3. **Rules engine first, AI last.** Assemble outfits with a deterministic matching engine over stored tags (type, colour, pattern, formality, season, occasion). Call the LLM only when the engine can't produce enough valid combos. Target: ≥80% of daily drops use **zero** live LLM tokens.
4. **Tokens are the main cost — minimise them.** Tag each item once on upload (never re-tag). Pre-compute + cache drops nightly in one batch. Cheapest sufficient model, compact JSON-in/JSON-out prompts, low max-tokens, memoize identical inputs. Free users get cached results only; Pro on-demand calls are capped.
5. **Enforce entitlements server-side.** A single `getEntitlements(userId)` gate guards every limited action in the API. The client only greys out UI; never trust it.
6. **Security is not optional.** RLS deny-by-default on every table; billing/streak/flag writes are service-role only; verify Razorpay webhook signatures; validate all inputs with Zod; rate-limit AI/upload/auth/vote routes.
7. **Instrument everything.** Fire PostHog events for the success metrics; capture errors in Sentry.
8. **Design system.** Warm ivory backgrounds, charcoal text, muted rose/plum/sage accents, large outfit cards, minimal clutter, mobile-first. Reuse existing tokens/components (Inter + Instrument Serif).
9. **Additive migrations only** (`0012+`). Never break existing schema.

## STACK
Next.js 14 (App Router, TS) · Tailwind + shadcn/ui · Supabase (Postgres/Auth/Storage/RLS) · Vercel (host + cron) · Razorpay (pay) · Resend (email) · Firebase Cloud Messaging (web push) · optional Twilio/WhatsApp (opt-in) · PostHog · Sentry.

---

## THE TWO PLANS (build the gate to match exactly)

**Basic (Free):** 7-day full Pro trial, then limited — 15 wardrobe items, 1 daily drop (no swaps), Casual+Office occasions only, 1 idea/request, 5 saved looks, streaks + sharing stay free.
**Pro (₹99/mo launch, ₹149 anchor, ₹999/yr):** unlimited items, unlimited swaps/options, all occasions, 3 ideas, unlimited Lookbook, weather-aware, plan-ahead, streak freezes, quarterly free Manual Analysis, no ads. Plus **₹199 one-time Manual Wardrobe Analysis** as a first-purchase primer.

Full gating table is in `WEARWISE_FULL_PLAN.md §2.3` — implement it verbatim in `getEntitlements`.

---

## BUILD MODULES (do in order; each is independently shippable behind a flag)

### MODULE A — Human-less engine + Admin Control Panel
- Build `lib/outfit-engine.ts`: deterministic assembler over stored tags → returns valid outfits; only escalates to `lib/ai.ts` when it can't fill the request. Keep the fail-closed validator between engine/AI output and the user.
- Remove the human approval step from the *user* path for Daily Drop and Occasions (auto-serve validated results).
- Migration `0018_feature_flags.sql` (see plan §5.11). Seed defaults: every `*.mode='auto'`, every `*.enabled=true`, `ai.daily_budget` + `ai.per_user_daily_cap` set.
- `lib/flags.ts` → cached `getFlags()`.
- `/admin/controls` page: grouped toggle switches (green Auto/On, amber Human, grey Off) for Daily Drop, Occasions, Manual Analysis, Swaps, Share/Vote, Notifications, Referral + numeric inputs for budget/caps + "eco mode" master switch. Writes via an admin-only API route that verifies `is_admin` then service-role-writes the flag.
- **Acceptance:** flipping a feature to Human sends new results to `/admin/requests`; flipping Off disables it instantly with a friendly user message; eco mode forces rules-only (no LLM). All without redeploy.

### MODULE B — Token/cost controls
- Nightly batch job caches each user's drop + N "another option" candidates. App open reads cache (0 tokens). Swaps pull from cache before any live call.
- Memoize: hash `{wardrobe_version, occasion, weather_bucket}` → cached outfit.
- Enforce `ai.daily_budget` + `ai.per_user_daily_cap`; when exceeded, fall back to rules-only and log an `app_event`.
- **Acceptance:** with a fully tagged wardrobe, generating a week of drops triggers ≤ a handful of LLM calls; logs show cache hits dominate.

### MODULE C — Habit core
- `0013_streaks.sql` + `/api/streaks/checkin` (idempotent). Streak flame on Today, milestone celebrations (3/7/14/30/100) with shareable cards. Pro streak-freeze (2/mo).
- `0014_saved_looks.sql` + Lookbook tab + `/api/looks` (enforce free cap of 5).
- Redesign `/dashboard` "Today" into the single hero Daily Drop card (Wore this today · Swap · Another option). Bottom nav: Today · Closet · Occasions(+) · Lookbook · Profile.
- **Acceptance:** logging an outfit increments the streak once/day; 6th saved look prompts upgrade; Today is the default landing.

### MODULE D — Notifications
- `0015_push_subscriptions.sql` + FCM web push register route + service worker.
- Onboarding step to set reminder time (default 07:30, `Asia/Kolkata`).
- Crons (Vercel, `CRON_SECRET`-guarded): `notify/morning` (send drop), `notify/streak-risk`, `recap/weekly`. Resend email fallback; WhatsApp only if opted-in + template-approved.
- Discipline: max 1 primary daily + ≤2 contextual/week; respect quiet hours. Every send logged.
- **Acceptance:** at the user's set time they get one "outfit ready" push; missing a day triggers a streak-risk nudge; Sunday recap fires.

### MODULE E — Monetization
- `0012_subscriptions.sql`; set `trial_ends_at = now()+7d` at signup.
- `getEntitlements(userId)` → `{plan, isTrialActive, limits}`; wire into every gated route.
- `/upgrade` bottom sheet: anchored pricing, one CTA, testimonial, "cancel anytime"; trigger contextually after a *success* moment (wore/shared), never after a failure.
- Razorpay: `create-subscription` + signature-verified `webhook` (service-role write, idempotent on event id). ₹199 Manual Analysis flow → AI report + emailed PDF (Resend).
- **Acceptance:** trial expiry drops user to free limits; successful payment unlocks Pro via the single gate; webhook rejects unsigned/replayed events; a user cannot self-upgrade by client calls.

### MODULE F — Growth
- `0016_referrals.sql` (share_tokens). Share action → signed public token → `/vote/[token]` no-auth page (rate-limited, no PII) with branded card + "Make your own" CTA; votes tally back to owner; voter sees signup prompt. Referral credit.
- **Acceptance:** a friend can vote without an account; owner sees the tally; the public route is rate-limited and leaks no PII.

### MODULE G — Harden & instrument
- `0017_events.sql` mirror + PostHog events for all §9 metrics; Sentry wired.
- Security checklist (plan §8): RLS audit, service-role-only writes for billing/streak/flags, Zod on every route, rate limiting (Upstash/Vercel) on AI/upload/auth/vote, signed storage URLs + EXIF strip, security headers (CSP/HSTS), account+data deletion, secrets in env only.
- **Acceptance:** the security checklist passes; an unauthenticated or hostile client cannot read others' data, self-upgrade, fake streaks, or cost-bomb the AI.

---

## DEBUG & QUALITY LOOP (run until smooth)
After each module: `tsc --noEmit`, `eslint`, `next build`. Fix all errors/warnings. Write a smoke test for the module's happy path + one abuse case (e.g. client tries a Pro action on free). Manually verify on a mobile viewport. Confirm no console errors. Only then proceed. Note: if the build environment can't reach the npm registry, verify structurally and run installs/builds in a networked environment (Vercel preview) — don't assume a broken install means broken code.

## DEFINITION OF DONE (whole app)
Every feature: works end-to-end on mobile PWA · gated server-side · RLS-protected · auto-validated (no human step unless admin-toggled) · instrumented in PostHog · errors in Sentry · inputs Zod-validated · zero type/lint/build errors · token cost per drop ≈ 0 on cache hits. Ship behind flags, roll out per phase (plan §10), combine into the full product.
