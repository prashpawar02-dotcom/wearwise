# WearWise — Cost & Revenue Model at 1,000 Users

**Scope:** documentation and analysis only. No app code, database, features, keys, or RLS changed.
**Date:** 2026-06-26 · **Author:** model built for Prashant (CEO)
**Promise modelled:** "Know what to wear today from clothes you already own."

> **How to read this doc**
> - **[FACT]** = taken directly from code or official 2026 pricing pages.
> - **[ASSUMPTION]** = my estimate; needs real data to confirm. Marked **⚠ VERIFY** where it materially changes the answer.
> - **[OPINION]** = my judgement call.
> - All money shown in **INR (₹)** and **USD ($)**. Exchange rate **₹85 / $1** **[ASSUMPTION ⚠ VERIFY]** (spot rate moves; check before quoting).

---

## 1. Executive Summary

**Is the business viable at 1,000 users?**
On pure infrastructure + AI, **yes, very comfortably** — AI costs ~₹655/month and fixed infra ~₹3,910/month at the Base scenario. The danger is **not** cloud cost. It is the **human-in-the-loop admin review step**: every outfit request must be reviewed/edited/approved by an admin before the user sees it. That manual labour costs **₹6,000–₹70,000/month** depending on volume — **9× to 100× the AI bill** — and at the High scenario it exceeds one person's monthly capacity.

**Biggest cost driver:** **Manual admin/stylist review labour.** [FACT — the flow in `generate-drafts` produces drafts that an admin must approve; nothing reaches the user automatically.] AI and storage are rounding errors next to it.

**Second cost driver (technical):** **The wardrobe auto-tag image token cost.** gpt-4o-mini bills a low-detail image as a **fixed ~2,833 tokens** — this is ~84% of the input tokens on every auto-tag call. [FACT — model + `detail: "low"` set in `autotag/route.ts`.] It's still cheap in absolute terms at 1,000 users, but it is the thing that grows with every uploaded photo.

**Biggest revenue risk:** **Flat-price subscribers who are heavy users.** A ₹199/month subscriber who triggers 4 requests costs ~₹40 in labour (fine). The same subscriber triggering 20 requests costs ~₹200 in labour — **the subscription goes contribution-negative.** Without a usage cap, your best-engaged users are your biggest losses.

**What must be measured before scaling:**
1. **Real token usage per AI call** (add `ai_usage_logs` — see §13). Today you are flying blind on token counts.
2. **Requests per active user per month** — the single number that decides whether subscriptions are profitable.
3. **Admin minutes per request** — the labour driver. Time 30 reviews and get the real average.
4. **Average uploaded image size** — decides storage and AI input latency (compression lever).
5. **Paid conversion rate** — everything in §7–§9 hinges on this.

**[OPINION]** At 1,000 users WearWise is financially safe *as a paid or invite-only beta*. It is **not** safe as a free-for-all public launch, because free users consume the expensive resource (admin time), not the cheap one (AI). Gate the human step behind payment or a hard free cap.

---

## 2. Current AI API Usage Map

[FACT — all rows below read from the codebase.]

| Feature | Route / file | Trigger | AI model | Input sent to AI | Output received | Frequency driver | Cost risk |
|---|---|---|---|---|---|---|---|
| Wardrobe auto-tagging | `src/app/api/wardrobe/[itemId]/autotag/route.ts` + `src/lib/autotag.ts` | Each uploaded wardrobe item (one call per item) | **gpt-4o-mini**, `temperature 0.2`, `max_tokens 400`, image `detail: "low"`, `response_format: json_object` | Instruction prompt (~550 tok) **+ 1 image inlined as base64** (billed ~2,833 tok at low detail) | JSON: category, sub-category, colour(s), pattern, style, occasion tags, fusion, friendly name, confidence | **Number of photos uploaded** × retry/re-tag rate | **Image tokens dominate** (~84% of input). Scales linearly with every upload. |
| Outfit draft generation | `src/app/api/outfit-requests/[requestId]/generate-drafts/route.ts` + `src/lib/outfit-drafts.ts` | Admin clicks "Generate AI outfit drafts" | **gpt-4o-mini**, `temperature 0.5`, `max_tokens 900`, `response_format: json_object` | Occasion + user note + **full wardrobe as compact JSON metadata** (no images) | JSON: exactly 3 outfit suggestions (title, item ids, styling reason, avoid note, optional missing item, confidence) | **Requests × admin regeneration rate** | Input grows with wardrobe size; **text-only, so cheap.** Regeneration is the multiplier. |

