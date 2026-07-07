# WearWise — Go-To-Market Strategy

**Owner:** Prashant · **Market:** India · **First niche:** Indian women 22–40 (office/casual/ethnic/festive/travel wardrobes) · **Positioning:** *Your daily stylist, from clothes you already own.*

The product is engineered for GTM: the share/vote loop, referral tokens, streak cards, anchored pricing, and the ₹199 analysis primer are already live in the app. This document is the plan that activates them.

---

## 1. Positioning & message

One sentence: **"Upload your clothes once. Every morning, one perfect outfit — from your own wardrobe."**

The enemy is not other apps — it is the 15 stressful minutes in front of the cupboard. Every piece of copy attacks decision fatigue, never fashion insecurity. Tone: a stylish, practical friend. Never body-talk, never "look thinner," never judgment.

Message hierarchy by audience temperature: cold audiences hear the pain ("Tired of 'I have nothing to wear'?"), warm audiences hear the mechanism ("AI styles what's already in your cupboard"), hot audiences hear the offer ("7 days of full Pro, free — outfit ready by 7:30 tomorrow").

## 2. Launch sequence (12 weeks)

**Weeks 1–2 — Private beta hardening.** 30–50 hand-recruited women (friends-of-friends, office WhatsApp groups, society groups in Pune/Mumbai/Bangalore). Goal: first-outfit-in-5-minutes ≥ 80%, D7 ≥ 25% inside the beta before spending a rupee on acquisition. Fix the top 3 friction points weekly using PostHog funnels.

**Weeks 3–4 — Content seeding.** Instagram Reels + YouTube Shorts are the entire top of funnel; the audience lives there. Three repeatable formats, 3–4 posts/week:
1. *"Styled from her own closet"* — before (cupboard chaos) → after (WearWise drop card). UGC-style, real wardrobes.
2. *Occasion panic* — "Wedding in 3 hours and nothing to wear" → 3 looks from clothes she owns.
3. *Streak culture* — "Day 30 of never deciding what to wear" (uses the in-app shareable streak card).

**Weeks 5–8 — Micro-influencer burst.** 20–30 nano/micro creators (5k–80k followers, fashion + "corporate girl" + festive content, Hindi/English mix). Barter + small fee (₹2–8k). Deliverable: one Reel of them uploading their real wardrobe and wearing the drop. Trackable via referral links (`?ref=` tokens already supported). Target blended CAC < ₹40/install at this stage.

**Weeks 9–12 — Festive spike.** India's calendar is the growth engine: plan bursts 2 weeks before each festive window (Raksha Bandhan, Navratri, Diwali, wedding season). The in-app occasion pre-alerts and festive drop content align with paid + organic pushes: "9 days of Navratri, 9 looks from your own wardrobe."

## 3. Growth loops (already built into the product)

1. **Vote loop:** "Can't decide? Ask a friend" → public `/vote/[token]` page → friend votes without an account → "Make your own with WearWise" CTA. Track K-factor = invites × conversion; push share prompts at success moments only.
2. **Streak cards:** milestone celebrations (3/7/14/30/100) generate share moments organically — streaks are free on purpose.
3. **Weekly recap:** "you saved ~35 min this week" is inherently screenshot-able; add a share button to the recap next iteration.

## 4. Monetization plan

Prices: **₹99/mo launch (₹149 anchor), ₹999/yr, ₹199 one-time Manual Analysis.** Free trial = 7 days of full Pro; the paywall fires only after success moments (wore/shared/6th save/locked occasion) — all wired in-app. Never discount below ₹79/mo effective; discount with *time* (extra trial days, streak freezes) instead.

Funnel targets: signup → 10 items uploaded ≥ 60% · trial → paid 5–8% · analysis-buyer → subscriber ≥ 25% within 60 days. The ₹199 analysis is the ladder's first rung — market it to trial-expired users as "not ready to subscribe? get the one-time report."

## 5. Channels ranked

1. **Instagram Reels / YT Shorts (organic + creators)** — primary; the demo IS the content.
2. **WhatsApp** — India's highest-open channel: shared vote links, referral messages, and (later, post-template-approval) opt-in reminders.
3. **Meta ads** — only after D7 ≥ 25% and trial→paid ≥ 5% are proven; start ₹500/day, creative = the top 3 organic Reels.
4. **SEO/content** — "what to wear to an Indian wedding as a guest," "office wear capsule India" — compounding, start month 2.
5. **Communities** — society groups, office Slack/WhatsApp, college fests (the 18–24 expansion later).

## 6. Launch-week checklist (product side — all built)

- [ ] Run migrations 0012–0019 in Supabase · seed flags (0018 seeds defaults)
- [ ] Set env: Razorpay (keys, webhook secret, plan IDs), Resend, FCM/Firebase public config + server key, CRON_SECRET, PostHog, OpenAI
- [ ] Configure Razorpay webhook → `/api/billing/webhook` (subscription events + payment.captured)
- [ ] Verify crons live in Vercel (drop prepare, morning notify, streak-risk, weekly recap)
- [ ] Test end-to-end on a real phone: signup → upload 10 → first outfit < 5 min → wear → streak → share → vote from second phone → trial expiry → upgrade
- [ ] Eco mode + kill-switches tested from `/admin/controls`

## 7. Metrics that decide everything (PostHog, already instrumented)

North-star: **7-day retained users who logged an outfit ≥4 of the last 7 days.**
Weekly review: activation (10 items, first outfit <5 min), D1/D7 retention, morning push open rate, share rate ≥15%, vote→signup conversion, trial→paid ≥5%, AI cost per active user (target: low single-digit ₹/month — engine cache hit rate ≥80%).

Rule: if D7 < 20% after week 4, stop all acquisition and fix the morning loop. Retention first, growth second, monetization third — the order is non-negotiable.
