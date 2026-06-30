# WearWise — AI Auto-Approve Cost & Profit Model (No Manual Labour)

**Scope:** documentation/analysis only. No code, DB, keys, or RLS changed.
**Date:** 2026-06-26 · Companion to `COST_MODEL_1000_USERS.md`.

> **What changed from the first model**
> 1. **No manual admin/stylist labour** — outfit drafts are **auto-approved by AI** and shown to the user directly.
> 2. **Per-user daily generation limits** replace human review as the cost-control mechanism.
> 3. Result: the dominant cost from the first model (₹6k–₹70k/month labour) becomes **₹0**. Cost is now just **AI + fixed infra + payment fees** — all tiny. Margins jump to **75–96%**.
>
> **[OPINION]** Removing the human is the single biggest economic unlock for WearWise. The trade is **cost → quality risk**: with no review, prompt safety and output validation must carry the quality bar. The code already does meaningful guarding (banned-descriptor sanitising, id-validation, JSON schema, confidence scores) — keep strengthening that instead of paying humans.

**Pricing facts (2026):** gpt-4o-mini $0.15/$0.60 per 1M in/out tokens · Razorpay 2.36% effective (2% + 18% GST) · Supabase Pro $25 + Vercel Pro $20 ≈ **₹3,910/mo fixed infra** · ₹85/$1 **[ASSUMPTION ⚠ VERIFY]**.

---

## 1. The new cost structure (one glance)

| Cost | First model (with labour) | This model (AI auto-approve) |
|---|---|---|
| Manual review labour | ₹6,000–₹70,000 / mo | **₹0** |
| AI (OpenAI) | ₹241–₹2,061 / mo | ₹241–₹2,061 / mo (unchanged) |
| Fixed infra | ₹3,910 / mo | ₹3,910 / mo |
| Payment fees | 2.36% of revenue | 2.36% of revenue |
| **Dominant cost** | **Human labour** | **Fixed infra (₹3,910)** |

**Per-call AI cost [FACT, gpt-4o-mini]:** auto-tag ≈ **₹0.053**, outfit draft ≈ **₹0.042 (small wardrobe)** / **₹0.056 (mid)** / **₹0.082 (big wardrobe)**. One "generation" = one draft call = 3 outfits.

---

## 2. Daily generation limit — the new cost-safety valve

With no human gate, the only runaway risk is a user (or abuser) generating thousands of drafts. A **per-user daily cap** bounds that completely. Because each generation costs <₹0.10, even generous caps are cheap.

**Worst-case AI ceiling per user/month if they max the cap every day (big wardrobe, ₹0.082/call):**

| Daily cap | Calls / month | Max AI cost / user / mo (big wardrobe) | Realistic (mid) |
|---|---|---|---|
| 1 / day | 30 | ₹2.45 | ₹1.68 |
| 2 / day | 60 | ₹4.90 | ₹3.37 |
| **3 / day** | 90 | **₹7.34** | ₹5.05 |
| 5 / day | 150 | ₹12.24 | ₹8.41 |
| 10 / day | 300 | ₹24.48 | ₹16.83 |

**[OPINION] Recommended caps:** Free **1/day**, Standard (₹149–₹199) **3/day**, Premium (₹299–₹499) **5–10/day**. Even the 10/day premium tier costs at most ~₹24/user/month in AI against a ₹299–₹499 price — i.e. the cap is a brand/abuse guard, **not** a margin lever. Set it for product feel, not for cost.

> Implementation note (analysis only — not to build now): a daily cap is a counter check (e.g. `generations_today < cap`) before calling `generate-drafts`. It needs **no** new AI spend and no labour.

---

## 3. AI cost per paying subscriber / month (by engagement)

A "generation" = one outfit-draft call. Onboarding auto-tag of a 12-item wardrobe is a **one-time ₹0.64** (≈₹0.05/mo amortised).

| Engagement | Generations / mo | AI cost / sub / mo (small→big wardrobe) |
|---|---|---|
| Light | 8 | ₹0.34 → ₹0.65 |
| Medium | 20 | ₹0.84 → ₹1.63 |
| Heavy (~2/day) | 45 | ₹1.89 → ₹3.67 |
| Power (~5/day) | 90 | ₹3.79 → ₹7.34 |
| Abuse (10/day cap) | 300 | ₹12.62 → ₹24.48 |

**[FACT/derived] Takeaway:** even a *power user* costs **under ₹8/month** in AI. There is no realistic usage pattern under a sane cap that makes a paying subscriber unprofitable. This is the opposite of the first model, where a heavy user *lost* money on labour.

---

## 4. Cost using various techniques (per paying sub/mo, Medium = 20 gen)

The cost-minimisation techniques from the first model, applied here. **Honest framing:** at this scale AI is already so cheap that these techniques are mostly about **scale-readiness and abuse-safety**, not rupee savings.