**Good cost decisions already in the code** [FACT]:
- Auto-tag uses `detail: "low"` (cheapest image mode) — correct.
- Outfit drafts send **metadata only, never images** — exactly the right call; this is the single biggest AI saving already in place.
- `max_tokens` is capped on both routes (400 / 900) — bounds worst-case output cost.
- Drafts require admin action to generate — no silent auto-spend.

**Gap** [FACT]: neither route records the OpenAI `usage` object. The API returns `usage.prompt_tokens` / `completion_tokens` on every response — today that data is discarded. See §13.

---

## 3. 1,000-User Usage Assumptions (Low / Base / High)

All percentages are of the **1,000 total users**. These are **[ASSUMPTION]** — realistic for an early Indian B2C beta, but **⚠ VERIFY** with real analytics.

| Assumption | Low | Base | High | Notes |
|---|---|---|---|---|
| Total users | 1,000 | 1,000 | 1,000 | Fixed |
| % who upload a wardrobe | 50% | 70% | 85% | Onboarding drop-off is real |
| Avg photos uploaded / uploader | 8 | 12 | 20 | MVP target is 10 |
| Avg batch size (per upload session) | 3 | 5 | 8 | Affects UX, not total cost |
| % who create outfit requests (active) | 30% | 50% | 70% | "Activated" users |
| Outfit requests / active user / month | 2 | 4 | 8 | **Key profitability driver** |
| Admin regeneration factor | 1.10 | 1.25 | 1.50 | Admin re-runs drafts |
| AI failure / retry factor | 1.05 | 1.15 | 1.30 | Failures fall back to manual (code) |
| Re-tag / edit factor | folded into retry factor above | | | User edits → re-tag |
| Avg wardrobe size / active user | 12 | 20 | 35 | Drives draft input tokens |
| Avg image size (as uploaded) | 0.2 MB (compressed) | 1.5 MB | 3.5 MB (raw phone) | **⚠ VERIFY — no compression in code today** |
| Input tokens / auto-tag call | ~3,383 | ~3,383 | ~3,483 | 550 text + 2,833 image (fixed) |
| Output tokens / auto-tag call | 150 | 200 | 350 | JSON schema is small |
| Input tokens / draft call | ~1,500 | ~2,000 | ~3,200 | Grows with wardrobe size |
| Output tokens / draft call | 450 | 600 | 800 | 3 outfits, capped at 900 |
| Exchange rate ₹/USD | 85 | 85 | 85 | **⚠ VERIFY** |