| Technique stack | Draft AI | Onboard AI | Total / sub / mo | Saving |
|---|---|---|---|---|
| **Baseline** (current code) | ₹1.12 | ₹0.05 | **₹1.18** | — |
| + Cache/skip/dedupe auto-tags (retry → 1.0) | ₹1.12 | ₹0.05 | ₹1.17 | negligible at 1k |
| + **Rule-based first-pass** (serve ~40% of generations with no AI) | ₹0.67 | ₹0.05 | **₹0.73** | **−38%** |
| + Metadata-only drafts (already in code) | — | — | banked | already saved |
| + Daily cap (1/3/5 per day) | bounds worst case | — | ceiling ₹2.45–₹12.24 | safety, not avg |

**[OPINION] Ranking for THIS model:**
1. **Daily cap** — essential (abuse safety), near-zero average cost impact.
2. **Output validation / quality guards** — replaces the human; protects the brand. Highest *non-cost* priority.
3. **Rule-based first pass** — only meaningful AI saving (~38%), and it also *speeds up* responses. Build later, not for cost but for latency + scale.
4. Cache/dedupe auto-tags — cheap hygiene; do it.
5. Image compression — storage already ₹0 at 1k users; do it for upload speed/egress headroom at scale.
6. Hard OpenAI spend limit + Supabase/Vercel alerts — **day one**, regardless.

---

## 5. Profit vs number of active subscribers (the comparison you asked for)

Assumptions: **Medium engagement (AI ₹1.18/sub/mo)**, Razorpay 2.36%, fixed infra ₹3,910/mo. Profit = `subs × price × (1 − 2.36%) − subs × AI − ₹3,910`. **[ASSUMPTION ⚠ VERIFY engagement + conversion]**

### ₹149 / month
| Subs | Gross | Fees | AI | Fixed | **Profit/mo** | Margin |
|---|---|---|---|---|---|---|
| 50 | ₹7,450 | ₹176 | ₹59 | ₹3,910 | **₹3,305** | 44% |
| 100 | ₹14,900 | ₹352 | ₹118 | ₹3,910 | **₹10,521** | 71% |
| 250 | ₹37,250 | ₹879 | ₹294 | ₹3,910 | **₹32,167** | 86% |
| 500 | ₹74,500 | ₹1,758 | ₹588 | ₹3,910 | **₹68,244** | 92% |
| 1000 | ₹149,000 | ₹3,516 | ₹1,175 | ₹3,910 | **₹140,398** | 94% |

### ₹199 / month
| Subs | Gross | Fees | AI | Fixed | **Profit/mo** | Margin |
|---|---|---|---|---|---|---|
| 50 | ₹9,950 | ₹235 | ₹59 | ₹3,910 | **₹5,746** | 58% |
| 100 | ₹19,900 | ₹470 | ₹118 | ₹3,910 | **₹15,403** | 77% |
| 250 | ₹49,750 | ₹1,174 | ₹294 | ₹3,910 | **₹44,372** | 89% |
| 500 | ₹99,500 | ₹2,348 | ₹588 | ₹3,910 | **₹92,654** | 93% |
| 1000 | ₹199,000 | ₹4,696 | ₹1,175 | ₹3,910 | **₹189,218** | 95% |

### ₹299 / month
| Subs | Gross | Fees | AI | Fixed | **Profit/mo** | Margin |
|---|---|---|---|---|---|---|
| 50 | ₹14,950 | ₹353 | ₹59 | ₹3,910 | **₹10,628** | 71% |
| 100 | ₹29,900 | ₹706 | ₹118 | ₹3,910 | **₹25,167** | 84% |
| 250 | ₹74,750 | ₹1,764 | ₹294 | ₹3,910 | **₹68,782** | 92% |
| 500 | ₹149,500 | ₹3,528 | ₹588 | ₹3,910 | **₹141,474** | 95% |
| 1000 | ₹299,000 | ₹7,056 | ₹1,175 | ₹3,910 | **₹286,858** | 96% |

### ₹499 / month
| Subs | Gross | Fees | AI | Fixed | **Profit/mo** | Margin |
|---|---|---|---|---|---|---|
| 50 | ₹24,950 | ₹589 | ₹59 | ₹3,910 | **₹20,392** | 82% |
| 100 | ₹49,900 | ₹1,178 | ₹118 | ₹3,910 | **₹44,695** | 90% |
| 250 | ₹124,750 | ₹2,944 | ₹294 | ₹3,910 | **₹117,602** | 94% |
| 500 | ₹249,500 | ₹5,888 | ₹588 | ₹3,910 | **₹239,114** | 96% |
| 1000 | ₹499,000 | ₹11,776 | ₹1,175 | ₹3,910 | **₹482,138** | 97% |

**[OPINION] Pattern:** profit is essentially **(price − 2.36% fee) × subscribers − ₹3,910**. AI is so small it barely registers. Margin climbs toward the high-90s as subscribers grow because the only meaningful cost (fixed infra) is spread thinner. WearWise becomes a near-pure-software-margin business once the human is removed.

---

## 6. Break-even (subscribers needed to cover ₹3,910 fixed)

| Plan | Contribution / sub | **Break-even subscribers** |
|---|---|---|
| ₹149 / mo | ₹144.3 | **~27** |
| ₹199 / mo | ₹193.1 | **~20** |
| ₹299 / mo | ₹290.8 | **~13** |
| ₹499 / mo | ₹486.0 | **~8** |

**[FACT/derived]** You are profitable from **8–27 paying subscribers** depending on price. Everything beyond that is ~95% margin.

---

## 7. Worst-case stress test (all subscribers are power users)

Every subscriber generates 90 drafts/month on a big wardrobe (₹7.34 AI/sub) — an unrealistically heavy whole base:

| Subs | Plan | AI / sub | **Profit / mo** | Margin |
|---|---|---|---|---|
| 100 | ₹199 | ₹7.34 | ₹14,786 | 74% |
| 100 | ₹299 | ₹7.34 | ₹24,550 | 82% |
| 500 | ₹199 | ₹7.34 | ₹89,570 | 90% |
| 1000 | ₹199 | ₹7.34 | ₹183,050 | 92% |
| 1000 | ₹299 | ₹7.34 | ₹280,690 | 94% |

**[OPINION]** Even the pessimistic stress case stays **above 74% margin**. The business is not cost-fragile under this model. The risks are now **demand-side** (will people subscribe? will AI quality retain them?), not cost-side.

---

## 8. Infrastructure scaling note (when ₹3,910 changes)

Fixed infra holds at ₹3,910/mo until you cross tier limits [FACT, 2026 tiers]:
- **Supabase MAU:** 100,000 included → fine well past 1,000 subscribers.
- **Storage:** 100 GB included → compressed images keep you under this for tens of thousands of items.
- **Vercel functions/bandwidth:** 1,000 GB-hrs / 1 TB — auto-tag + draft calls are short; comfortable to several thousand active users.
- **Egress:** 250 GB — the first thing you'll bump if images are uncompressed and heavily viewed. **Compress (WebP ~200 KB, 1280 px) to stay clear.**

**[OPINION]** Expect fixed infra to stay near ₹4k/mo until ~5,000–10,000 active users, then step up modestly. It never becomes the constraint that labour was.

---

## 9. Recommendation (skeptical)

**Is the model financially safe? — Yes, strongly.** With labour removed, WearWise at any subscriber count from break-even upward runs **75–96% gross margin**, and even an all-power-user worst case stays >74%. AI is effectively free per user; fixed infra (~₹3,910/mo) is the only real cost and is covered by **8–27 subscribers**.

**What to set:**
1. **Daily generation caps** — Free 1/day, ₹149–₹199 → 3/day, ₹299–₹499 → 5–10/day. Purpose: abuse safety, not margin. Add **before** public traffic.
2. **Hard OpenAI monthly spend limit + Supabase/Vercel spend alerts** — day one. This is your real blast-radius protection now that spend is automated.
3. **Invest the saved labour budget into AI output quality/safety** (validation, confidence thresholds, banned-content guards) — that's what replaces the human and protects retention.
4. **Price test:** lead with **₹199/month** (break-even ~20 subs, clean margin) or **₹299/month** if positioning premium (break-even ~13). The ₹499 tier fits festive/event styling as an upsell.

**What to watch (now demand-side, not cost-side):**
- AI suggestion quality without human review — track rating per suggestion, "Worn Today" saves, and complaint/refund rate.
- Generations per subscriber per month — confirms the engagement band (and that caps are rarely hit).
- Conversion to paid — the only number that now decides profit.

**Decision for Prashant next:**
1. Confirm the **daily cap values** per tier.
2. Confirm the **launch price** (₹199 vs ₹299).
3. Approve adding **`ai_usage_logs`** (from the first doc, §13) so engagement + real token cost are measured from week one — it's the meter that proves every number here.
4. Greenlight **AI output-quality guards** as the priority work that replaces human review.

---

### Appendix — calculation basis
- AI/sub/mo (Medium) = 20 × ₹0.056 + (12 × ₹0.053)/12 = **₹1.18**.
- Profit = subs × price × (1 − 0.0236) − subs × ₹1.18 − ₹3,910.
- Break-even subs = ₹3,910 ÷ (price × 0.9764 − ₹1.18).
- Sources: OpenAI https://openai.com/api/pricing/ · Supabase https://supabase.com/pricing · Vercel https://vercel.com/pricing · Razorpay https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/ · code: `gpt-4o-mini` in both `autotag/route.ts` and `generate-drafts/route.ts`.
- **⚠ VERIFY before external use:** ₹/USD (85), engagement (20 gen/mo), conversion, avg image size/compression. Replace with measured values once `ai_usage_logs` + PostHog are live.