> **[FACT] the 2,833-token image figure:** OpenAI bills images to gpt-4o-mini differently from gpt-4o. A `detail: "low"` image is a fixed **2,833 tokens** for gpt-4o-mini (the 85-token base × the model's image multiplier). This is why auto-tag input is large and nearly constant regardless of prompt wording.

---

## 4. OpenAI Cost Calculation

**Pricing [FACT]:** gpt-4o-mini = **$0.15 / 1M input tokens**, **$0.60 / 1M output tokens** (stable through June 2026).

**Per-call cost** (`input_tok × 0.15/1M + output_tok × 0.60/1M`):

| Call type | Low | Base | High |
|---|---|---|---|
| Auto-tag / call | $0.00060 (₹0.051) | **$0.00063 (₹0.053)** | $0.00073 (₹0.062) |
| Draft / call | $0.00050 (₹0.04) | **$0.00066 (₹0.056)** | $0.00096 (₹0.082) |

### A. Wardrobe auto-tagging cost
```
auto_tag_calls = users × upload_rate × avg_items_uploaded × retry_factor
auto_tag_cost  = (in_tok × $0.15/1M × calls) + (out_tok × $0.60/1M × calls)
```
| | Low | Base | High |
|---|---|---|---|
| Auto-tag calls / month | 4,200 | **9,660** | 22,100 |
| Auto-tag cost / month | $2.51 (₹213) | **$6.06 (₹515)** | $16.19 (₹1,376) |

### B. Outfit draft generation cost
```
draft_calls = users × active_rate × requests_per_user × regeneration_factor
draft_cost  = (in_tok × $0.15/1M × calls) + (out_tok × $0.60/1M × calls)
```
| | Low | Base | High |
|---|---|---|---|
| Outfit requests / month | 600 | **2,000** | 5,600 |
| Draft calls / month (incl. regen) | 660 | **2,500** | 8,400 |
| Draft cost / month | $0.33 (₹28) | **$1.65 (₹140)** | $8.06 (₹685) |

### C. Total AI monthly cost
| | Low | Base | High |
|---|---|---|---|
| **Total AI / month** | **$2.84 (₹241)** | **$7.71 (₹655)** | **$24.25 (₹2,061)** |

### D–G. Per-unit AI economics (Base scenario)
| Metric | Value |
|---|---|
| D. AI per **active** user (500 active) | $0.015 (₹1.3) / month |
| E. AI per **paying** user (50 payers @ 5%) | $0.15 (₹13) / month |
| F. AI per **outfit request** | $0.00083 (₹0.07) |
| G. AI per **wardrobe onboarding** (12 items) | $0.0075 (₹0.64) |

**[OPINION]** AI cost is so low it is effectively free per user. Onboarding a full wardrobe and serving a month of outfits costs well under **₹15 per paying user** in AI. Do **not** optimise AI spend as a priority — optimise admin labour (§5) and conversion (§7).

### Measuring real token usage
The OpenAI Chat Completions response already returns a `usage` object on every call:
```json
"usage": { "prompt_tokens": 3140, "completion_tokens": 187, "total_tokens": 3327 }
```
Both routes parse `json` already (`const json = await resp.json()`), so `json.usage` is in hand and currently thrown away. Persisting it (see §13) converts every estimate in this doc into a measured fact within days of launch. **No new API calls required.**

---

## 5. Infrastructure Cost

Pricing [FACT, 2026 official]: Supabase Pro **$25/mo** (8 GB DB, 100 GB storage, 250 GB egress, 100k MAU, then overages). Vercel Pro **$20/seat/mo** (1 TB bandwidth, ~1,000 GB-hrs functions, 6,000 build min). Razorpay **2% + 18% GST = 2.36% effective** on standard domestic methods.

### Fixed monthly costs
| Item | Cost (USD) | Cost (INR) | Note |
|---|---|---|---|
| Supabase Pro | $25 | ₹2,125 | Needed for daily backups + headroom; Free tier (500 MB DB / 1 GB storage) is too tight |
| Vercel Pro | $20 | ₹1,700 | Hobby is non-commercial → Pro required for a paid product [FACT] |
| Domain (amortised) | $1 | ₹85 | ~₹1,000/yr |
| PostHog | $0 | ₹0 | Free tier (1M events/mo) covers 1,000 users [ASSUMPTION] |
| Sentry | $0 | ₹0 | Free tier (5k errors/mo) sufficient at this scale [ASSUMPTION] |
| Resend (email) | $0 | ₹0 | Free tier 3k emails/mo; ₹0 unless transactional volume grows |
| **Total fixed** | **$46** | **₹3,910** | |

### Variable monthly costs (at 1,000 users)
| Item | Low | Base | High | Note |
|---|---|---|---|---|
| OpenAI AI (§4) | ₹241 | ₹655 | ₹2,061 | Scales with uploads + requests |
| Supabase storage overage | ₹0 | ₹0 | ₹0 | Within 100 GB even uncompressed (§6) |
| Supabase egress overage | ₹0 | ₹0 | ~₹15 | Within 250 GB unless raw images served heavily |
| Vercel function/bandwidth overage | ₹0 | ₹0 | ₹0 | 1,000 users is far below 1 TB / 1,000 GB-hr |
| **Manual admin labour** ⚠ | **₹6,000** | **₹20,000** | **₹70,000** | **The real variable cost — see below** |

### Per-user costs (Base)
| Per | Cost |
|---|---|
| Per total user (1,000) | ₹24.6 / month (fixed+AI+labour ÷ 1,000) |
| Per active user (500) | ₹49.1 / month |
| Per paying user (50 @ 5%) | ₹491 / month all-in — **dominated by labour** |

### Manual admin / stylist labour (the dominant cost)
Assumes **₹150/hour** [ASSUMPTION ⚠ VERIFY] for a stylist/VA reviewing 3 drafts per request.
```
labour_hours = outfit_requests × minutes_per_review ÷ 60
labour_cost  = labour_hours × hourly_rate
```
| | Low (4 min) | Base (4 min) | High (5 min) |
|---|---|---|---|
| Requests / month | 600 | 2,000 | 5,600 |
| Review hours / month | 40 hrs | **133 hrs** | 467 hrs |
| Labour cost / month | ₹6,000 ($71) | **₹20,000 ($235)** | ₹70,000 ($824) |
| Per-request labour | ₹10 | ₹10 | ₹12.5 |

> **[OPINION] This is the headline.** 467 hours/month (High) is **~2.5 full-time people**. One admin cannot review 5,600 requests. The product's economics and its operational ceiling are both set by the human approval step, not by OpenAI. Every cost-control idea in §10 that reduces *admin touches* is worth more than every idea that reduces *tokens*.

---

## 6. Storage & Image Cost Model

```
total_images   = users × upload_rate × avg_items
storage_GB     = total_images × avg_image_MB ÷ 1024
storage_cost   = max(0, storage_GB − 100) × $0.021/GB   (Supabase Pro overage)
```

### Photos & storage at 1,000 users
| Image strategy | Low (4,000 imgs) | Base (8,400 imgs) | High (17,000 imgs) |
|---|---|---|---|
| Compressed @ 200 KB | 0.78 GB → ₹0 | 1.64 GB → ₹0 | 3.32 GB → ₹0 |
| Uncompressed @ 3 MB | 11.7 GB → ₹0 | 24.6 GB → ₹0 | 49.8 GB → ₹0 |

**[FACT] At 1,000 users, storage is effectively free either way** — even uncompressed you stay under the 100 GB included allowance. Compression's payoff at this scale is **upload speed, AI latency, and egress**, not the storage bill. It becomes a real bill at 5,000–10,000+ users.

### Cost impact by clothes-per-user (700 uploaders)
| Clothes / user | Compressed 200 KB | Uncompressed 3 MB | Overage (uncompressed) |
|---|---|---|---|
| 10 | 1.37 GB | 20.5 GB | ₹0 |
| 20 | 2.73 GB | 41.0 GB | ₹0 |
| 50 | 6.84 GB | 102.5 GB | ~₹4 |
| 100 | 13.67 GB | 205 GB | ~₹190 ($2.21) |

### Bandwidth / egress estimate
Each stored image is also (a) downloaded server-side once per auto-tag and (b) served to the user when they browse the wardrobe / view approved outfits. **[ASSUMPTION]** ~10 views per image per month.
- Compressed (200 KB): Base ≈ 8,400 × 10 × 0.2 MB ≈ **16 GB/month** — far under the 250 GB included.
- Uncompressed (3 MB): Base ≈ **246 GB/month** — right at the 250 GB cliff; spikes go to $0.09/GB.

### Compression recommendation [OPINION]
- **Store compressed versions only.** Do not keep originals server-side. The auto-tagger uses `detail: "low"`, so high resolution is wasted on the AI anyway.
- **Max upload dimensions:** longest edge **1280 px** (1024 px is enough for low-detail vision).
- **Target file size:** **150–250 KB** per item.
- **Format:** **WebP** (quality ~80) with **JPEG fallback** for older devices. WebP is ~25–35% smaller than JPEG at equal quality.
- **Where:** compress **client-side before upload** — this also shrinks the base64 payload the auto-tag route inlines, cutting upload time and function duration.
- **Net effect at 1,000 users:** storage bill unchanged (already ₹0), but egress risk removed and upload UX improved. The real win is at scale.

---

## 7. Revenue Scenarios

Common assumptions: Razorpay effective fee **2.36%** [FACT]; per-request labour **₹10** and per-request AI **₹0.07** [from §4–§5]; **₹3,910/month fixed infra** [§5]. Conversion is **of 1,000 users**: Low 2% (20), Base 5% (50), Good 10% (100), Strong 20% (200). "Contribution/payer" = price − payment fee − labour − AI (before fixed infra).

### A. Free beta
₹0 revenue. Costs = fixed (₹3,910) + AI + **labour**. At Base usage that is **₹3,910 + ₹655 + ₹20,000 = ₹24,565/month of pure burn.** [OPINION] Fine for a 1–2 month learning beta with capped usage; ruinous if left open. **A free beta must cap the human step (see §10/§11).**

### B. ₹99 one-time style report (assume ~3 requests of work)
Contribution/sale ≈ **₹66.5**.
| Conversion | Payers | Gross | Net after fee | − Labour | Contribution | After fixed infra |
|---|---|---|---|---|---|---|
| Low 2% | 20 | ₹1,980 | ₹1,933 | ₹600 | ₹1,329 | **−₹2,581** |
| Base 5% | 50 | ₹4,950 | ₹4,833 | ₹1,500 | ₹3,323 | **−₹587** |
| Good 10% | 100 | ₹9,900 | ₹9,666 | ₹3,000 | ₹6,645 | **+₹2,735** |
| Strong 20% | 200 | ₹19,800 | ₹19,333 | ₹6,000 | ₹13,291 | **+₹9,381** |
*One-time = revenue is not recurring; the table shows one month's sales against one month's fixed cost.*

### C. ₹199/month subscription (assume 4 requests/payer)
Contribution/payer/month ≈ **₹154**.
| Conversion | Payers | Gross | Net after fee | − Labour | Contribution | After fixed infra |
|---|---|---|---|---|---|---|
| Low 2% | 20 | ₹3,980 | ₹3,886 | ₹800 | ₹3,080 | **−₹830** |
| Base 5% | 50 | ₹9,950 | ₹9,715 | ₹2,000 | ₹7,701 | **+₹3,791** |
| Good 10% | 100 | ₹19,900 | ₹19,430 | ₹4,000 | ₹15,402 | **+₹11,492** |
| Strong 20% | 200 | ₹39,800 | ₹38,861 | ₹8,000 | ₹30,805 | **+₹26,895** |

### D. ₹299/month subscription (assume 6 requests/payer)
Contribution/payer/month ≈ **₹231.5**.
| Conversion | Payers | Gross | Net after fee | − Labour | Contribution | After fixed infra |
|---|---|---|---|---|---|---|
| Low 2% | 20 | ₹5,980 | ₹5,839 | ₹1,200 | ₹4,630 | **+₹720** |
| Base 5% | 50 | ₹14,950 | ₹14,597 | ₹3,000 | ₹11,576 | **+₹7,666** |
| Good 10% | 100 | ₹29,900 | ₹29,194 | ₹6,000 | ₹23,152 | **+₹19,242** |
| Strong 20% | 200 | ₹59,800 | ₹58,389 | ₹12,000 | ₹46,305 | **+₹42,395** |

### E. ₹499 premium / event styling package (assume 8 requests of work)
Contribution/sale ≈ **₹406.7**.
| Conversion | Payers | Gross | Net after fee | − Labour | Contribution | After fixed infra |
|---|---|---|---|---|---|---|
| Low 2% | 20 | ₹9,980 | ₹9,744 | ₹1,600 | ₹8,133 | **+₹4,223** |
| Base 5% | 50 | ₹24,950 | ₹24,361 | ₹4,000 | ₹20,333 | **+₹16,423** |
| Good 10% | 100 | ₹49,900 | ₹48,722 | ₹8,000 | ₹40,666 | **+₹36,756** |
| Strong 20% | 200 | ₹99,800 | ₹97,445 | ₹16,000 | ₹81,333 | **+₹77,423** |

**Gross margin %** (contribution ÷ gross, Base conversion): B ≈ 67%, C ≈ 77%, D ≈ 77%, E ≈ 81%. **[OPINION]** Margins look healthy **only because the labour assumption (4–8 requests/payer) holds.** The margin collapses if requests per payer drift up on a flat plan — which is exactly what happy users do.

---

## 8. Unit Economics Table

Base usage assumptions, **₹199/month subscription**, across conversion rates. Labour & AI scale with requests (4/payer); fixed infra ₹3,910 spread across payers.

| Metric | Low 2% | Base 5% | Good 10% | Strong 20% |
|---|---|---|---|---|
| Total users | 1,000 | 1,000 | 1,000 | 1,000 |
| Active users (50%) | 500 | 500 | 500 | 500 |
| Paying users | 20 | 50 | 100 | 200 |
| ARPU (₹/total user) | ₹3.98 | ₹9.95 | ₹19.90 | ₹39.80 |
| Gross revenue | ₹3,980 | ₹9,950 | ₹19,900 | ₹39,800 |
| Payment fees (2.36%) | ₹94 | ₹235 | ₹470 | ₹939 |
| AI cost | ₹6 | ₹14 | ₹28 | ₹56 |
| Infra cost (fixed) | ₹3,910 | ₹3,910 | ₹3,910 | ₹3,910 |
| Manual labour cost | ₹800 | ₹2,000 | ₹4,000 | ₹8,000 |
| **Net contribution** (after fixed) | **−₹830** | **+₹3,791** | **+₹11,492** | **+₹26,895** |
| Gross margin % (pre-fixed) | 77% | 77% | 77% | 77% |
| Cost per active user | ₹9.4 | ₹11.9 | ₹16.9 | ₹25.8 |
| Cost per paying user (all-in) | ₹240 | ₹163 | ₹124 | ₹104 |

**[OPINION]** The model turns profitable at roughly **2.6% conversion** on the ₹199 plan (break-even ≈ 26 payers, §9). Below that, fixed infra isn't covered. Above ~5% it scales nicely because the marginal cost per payer (labour + fee + AI ≈ ₹50) is far below price.

---

## 9. Break-Even Analysis

Fixed infra to cover = **₹3,910/month**. Break-even = `fixed ÷ contribution-per-payer`.

| Plan | Contribution / payer | Break-even payers | Required conversion (of 1,000) |
|---|---|---|---|
| **B — ₹99 one-time report** | ₹66.5 / sale | **~59 sales/month** | ~5.9% of users buying each month |
| **C — ₹199/month** | ₹154 / payer/mo | **~26 payers** | **~2.6%** |
| **D — ₹299/month** | ₹231.5 / payer/mo | **~17 payers** | **~1.7%** |
| **E — ₹499 event package** | ₹406.7 / sale | **~10 sales/month** | ~1.0% of users buying each month |

**[FACT/derived]** Recurring plans break even at very low conversion because each payer pays every month while fixed cost is constant. **[OPINION]** ₹299/month and the ₹499 package are the most forgiving — they reach break-even at 1–2% conversion. ₹99 one-time is the **hardest** sustainable model: you must keep *acquiring* ~59 buyers every month just to cover infra, because the revenue doesn't recur.

---

## 10. Cost-Minimisation Ideas (ranked by impact)

Ranked by ₹ saved **and** admin-time saved at 1,000 users.

| # | Idea | Type | Impact | Notes |
|---|---|---|---|---|
| 1 | **No auto-regenerate; admin confirms before any expensive regeneration** | Labour + AI | **High** | Each regen = a token call *and* a fresh admin review. The regen factor (1.1–1.5) is pure waste if accidental. |
| 2 | **Gate outfit-draft generation behind payment / beta-invite** | Labour | **High** | The human review step is the costly resource. Don't spend it on non-payers. |
| 3 | **Cap free plan at 10 wardrobe items + 1 outfit request** | Labour + AI + storage | **High** | Bounds the worst-case free user to ~₹16 total cost. |
| 4 | **Charge for high-frequency usage / cap requests per plan** | Labour | **High** | Kills the "heavy subscriber goes negative" risk (§1, §7C). e.g. ₹199 = 4 requests/week. |
| 5 | **Rule-based first-pass outfit pairing before calling AI** | AI + Labour | **Med-High** | Simple colour/occasion matching can pre-fill or filter, reducing AI calls and giving the admin a head start. Build later. |
| 6 | **Cache auto-tags; never re-run unless the user explicitly requests** | AI | **Med** | Re-tag factor (1.05–1.30) becomes ~1.0. Code already stores tags — just don't re-trigger. |
| 7 | **Skip AI if item already tagged (`ai_tag_status = tagged`)** | AI | **Med** | Cheap guard; prevents accidental double-charging on re-upload. |
| 8 | **Compress + resize images before upload (1280 px, WebP ~200 KB)** | Egress + latency | **Med** | Storage bill already ₹0 at this scale; saves egress headroom and upload time. |
| 9 | **Detect duplicate images before tagging (hash check)** | AI | **Med** | Stops re-tagging the same photo; protects against bulk re-uploads. |
| 10 | **Send wardrobe metadata only for drafts (already done)** | AI | **Med (banked)** | Keep it this way; never attach images to the draft call. |
| 11 | **Batch queue + concurrency limit on auto-tag** | Reliability/cost | **Low-Med** | Smooths spikes, avoids retries from rate limits (retries = double spend). |
| 12 | **Shorten prompts where safe** | AI | **Low** | Auto-tag text is ~550 tok vs 2,833 image tok — trimming text barely moves the needle. Low priority. |
| 13 | **Set a hard OpenAI monthly spend limit** | Risk | **Low ₹, High safety** | Caps blast radius of a bug/abuse loop. Do it day one. |
| 14 | **Set Supabase + Vercel spend alerts / spend cap** | Risk | **Low ₹, High safety** | Supabase spend cap is on by default — keep it on. |
| 15 | **Store AI usage logs; measure tokens per feature** | Visibility | **Enabling** | Turns this whole doc from estimate to fact (§13). |
| 16 | **Optional background processing for auto-tag** | UX/cost | **Low** | Lets you batch + retry cheaply without blocking the user. |
| 17 | **Cheaper/smaller model comparison later** | AI | **Low** | gpt-4o-mini is already cheap; revisit only if volume 50×s. |

**[OPINION]** Ideas #1–#4 (all about *not spending admin time*) are worth more than #5–#17 combined at 1,000 users. Do them first.

---

## 11. Product Packaging Recommendations

**[OPINION]** Package so that the **expensive resource (admin review) is never spent before payment intent is shown.**

| Tier | Price | What they get | Cost guardrail |
|---|---|---|---|
| **Free trial** | ₹0 | Upload **10 items** + auto-tagging + **1 outfit request** | Hard caps; 1 admin review max per free user |
| **Starter** | **₹99** one-time | One full **style report** (3 outfit ideas reviewed) | ~3 reviews of work; one-time so re-sell needed |
| **Monthly** | **₹199/mo** | Limited **weekly** outfit suggestions (e.g. 4 requests/week) + up to 30 wardrobe items | Cap requests; cap items |
| **Premium / Event** | **₹499** package | Festive / family-function / travel **event styling**, larger wardrobe (50–100 items), priority review | High contribution (₹407/sale) absorbs extra labour |

Guiding rules:
- **Cap AI-heavy and admin-heavy usage until payment proof exists.** Free = bounded, paid = generous.
- **Free uploads capped at 10** (matches the MVP success metric and bounds onboarding cost).
- **Paid unlocks larger wardrobes** (30 / 50 / 100 items) — natural upsell, low marginal cost.
- **Subscriptions must have a request cap** so a heavy user can't make the plan contribution-negative.
- **[OPINION]** Lead with **₹99 one-time** as the low-friction first purchase (proves willingness to pay), then upsell to **₹199/month** for recurring value. The ₹299 plan and ₹499 package are the margin-safe options if you want a single price to start.

---

## 12. Metrics To Track Before Scaling

Instrument these (PostHog events + an `ai_usage_logs` table). **[OPINION]** Until these are real numbers, every figure above is an estimate.

| Metric | Why it matters | Source |
|---|---|---|
| Wardrobe uploads / user | Drives auto-tag cost & storage | Upload events |
| Auto-tag calls / user | AI volume | `ai_usage_logs` |
| **Avg token usage / auto-tag** | Validates the 2,833-token assumption | OpenAI `usage` |
| Outfit requests / user | **Profitability driver** | Request events |
| Draft generations / request | Regeneration waste | `ai_usage_logs` |
| **Regeneration rate** | Labour + AI multiplier | Admin actions |
| AI failure rate | Retry cost + UX | Route status |
| **Admin edit rate** | Quality of AI drafts → labour | Suggestion edits |
| **Admin rejection rate** | If high, AI isn't pulling its weight | Suggestion status |
| User rating / suggestion | Product value | Feedback |
| "Worn Today" saves | Activation / retention | Saves |
| **Payment conversion** | Revenue everything | Razorpay |
| Refund / complaint rate | Net revenue erosion | Razorpay/support |
| **Admin minutes / request** | The dominant cost — measure it directly | Manual timing / queue timestamps |

---

## 13. Recommended Next Engineering Task

**[OPINION] Yes — add `ai_usage_logs` next (but do not implement until Prashant approves).** It is the highest-leverage, lowest-risk change: the OpenAI `usage` object is already in the response on both routes and currently discarded. Logging it turns this entire model from assumption to measurement within the first week of real traffic, and it costs **zero extra API calls**.

Proposed table (schema only — **not to be implemented in this task**):

```
ai_usage_logs
  id              uuid primary key default gen_random_uuid()
  user_id         uuid references auth.users      -- whose wardrobe/request
  feature         text   -- 'autotag' | 'outfit_drafts'
  target_id       uuid   -- wardrobe_item.id or outfit_request.id
  model           text   -- 'gpt-4o-mini'
  input_tokens    int
  output_tokens   int
  image_count     int    -- 1 for autotag, 0 for drafts
  status          text   -- 'ok' | 'failed' | 'bad_json' | ...
  error_message   text
  latency_ms      int
  estimated_cost_usd  numeric(10,6)
  created_at      timestamptz default now()
```

Privacy / RLS notes [OPINION, to preserve existing posture]:
- **RLS:** enable; users may read **only their own** rows (`user_id = auth.uid()`); **inserts server-side only** (service role in the route), never from the client.
- **No image bytes, no prompt text, no PII** stored here — only counts, status, model, cost. Keeps it a pure metering table.
- Admin dashboards read aggregates, not raw user content.
- This adds **no** new external exposure and **does not** touch the OpenAI key handling, which stays server-side as today.

---

## 14. Final Recommendation (skeptical)

**Is 1,000 users financially safe?**
**Conditionally yes.** On infra + AI, 1,000 users costs ~₹4,600/month (Base) — trivial. The honest risk is **operational, not cloud**: the human review step costs ₹6,000–₹70,000/month and, at the High scenario, exceeds one person's capacity. **WearWise is safe at 1,000 users only if you cap how much free admin time users can consume.** Treat admin-minutes-per-request as your real "server bill."

**Maximum free usage we can allow:**
**10 wardrobe items + 1 outfit request per free user.** That bounds a free user to ~₹16 of total cost (mostly one admin review). Anything more open lets non-payers burn your scarcest resource.

**What price to test first:**
**₹99 one-time style report** as the entry purchase (lowest friction, proves willingness to pay), with **₹199/month** offered as the recurring upgrade. Break-even is ~26 monthly payers (2.6%) on the ₹199 plan — achievable. If you want one margin-safe price instead, start at **₹299/month** (break-even ~17 payers, 1.7%).

**Cost-control rule that MUST exist before public beta:**
**No outfit draft generation or admin review for non-paying / non-invited users beyond the free cap — and a hard request cap on every paid plan.** Plus a hard OpenAI monthly spend limit and Supabase/Vercel spend alerts on day one. Without the request cap, your most engaged subscribers are your biggest losses.

**Decision for Prashant next:**
1. **Approve `ai_usage_logs`** (§13) so the next month's numbers are measured, not guessed.
2. **Pick the launch gate:** paid-only or invite-only beta with the 10-item / 1-request free cap — not an open free launch.
3. **Decide the first price test:** ₹99 one-time → ₹199/month ladder, *or* single ₹299/month plan.
4. **Set the request cap per plan** before any public traffic.

---

### Appendix — Sources (official 2026 pricing)
- OpenAI API pricing (gpt-4o-mini $0.15 / $0.60 per 1M tokens): https://openai.com/api/pricing/ · https://developers.openai.com/api/docs/pricing
- Supabase pricing (Pro $25, 100 GB storage, 250 GB egress, 100k MAU): https://supabase.com/pricing · https://supabase.com/docs/guides/storage/pricing
- Vercel pricing (Pro $20/seat, 1 TB bandwidth, ~1,000 GB-hrs): https://vercel.com/pricing · https://vercel.com/docs/plans/pro-plan
- Razorpay fees (2% + 18% GST domestic): https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/ · https://razorpay.com/blog/upi-charges-explained-mdr-vs-platform-fees/
- Code of record: `src/lib/autotag.ts`, `src/app/api/wardrobe/[itemId]/autotag/route.ts`, `src/lib/outfit-drafts.ts`, `src/app/api/outfit-requests/[requestId]/generate-drafts/route.ts` (both routes use `model: "gpt-4o-mini"`).

> **Marked items needing verification before external use:** ₹/USD rate (85); avg image size & whether compression exists; admin minutes per review; ₹150/hr labour rate; all usage-rate percentages in §3. Replace with measured values from §12 once available.
