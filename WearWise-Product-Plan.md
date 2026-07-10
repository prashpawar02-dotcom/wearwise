# WearWise Product Plan — The Next Major Phase
**Prepared for:** Prashant, CEO · **Date:** 7 July 2026 · **Status:** Planning document — no code, no implementation
**Scope:** Research-backed plan for evolving WearWise into a smarter, more accurate, more personal digital wardrobe assistant.

---

## 0. Decisions Locked (7 July 2026 — CEO review)

1. **Caps:** Both Swap One Item (3/day free) and Another Option (2/drop free) are capped. The cap message uses **best-choice confidence framing** — see §11.3 for the copy and reasoning.
2. **Gym:** In scope for the recommendation engine — dedicated activewear template added in §7.3.
3. **Festivals:** Major pan-Indian festivals for the festive overlay (list in §12); regional additions user-editable.
4. **Streaks:** Existing streaks feature converts to pause-and-repair "mornings sorted" framing (§17).
5. **Pricing:** Pro monthly **₹199**, Pro annual **₹1,999** (~2 months free). Beta measures conversion at these points rather than A/B testing lower anchors.

---

## 1. Executive Summary

WearWise wins or dies on one thing: **whether the first three outfits it shows a user are actually wearable.** Not clever, not fashionable — wearable, by that person, today, for their real life. Every research source and competitor review points to the same failure pattern: wardrobe apps get installed with enthusiasm, then uninstalled when (a) uploading the wardrobe feels like a second job, (b) the AI suggests something the user would never wear, or (c) the app has no reason to be opened daily.

The plan below is built on five convictions:

1. **Accuracy before intelligence.** A deterministic rules engine (formality match, weather, laundry exclusion, repeat penalty, cultural pairing rules) must gate every AI suggestion. Generic LLM styling is the #1 documented complaint against competitor apps. The engine proposed in §7 is rules-first, learning-second, explainable always.
2. **The Daily Drop is the product; everything else supports it.** Retention comes from answering "what should I wear today?" in under 60 seconds each morning — not from features. Plan, Insights, Packing are all later-phase amplifiers.
3. **Laundry state is not a feature, it is a correctness requirement.** Recommending an item that is in the wash is a trust-destroying bug, equal in severity to recommending a wool sweater in Mumbai May. §10 treats availability as a first-class dimension of every recommendation.
4. **Swap One Item is the trust feature.** When a user rejects part of an outfit and the app respects the rest, the user learns the app listens. When the app regenerates everything, the user learns it doesn't. §11 specifies lock-and-replace behavior precisely.
5. **Monetize proof, not promise.** Users pay after the app has saved them mornings, not because it has AI. The free tier must deliver the complete core loop; Pro sells depth (unlimited swaps, planning, insights) only after a user has logged ~2 weeks of successful wears. India-specific: decided pricing of ₹199/month and ₹1,999/year, UPI billing, annual discount, and extreme sensitivity to paywalls placed before value ([Razorpay Rize on Indian subscription psychology](https://rizevault.razorpay.com/p/the-psychology-of-subscriptions-in)).

**What to build next (summary of §22):** Recommendation Engine v2 (deterministic scoring + guards), Laundry/Availability system, Swap One Item, Why This Works explanations, and the five-tab IA (Today / Wardrobe / Style Me / Plan / You) with Plan kept minimal. **Delay:** packing, weekly recap, premium insights. **Reject:** virtual try-on, body scoring, public social feeds, shopping integration.

**Biggest open risks:** upload friction (every competitor's #1 churn driver), auto-tagging accuracy on Indian ethnic garments (needs validation), and over-notification. See §19.

---

## 2. Research Findings

Each finding lists evidence and what WearWise should do about it. Items marked **(assumption)** lack direct evidence; items marked **(needs validation)** should be tested in beta.

### 2.1 Digital wardrobe app user problems
- **Upload friction is the universal churn driver.** Reviews of Indyx, Whering, and Acloset consistently cite the time cost of digitizing a wardrobe as "one unavoidable issue with all these apps" ([Short & Sweet Fashion review of closet apps](https://shortandsweetfashion.substack.com/p/30-years-since-clueless-digital-closet), [Nouva 2026 comparison](https://www.nouva.app/blog/best-wardrobe-apps-2026-comparison)). Indyx is criticized for one-at-a-time item adds; Acloset for a 100-item free cap that hits users mid-upload.
  → WearWise: batch upload, background auto-tagging, and a usable experience at 10–15 items. Never paywall the upload itself.
- **Paywall resentment appears when stats/insights are gated early.** Indyx gates wardrobe stats behind $60/yr and is called "pushy toward its monetized offerings" ([Nouva](https://www.nouva.app/blog/best-wardrobe-apps-2026-comparison)).
  → WearWise: basic insights free; gate depth, not existence.
- **"Outfit generation is basic" kills the reason to stay.** Whering's generation is described as basic relative to competitors ([Indyx comparison page](https://www.myindyx.com/versus/acloset-vs-whering)). An app that only stores clothes is a photo album.
  → WearWise: recommendation quality is the moat. Invest engineering there, not in catalog features.

### 2.2 AI outfit recommendation failures
Documented complaint patterns across AI stylist apps ([Klodsy comparison](https://klodsy.com/blog/best-ai-stylist-apps-2026-comparison/), [Beauty AI roundup](https://beautyai.app/blog/best-ai-stylist-apps-2026), [Acloset Play Store reviews](https://play.google.com/store/apps/details?id=com.looko.acloset&hl=en_US)):
- Recommendations turn **generic after a few uses** — models trained on mainstream Western fashion produce mainstream Western outputs; sparse training data for regional/subcultural styles yields thin results. This is directly relevant to Indian ethnic wear.
- Apps claim the **closet is "too empty"** even at 30+ items — brittle minimum-inventory logic.
- **Color palette suggestions are hit-or-miss**, sometimes opposite to the user's actual wardrobe.
- Apps **try to do too much** and confuse users, or ship buggy "AI" features.
→ WearWise implications: (a) deterministic guards catch generic-AI nonsense before display; (b) design the engine to produce a good outfit from as few as 8–10 items; (c) ethnic-wear pairing rules must be hand-built, not learned from Western data; (d) fewer features, each reliable.

### 2.3 Decision fatigue and getting dressed
- Women make roughly **34 wardrobe-related micro-decisions daily** and spend ~**17 minutes each morning** choosing an outfit; decision quality degrades with accumulated choices ([clothing decision-fatigue statistics roundup](https://bestcolorfulsocks.com/blogs/news/clothing-choice-decision-fatigue-statistics), [Refinery29 on "nothing to wear"](https://www.refinery29.com/en-us/nothing-to-wear-fashion-decision-fatigue), [PsychCentral on outfit repetition and decision fatigue](https://psychcentral.com/blog/decision-fatigue-does-it-help-to-wear-the-same-clothes-every-day)).
- People wear only **20–30% of what they own**; a UK study found ~118 items owned with a quarter unworn for a year+ ([DRESSED on wardrobe paralysis](https://trydressed.com/wardrobe-paralysis/)).
- Satisfaction peaks with a **smaller curated set (~40–50 versatile pieces)** — abundance increases paralysis.
→ WearWise: show **one hero outfit + max two backups** (§13). The product's job is removing choices, not presenting them. "Quiet Gems" (§5) directly monetizes the 70–80% of unworn wardrobe — emotionally, this is "the app paid for my clothes again."

### 2.4 Fashion personalization psychology
- Users trust recommendations they can **interrogate** ("why this?") over black-box output. Explainability converts a suggestion into advice. **(assumption, consistent with recommender-systems literature; needs validation on exact copy)**
- People repeat outfits because repetition is **safe and identity-affirming**, not because they lack imagination ([The Carousel on the psychology of getting dressed](https://thecarousel.com/beauty-fashion/the-psychology-of-getting-dressed-why-we-keep-wearing-the-same-clothes-even-when-our-wardrobes-are-full/)). An app that shames repetition will be rejected; one that makes *slightly novel* variations of trusted formulas will succeed.
→ WearWise: recommend within the user's proven comfort zone by default; offer experimentation as an explicit opt-in slider, never as a surprise.

### 2.5 Wardrobe organization behavior
- Organization is an **emotional ownership act**, not a chore — users describe joy in seeing their closet visualized. The Closet Board is the surface where the user feels the app "knows my clothes."
- But organization alone doesn't retain: storage apps become abandoned photo albums. Organization must feed decisions. **(assumption)**

### 2.6 Indian wardrobe needs
- The defining trait is a **dual wardrobe**: ethnic + western + hybrid, worn contextually. Kurta-with-jeans and fusion styling are mainstream, and demand centers on "fuss-free" ethnic wear for working women ([Credence Research, India Women Apparel Market](https://www.credenceresearch.com/report/india-women-apparel-market), [LikeADiva 2026 trends](https://www.likeadiva.com/editorial/latest-trends/latest-fashion-trends-2026-the-hottest-indian-fashion-picks-for-women)).
- Occasion density is high: office, college, festivals (region-specific), weddings (multi-event), family functions, pujas, travel. Each has distinct formality and cultural-appropriateness rules that no Western-trained model knows.
- Climate: most of India is hot/humid much of the year; fabric breathability matters more than layering. Monsoon adds "will this survive rain/mud" logic.
- Modesty is a per-user, per-context dial (office vs. family function vs. friends), not a binary.
→ WearWise: ethnic pairing logic (§7.4), occasion taxonomy with Indian occasions first-class (§13 Style Me), fabric-weather rules tuned for heat/humidity/monsoon, and modesty as a contextual preference.

### 2.7 Age-based fashion expectations
- 16–24: trend-aware, repeat-sensitive among peers, budget-capped, high social photo exposure. 25–40: efficiency and appropriateness dominate; capsule thinking grows. 40+: comfort, fit, and dignity; strongly alienated by influencer aesthetics. **(assumption; validate tone preferences in beta)**
→ Copy and defaults must adapt by age band (§8), and no screen may assume the user is a 22-year-old fashion enthusiast.

### 2.8 Gender-based and gender-neutral needs
- Men's wardrobe complexity is lower (fewer categories) but decision anxiety around occasions (interview, wedding, date) is real and underserved — most wardrobe apps are visually and tonally female-coded, which suppresses male adoption. **(assumption)**
- A meaningful minority of users want gender-neutral dressing categories rather than "men's/women's" flows.
→ WearWise: ask "how do you like to dress?" (categories: western feminine / western masculine / ethnic feminine / ethnic masculine / mixed / neutral) instead of gender where possible; keep visual design gender-neutral (§15).

### 2.9 Climate, weather, fabric, laundry, comfort
- Weather mistakes are instant-distrust events: one wool-kurta-in-May suggestion and the user stops believing everything else. Weather integration must be conservative (block clearly wrong fabrics/layers) rather than clever.
- Laundry: no major competitor handles availability well; it is a differentiator. **(assumption based on competitor feature lists; needs competitive re-check at build time)**

### 2.10 Occasion-formality matching
- Formality is the highest-stakes dimension: under-dressing for an interview or over-dressing for college both cause real embarrassment. Research systems now treat formality consistency as a first-class scoring objective alongside color harmony ([Loom: hybrid retrieval-scoring outfit recommendation, arXiv 2026](https://arxiv.org/html/2605.09830)).
→ WearWise: formality is a hard constraint (±1 level tolerance), never a soft preference.

### 2.11 Repeat-wear sensitivity
- Repeat sensitivity is audience-relative: same office team ≠ different social circles. A repeat that no one who saw it last time will see is not a repeat. MVP proxy: days-since-worn + occasion match. **(needs validation: how much do users actually care, per segment?)**

### 2.12 Privacy concerns around wardrobe photos
- Wardrobe photos are bedroom photos: they can contain faces, mirrors, room interiors, and religious items. Users fear photos being used to train models or appearing publicly.
→ WearWise: explicit "private by default, never shared, never used to train shared models" copy at upload; no public gallery anywhere in the product; local-feeling privacy controls in You tab (§13).

### 2.13 Why users distrust AI styling apps
Synthesis of §2.2 sources: (a) generic output, (b) visually broken suggestions, (c) no explanation, (d) ignoring stated constraints (the fastest trust-killer), (e) recommendations that ignore what the user actually owns/wears. Trust is rebuilt by: visible obedience to constraints, explanations, fast correction ("swap one item" that works), and never repeating a mistake the user flagged.

### 2.14 Useful daily retention without manipulation
- Effective habit loop: trigger → <60-second action → genuine reward. Retention teams that optimize frequency over user-jobs create FOMO churn, not habit ([UserIntuition on habit loops vs. shipping](https://www.userintuition.ai/reference-guides/habit-loops-and-retention-what-to-study-what-to-ship/), [Nir Eyal, Hooked model](https://medium.com/googleplaydev/optimize-app-retention-with-the-hooked-model-a0781f8e5d29)).
- Repairable/pausable streaks preserve motivation without guilt (meditation-app precedent, same source).
→ WearWise: the Daily Drop at the user's chosen time is the trigger; "Wore It" is the <10-second action; tomorrow's better outfit is the reward. Streaks, if any, must be pause-and-repair, never shame-based.

### 2.15 Word-of-mouth drivers
- Utility apps spread via *demonstrable moments*: someone gets complimented and says "an app picked this," or shows the Closet Board to a friend. Shareable outfit cards (already built) support this; the stronger WOM engine is the wedding/festival season use case — "it planned all four of my function outfits from my own closet." **(assumption; measure referral source in beta)**

### 2.16 What makes users pay
- Freemium conversion follows perceived functional value from the free tier ([ScienceDirect: willingness to pay for freemium services](https://www.sciencedirect.com/science/article/pii/S0268401224000355)). Indian users pay when there is continuous value, high-frequency use, and visible outcomes, with UPI-based low-friction billing ([Razorpay Rize](https://rizevault.razorpay.com/p/the-psychology-of-subscriptions-in)); price sensitivity is extreme ([BusinessToday UPI fee survey](https://www.businesstoday.in/india/story/upi-fee-backlash-3-in-4-users-say-they-will-stop-using-platform-if-transaction-charges-are-imposed-525210-2026-04-11)).
→ Monetization plan in §18: value-first, low anchor price, annual plan as the real product, one-time purchases as a credit-card-free on-ramp.

### 2.17 What causes bad recommendations (failure taxonomy)
| Failure | Root cause | Guard (built in §7) |
|---|---|---|
| Irrelevant accessory ("add a dupatta") | LLM verbosity bias — always adds something | Accessory Relevance Guard: accessories require a positive reason |
| Culturally awkward pairing (belt over kurta) | Western training data | Ethnic pairing rule table; cultural tags |
| Weather mistake | No/naive weather input | Hard fabric-weather exclusions |
| Laundry item recommended | No availability model | Availability filter runs first, always |
| Wrong formality | Formality treated as style | Hard constraint ±1 |
| Over-styling (5-piece looks for college) | Model rewards complexity | Piece-count cap by occasion |
| Comfort mismatch (heels for travel day) | Comfort not modeled | Comfort score + footwear constraints |
| Whole outfit changes on single-item swap | Regeneration instead of substitution | Lock-and-replace swap architecture (§11) |

---

## 3. Core User Problems

Ranked by (frequency × trust damage if unsolved). Each includes solution ownership and phase.

### P1. "I have nothing to wear" despite a full closet
- **User story:** "I stand in front of my wardrobe for 15 minutes, try two things, hate both, and wear the same kurta again."
- **Why it matters:** This is the founding problem; ~70–80% of owned clothes go unworn (§2.3). Solving it *is* the product.
- **Frequency:** Daily. **Segments:** All; strongest in working women, occasion-heavy users.
- **Risk if unsolved:** No reason for the app to exist.
- **Feature:** Daily Outfit Drop + Quiet Gems. **UI:** Today hero card. **Data:** wardrobe items, worn history, occasion, weather. **Logic:** full engine (§7).
- **Monetization:** Indirect — this earns the right to monetize everything else. **Phase: MVP (core).**

### P2. Morning decision fatigue
- **User story:** "I don't want options at 7:40am. I want an answer."
- **Why:** ~17 min/morning and 34 micro-decisions (§2.3); the value proposition is minutes and mental energy returned.
- **Frequency:** Daily. **Segments:** Working women/men, parents, students on class days.
- **Risk:** If the app *adds* decisions (endless carousels), it makes the problem worse and gets deleted.
- **Feature:** One hero outfit, ≤2 backups, pre-generated before the user's chosen time. **UI:** Today screen opens directly on the pick. **Logic:** confidence-ranked single best. **Phase: MVP (core).**

### P3. Clothes in laundry get recommended
- **User story:** "It told me to wear the white shirt that's been in the wash basket since Sunday."
- **Why:** Every occurrence proves the app doesn't know the real wardrobe → distrust spreads to all suggestions.
- **Frequency:** Weekly+ for most households. **Segments:** All; acute for homemakers managing family laundry and students with weekly wash cycles.
- **Risk:** Silent correctness failure; users won't report it, they'll just stop trusting.
- **Feature:** Laundry/In Wash system (§10). **UI:** Laundry section in Wardrobe; post-"Wore It" prompt. **Data:** availability state, laundry timestamps. **Logic:** hard exclusion filter. **Monetization:** none directly; a trust prerequisite. **Phase: MVP (core).**

### P4. Wrong outfit for weather
- **User story:** "It suggested a blazer layer. It's 38°C."
- **Frequency:** Every day weather is extreme (much of India, much of the year). **Segments:** all; travel users acutely.
- **Feature:** Weather strip + fabric/weather hard rules. **Data:** city, daily forecast, item fabric/season tags. **Logic:** exclusion + soft comfort notes ("light cotton day"). **Phase: MVP (core).**

### P5. Wrong formality for occasion
- **User story:** "I asked for interview and it gave me a printed casual shirt."
- **Risk:** Real-world embarrassment attributed to the app; 1-star territory.
- **Feature:** Occasion → formality mapping, hard constraint. **Phase: MVP (core).**

### P6. Culturally awkward AI combinations
- **User story:** "It told me to add a formal belt to my kurta. My mother laughed."
- **Segments:** Ethnic-wardrobe users, festive users; this is the India differentiator.
- **Feature:** Ethnic pairing rules + Dupatta/Layer Guard + avoid-with tags. **Phase: MVP (core).**

### P7. Unnecessary accessories pushed into every outfit
- **User story:** "Every single outfit says 'add a scarf.' I own one scarf. I hate it."
- **Root cause:** additive LLM bias (§2.17). **Feature:** Accessory Relevance Guard — accessory only when it solves formality-gap, weather need, or is a proven user favorite. **Phase: MVP (core).**

### P8. Swap changes the whole outfit
- **User story:** "I liked everything except the top. I hit swap and lost the whole look."
- **Why:** This interaction is where users learn whether the app listens. **Feature:** Swap One Item with lock-and-replace (§11). **Phase: MVP (core).**

### P9. "Why should I trust this?" — no explanation
- **User story:** "It says wear this. Why? Says who?"
- **Feature:** Why This Works — 1–3 plain-language reasons drawn from actual scoring factors (color harmony, occasion match, weather, "you loved this combo on 12 June"). Never fake reasons. **Phase: MVP (core).**

### P10. Repeating outfits too often / bad repeats
- **User story:** "I wore almost this exact thing to office on Monday."
- **Feature:** Repeat penalty (per item and per outfit-combination, occasion-aware) + Repeat-Safe indicator ("last worn 12 days ago, different crowd"). **Phase: MVP.**

### P11. Forgetting good clothes exist
- **User story:** "I found a kurti with tags still on. I'd forgotten I owned it."
- **Feature:** Quiet Gems — surfaces low-wear, high-compatibility items inside Daily Drops ("this hasn't been out in 6 weeks — it pairs perfectly today") and in a small Wardrobe insight card. Emotional payoff: the app pays for itself in rediscovered clothes. **Phase: MVP (light), Insights depth Next.**

### P12. Comfort ignored in favor of style
- **User story:** "Looks nice, but I can't sit cross-legged on a train in that."
- **Feature:** Comfort preference (global) + per-request "more comfortable" swap mood + comfort scoring from fabric/fit. **Phase: MVP (preference + swap), scoring refinement Next.**

### P13. Modesty mismatch
- **User story:** "That's fine for brunch with friends, not for my in-laws' place."
- **Feature:** Modesty preference (global default) + per-occasion overrides + "more modest" swap. Modesty must be contextual, not a single switch. **Phase: MVP.**

### P14. Onboarding/tagging feels like data entry
- **User story:** "It asked me 12 questions per item. I quit at item 6."
- **Feature:** Auto-tag everything possible; manual correction optional and gamified lightly ("3 items need a quick check"); engine works with partial data using safe defaults. **Phase: MVP (core).**

### P15. Occasion panic ("wedding is in 3 hours")
- **User story:** "Family function tonight. I need a safe good outfit from what's clean, now."
- **Feature:** Style Me with occasion picker + availability-aware results + one-tap "more/less formal." **Phase: MVP.**

### P16. Tomorrow anxiety (night-before planners)
- **User story:** "I decide at night so mornings are calm. Let me lock tomorrow."
- **Feature:** Tomorrow Prep — accept today's/tomorrow's drop for tomorrow, item reservation note ("keep the blue kurta out of the wash"). **Phase: Next** (MVP: simple "save for tomorrow" only).

### P17. Privacy anxiety about closet photos
- **User story:** "Where do my photos go? Is this training some AI? Can anyone see my stuff?"
- **Feature:** Privacy reassurance copy at upload + You-tab privacy panel + no public surfaces. **Phase: MVP (copy + settings).**

### P18. Travel packing chaos
- **User story:** "4-day trip, 2 occasions, one cabin bag."
- **Feature:** Packing list builder reusing engine + availability + weather-at-destination. High value, high complexity. **Phase: Later** (after Daily Drop retention proven).

### P19. Laundry pile-up blindness
- **User story:** "Suddenly nothing office-appropriate is clean on Wednesday."
- **Feature:** Soft heads-up when clean-and-suitable inventory for the user's primary occasion drops below ~3 outfits. Not a chore reminder — an availability forecast. **Phase: Next.**

### P20. Not-fashion-forward users feel judged
- **User story:** "I don't know what 'palazzo' means. I just want to look okay."
- **Feature:** Plain-language everywhere; no jargon in Why This Works; tone settings by segment (§4). **Phase: MVP (copy discipline).**

**Problem → phase summary:** MVP core = P1–P9, P13, P14, P17, P20. MVP light = P10–P12, P15. Next = P16, P19, insight depth. Later = P18.

---

## 4. User Segments

Thirteen segments. Format per segment: pain / context / complexity / expects / annoys / trust / pays / emphasize / hide / tone / visual.

### 4.1 Female students (16–24)
- **Pain:** repeat anxiety among the same classmates daily; small budget, high photo exposure.
- **Context:** college, coaching, outings, fests, family functions. **Complexity:** medium — western casual core + ethnic capsule for functions.
- **Expects:** fresh-feeling combos from limited clothes; fest/function help. **Annoys:** being told to buy things; formal-heavy suggestions; preachy tone.
- **Trust:** suggestions that reuse their actual favorites in new ways. **Pays:** rarely (₹ constraint); maybe one-time occasion pack or family plan. **(needs validation)**
- **Emphasize:** Daily Drop, repeat-safe, Style Me (college/fest). **Hide:** office formality features, insights depth.
- **Tone:** friendly, brief, zero fashion jargon. **Visual:** lively-but-clean; Theme 2 with warmth.

### 4.2 Male students (16–24)
- **Pain:** wants to look put-together for specific events (fest, date, interview) with a tiny wardrobe; no vocabulary for it.
- **Context:** college daily (low effort) + occasional high-stakes events. **Complexity:** low — tees, shirts, jeans, 1–2 ethnic sets.
- **Expects:** fast answers, no fuss. **Annoys:** feminine-coded UI, accessory pushing, too many questions.
- **Trust:** the interview/date outfit working. **Pays:** almost never monthly; possible one-time "event look." **(assumption)**
- **Emphasize:** Style Me occasions; minimal Daily Drop. **Hide:** lookbooks, insights.
- **Tone:** direct, practical ("This works. Here's why in one line."). **Visual:** Theme 2 (utility).

### 4.3 Working women (22–40) — **primary segment**
- **Pain:** morning time poverty + office repeat sensitivity + dual ethnic/western wardrobe + festive season load.
- **Context:** office 5 days, family functions, festivals, travel. **Complexity:** high — the full dual wardrobe.
- **Expects:** office-appropriate answer in <1 min; festive planning; laundry awareness. **Annoys:** weather mistakes, laundry mistakes, over-styling, influencer tone.
- **Trust:** two weeks of wearable office picks + one festive save. **Pays:** most likely payer — time-saving is a purchasable outcome. Monthly Pro viable.
- **Emphasize:** Daily Drop, Swap, Laundry, Tomorrow Prep, Style Me (office/festive/function). **Hide:** experimentation prompts by default.
- **Tone:** respectful, efficient, warm. **Visual:** Theme 1 (calm premium).

### 4.4 Working men (22–40)
- **Pain:** occasion uncertainty (what does "smart casual" mean for this offsite?) + repeat blindness they only notice when someone comments.
- **Context:** office, client meetings, weddings, dates. **Complexity:** low-medium.
- **Expects:** correctness, speed. **Annoys:** style-speak, accessories, anything that feels like a fashion magazine.
- **Trust:** formality accuracy. **Pays:** annual Pro if it removes a real chore; hates recurring small charges. **(assumption)**
- **Emphasize:** Style Me occasions, Daily Drop, weather logic. **Hide:** lookbook, gems, most insights.
- **Tone:** plain, confident. **Visual:** Theme 2.

### 4.5 Homemakers / parents (28–50)
- **Pain:** dresses last after managing everyone else; wants to feel put-together for functions, school events, guests; manages household laundry.
- **Context:** home, errands, functions, religious events. **Complexity:** medium-high, ethnic-leaning.
- **Expects:** practical comfort-first picks; strong laundry logic; function-ready looks. **Annoys:** youth-coded UI, exposure-y suggestions, being made to feel out of date.
- **Trust:** modesty and comfort respected without asking twice. **Pays:** value-conscious; annual family value or one-time analysis. **(needs validation)**
- **Emphasize:** comfort, modesty, laundry, occasion looks, Quiet Gems (deep closets). **Hide:** trend language, experimentation.
- **Tone:** warm, respectful, unhurried. **Visual:** Theme 3 (festive personal) or Theme 1.

### 4.6 Occasion-heavy users (20–45)
- **Pain:** wedding-season stacking — 4 events, 4 looks, no repeats across the same relatives, budget pressure to reuse.
- **Complexity:** high ethnic + accessories. **Expects:** multi-event planning from owned clothes. **Annoys:** repeats across events with same audience; generic festive advice.
- **Trust:** one wedding season handled well → strongest WOM segment.
- **Pays:** yes — seasonal spike; occasion pack or Pro month during season. **Emphasize:** Style Me, Saved Looks, repeat-across-events logic (Next). **Hide:** nothing much; power users.
- **Tone:** celebratory but organized. **Visual:** Theme 3.

### 4.7 Minimalists
- **Pain:** wants maximum combinations from few items; hates clutter and gamification.
- **Expects:** combination intelligence, wear-count data. **Annoys:** buy suggestions, badges, streaks. **Trust:** honest data. **Pays:** yes, for insights depth — natural quantified-self buyers. **Emphasize:** insights, cost-per-wear later. **Hide:** gamification entirely. **Tone:** spare, factual. **Visual:** Theme 2, most monochrome variant.

### 4.8 Budget-conscious users
- **Pain:** clothes must last and be re-worn creatively; fears the app is a shopping funnel.
- **Expects:** "use what you own" honored literally. **Annoys:** any commerce push (reject shopping-first flows permanently for this reason). **Trust:** zero upsell of merchandise. **Pays:** low; free tier must serve them fully — they are the WOM base. **Tone:** empowering, never aspirational-luxury. **Visual:** any; avoid luxury coding.

### 4.9 Ethnic/traditional wardrobe users
- **Pain:** western-trained AI mangles ethnic pairing; saree/blouse/dupatta logic ignored by every competitor.
- **Complexity:** highest (sets, separates, drapes, jewelry). **Expects:** the app to *understand* a kurta set is a set. **Annoys:** belt-with-kurta class errors; dupatta spam.
- **Trust:** correct ethnic logic = instant differentiation. **Pays:** with occasion-heavy overlap, yes. **Emphasize:** ethnic tagging quality, festive Style Me. **Hide:** western trend content. **Tone/Visual:** Theme 3.

### 4.10 Western/casual wardrobe users
- **Pain:** rut of jeans+same-3-tops. **Expects:** variation within casual comfort. **Trust:** repeat-safe + gems. **Pays:** medium. **Tone:** easy. **Visual:** Theme 1 or 2.

### 4.11 Modest-wear users
- **Pain:** apps suggest exposure they've excluded; modesty treated as edge case.
- **Expects:** modesty as a respected default, coverage-aware logic (sleeve length, neckline, fit, layering that serves coverage). **Annoys:** having to re-state modesty repeatedly; "make it sexier" adjacent copy — never ship such copy.
- **Trust:** never once violating the preference. **Pays:** yes, loyalty is high when respected. **(assumption)** **Emphasize:** modesty controls, layer logic. **Tone:** respectful, neutral. **Visual:** Theme 1/3.

### 4.12 Not-fashion-forward users who want help
- **Pain:** genuinely doesn't know what goes together; fears looking wrong.
- **Expects:** an answer, not options; plain language. **Annoys:** jargon, choice overload, being asked style questions they can't answer ("what's your style vibe?" → provide "not sure, you decide" path).
- **Trust:** simple explanations that teach gently. **Pays:** yes if the app becomes their safety net. **Emphasize:** hero pick, Why This Works. **Hide:** sliders and controls behind defaults. **Tone:** kind, confidence-building, never condescending. **Visual:** Theme 2.

### 4.13 Fashion-lovers who want organization
- **Pain:** big wardrobe, poor recall; wants curation tools, not advice.
- **Expects:** beautiful Closet Board, lookbook, stats. **Annoys:** basic styling tips ("they know more than the app").
- **Trust:** the app as a *tool*, not a stylist. **Pays:** most reliably — competitor evidence: stats/insights paywalls succeed with this group (§2.1). **Emphasize:** Wardrobe surfaces, Saved Looks, insights. **Hide:** beginner explanations (make Why This Works collapsible). **Tone:** knowledgeable peer. **Visual:** Theme 1.

**Cross-segment rules:** never assume young/female/urban; every flow must pass the "45-year-old father in Indore" test and the "19-year-old in Delhi" test with only tone/default changes, not separate products.

---

## 5. Feature Opportunity Map

Full specification for the highest-priority features; compact rows for the rest. Verdicts: **BUILD / SIMPLIFY / DELAY / REJECT**.

### 5.1 Daily Outfit Drop — BUILD (exists; harden)
- **Problem:** P1, P2. **Segments:** all; primary for working users. **Location:** Today tab, hero position; push at user-chosen time.
- **Entry:** app open or notification tap → lands directly on the pick. **Visual:** large outfit card (flat-lay collage of item photos), occasion chip, weather chip, Why This Works line.
- **Empty state:** <8 usable items → "Add a few more pieces and I can start picking for you" + 3-item quick-add. **Loading:** skeleton card, <2s target (pre-generate server-side before drop time). **Error:** engine failure → yesterday's accepted look or top saved look with honest copy ("Having trouble — here's a proven favorite").
- **Data:** wardrobe, availability, weather, occasion default (from lifestyle input), worn history. **Logic:** full engine §7. **Personalization:** every signal feeds it. **Retention:** THE habit surface. **Revenue:** free forever (1 drop + 2 backups); Pro adds regeneration depth.
- **Risk:** bad pick at 7am = churn; mitigate with confidence threshold — below it, show two picks and ask, honestly framed.

### 5.2 Closet Board — BUILD (exists; add availability + insights hooks)
- **Problem:** P11, P14, ownership emotion. **Location:** Wardrobe tab. **Visual:** sectioned board (§13.2): Hanging Rail, Folded Shelf, Occasion & Traditional, Shoe Rack, Accessories Tray, Laundry.
- **Empty:** friendly upload coach, batch camera flow, "10 items ≈ 2 minutes." **Loading:** progressive thumbnails. **Error:** failed auto-tag → item appears untagged with gentle "needs a quick check" badge, never blocks.
- **Retention:** medium (weekly). **Revenue:** none directly — do NOT cap item count at a number users hit mid-onboarding (Acloset's 100-item mistake, §2.1). If capping free, cap ≥200. **Risk:** becoming a photo album — every section must feed recommendations.

### 5.3 Laundry / In Wash — BUILD (MVP core) — full plan §10.

### 5.4 Swap One Item — BUILD (MVP core) — full plan §11.

### 5.5 Another Option — BUILD, capped (decided)
- Regenerates a full alternative (vs. Swap's single item). **Cap:** 2 per drop free — decided 7 Jul 2026. **Button:** "Show another." **At cap:** confidence-framed message per §11.3 — the shown options are presented as the ranked best of the clean wardrobe, with an honest reason why more tries get weaker, plus a feedback path and a quiet Pro mention. **Error:** inventory exhausted → "That's the best I've got clean today — want to loosen the occasion?"

### 5.6 Wore It — BUILD (exists; wire signals)
- One tap on hero card → confirm → triggers laundry prompt (§10) + learning signal (§7.6) + streak-free positive copy ("Nice. That's 4 outfits this week sorted."). **Risk:** friction here kills the data loop; must be one tap, undoable.

### 5.7 Outfit Feedback — BUILD, minimal
- Thumbs down + one optional reason chip (too formal / not my style / uncomfortable / weather / repeat). No 5-star ratings, no forms. Feeds engine penalties.

### 5.8 Why This Works — BUILD (MVP core)
- 1–3 real reasons rendered from scoring factors, e.g. "Deep green + cream is a low-clash pair · Kurta formality matches office · 31°C — both pieces are breathable cotton." **Never** generate reasons disconnected from the actual score. Collapsible for expert users. **Risk:** fake-sounding reasons → distrust; keep vocabulary factual.

### 5.9 Style Me by Occasion — BUILD (MVP) — screen spec §13.3.

### 5.10 Wardrobe Insights — SIMPLIFY for MVP, expand Next
- MVP: 3 honest cards max — most-worn item, quiet gem count, laundry snapshot. Never fabricate ("cost per wear" needs purchase price — Later, optional input). Depth (combination coverage, occasion gaps) = Pro, Next phase.

### 5.11 Quiet Gems — BUILD (light)
- Definition: high compatibility score × low wear count × available. Surfaces inside Daily Drop copy and one Wardrobe card. Emotional flagship. **Risk:** recommending a gem the user avoids for an unstated reason (bad memory, fit change) — after 2 skips, ask once: "Not feeling this one? I'll rest it." then long-cooldown.

### 5.12 Repeat-Safe Indicator — BUILD (light)
- Chip on hero card: "Fresh for office — last worn 11 days ago." Occasion-aware (§2.11). No shame framing ever.

### 5.13 Weather/Fabric Advice — BUILD (integrated, not standalone)
- Lives inside Why This Works + weather strip. No separate screen.

### 5.14 Comfort Preference — BUILD (profile + swap mood). 
### 5.15 Modesty Preference — BUILD (profile + per-occasion + swap mood; §7, §8).
### 5.16 Gender Expression Preference — BUILD (onboarding dressing-category question; drives candidate filtering and copy).
### 5.17 Age/Lifestyle Personalization — BUILD (age band + lifestyle in onboarding; drives defaults/tone).
### 5.18 Occasion Formality Slider — SIMPLIFY: not a numeric slider; two chips "More formal / More casual" in Style Me and Swap. Sliders invite fiddling; chips invite decisions.
### 5.19 Outfit Theme Lock — DELAY (Next). Power feature; Swap's implicit theme preservation covers 90% of the need in MVP.
### 5.20 Color Harmony Logic — BUILD (engine-internal, §7.5). Research supports learned+rule hybrids ([Springer: colour harmony models for clothing](https://link.springer.com/article/10.1186/s40691-025-00433-y)); MVP uses rule table, learning later.
### 5.21 Pattern Clash Guard — BUILD (engine-internal): ≤1 bold pattern per outfit unless user history proves pattern-mixing tolerance.
### 5.22 Accessory Relevance Guard — BUILD (engine-internal, §7.5): accessories require positive justification; default is none.
### 5.23 Dupatta/Scarf/Layer Guard — BUILD (engine-internal): dupatta only with dupatta-role outfits (suit sets, appropriate kurtas) or explicit modesty/formality need; layers require temperature or formality justification.
### 5.24 Shoe Compatibility Logic — BUILD: formality + occasion + weather (monsoon → no suede) + user footwear constraints (no heels, etc.).
### 5.25 Saved Looks / Lookbook — BUILD (exists; keep light — save, name, reuse in Plan).
### 5.26 Weekly Recap — DELAY (Next). Nice retention email/screen; zero MVP necessity. Ties to share/vote infra already shipped.
### 5.27 Tomorrow Prep — SIMPLIFY for MVP ("save for tomorrow" on any outfit); reservation logic (§10) Next.
### 5.28 Packing List — DELAY (Later). High value, high complexity; needs proven laundry/availability foundation first.
### 5.29 Premium Insights — DELAY (Next/Later, Pro).
### 5.30 Manual Wardrobe Analysis (human stylist one-time) — DELAY (Later). Operationally heavy; validate demand via waitlist link first. **(needs validation)**
### 5.31 Virtual try-on, body scoring, attractiveness ratings, public social feed, shopping-first — REJECT (out of scope per strategy; also §2 evidence that they don't fix core-loop failures).

---

## 6. Feature Prioritization

| Phase | Features |
|---|---|
| **MVP (next build)** | Engine v2 with all guards (§7) · Laundry/Availability (§10) · Swap One Item (§11) · Why This Works · Daily Drop hardening (confidence, backups, empty/error states) · Wore It signal wiring · Outfit Feedback chips · Style Me occasions + modest/comfort/formality chips · Repeat-Safe chip · Quiet Gems (light) · Onboarding inputs (§8) · Privacy copy + controls · Insights (3 honest cards) |
| **Next** | Tomorrow Prep with reservation · Laundry forecast (P19) · Weekly Recap · Insights depth (Pro) · Outfit Theme Lock · Repeat-across-events (wedding season) · Learning-loop weight tuning · Color harmony learning |
| **Later** | Packing List · Calendar/event integration · Manual Wardrobe Analysis · Cost-per-wear (optional price input) · Saree/blouse advanced logic (beyond set-handling) · Family/shared accounts |
| **Reject** | Virtual try-on · 3D avatar/AR · body measurement/scoring · attractiveness ratings · public social feed · marketplace/shopping-first · influencer content |

Rationale for the controversial calls: **Weekly Recap delayed** because recap without solid wear data is fake; **Packing delayed** because it's the most-requested "cool" feature but depends entirely on availability infrastructure being trustworthy; **Manual Analysis delayed** because human ops before PMF burns the team.

---

## 7. Detailed Recommendation Logic Plan (Fashion Decision Engine)

**Architecture principle:** a three-stage pipeline — **Filter (hard rules) → Score (weighted, explainable) → Rank & Explain** — with AI/LLM used only inside candidate generation and copywriting, never allowed to bypass filters. Research supports exactly this hybrid: neural retrieval + structured domain scoring for color harmony, formality consistency, and occasion coherence ([Loom, arXiv 2026](https://arxiv.org/html/2605.09830); [Springer colour harmony models](https://link.springer.com/article/10.1186/s40691-025-00433-y)).

### 7.1 Stage 1 — Hard filters (fail closed; an outfit failing any filter is never shown)
1. **Availability:** item.state == available (not in_wash, not archived). No exceptions, including Style Me and Plan (Plan may reserve, §10).
2. **Weather exclusion:** fabric/season tags incompatible with forecast band (e.g., wool/velvet/quilted blocked ≥30°C; sleeveless-only outfits flagged <15°C; suede/leather-sole flagged on rain days).
3. **Formality window:** every item within occasion formality ±1 on a 1–5 scale (1 loungewear … 5 formal event).
4. **Cultural pairing legality:** pair passes the ethnic rule table (§7.4) and no avoid-with tag between chosen items.
5. **Modesty floor:** outfit coverage ≥ user's modesty setting for this occasion context.
6. **User exclusions:** avoided colors, avoided garment types, footwear constraints — absolute.
7. **Completeness:** outfit contains a valid structure (§7.3 templates) — no shoe-less office outfits, no dupatta-less suit set if the set requires one per its tags.
8. **Piece-count cap by occasion:** college/casual ≤4 pieces incl. shoes; office ≤5; festive ≤6.

### 7.2 Stage 2 — Scoring (transparent weighted sum; weights tunable, logged per recommendation)
```
outfit_score = w1·color_harmony + w2·formality_coherence + w3·occasion_fit
             + w4·comfort_score + w5·user_style_alignment + w6·novelty_freshness
             − p1·repeat_penalty − p2·weather_softpenalty − p3·pattern_risk
             − p4·accessory_irrelevance
```
Starting weights (assumption; tune in beta): w1 .15, w2 .15, w3 .20, w4 .15, w5 .20, w6 .10; penalties uncapped so a strong penalty can sink any outfit. Every factor stores its contribution → Why This Works reads directly from the top 3 positive contributors; internal QA reads negatives.

### 7.3 Outfit structure templates
- **top+bottom:** top, bottom, footwear, optional single layer, optional single accessory.
- **one-piece:** dress/jumpsuit/gown, footwear, optional layer, optional accessory. One-piece implies no separate top/bottom slots.
- **ethnic set:** components move together (kurta+pants+dupatta tagged as one set) unless user has marked pieces separable. Set integrity is a filter, not a preference.
- **kurta as separate:** kurta + bottom (churidar/palazzo/jeans/pants). Dupatta slot only if (a) kurta tagged dupatta-expected, (b) modesty need, or (c) formality gap it demonstrably closes. Otherwise empty.
- **saree:** MVP handles a saree+blouse as a stored set with occasion/formality tags; no drape/blouse-mixing intelligence until Later. Never auto-pair blouses across sarees in MVP — error rate too high. **(needs validation with ethnic-heavy beta users)**
- **western formal:** shirt+trouser+closed shoes; belt matches shoe family when both leather-toned; tie/blazer only if occasion ≥4.
- **casual:** tee/casual shirt + jeans/chinos/shorts; sneakers/sandals; layer only on temperature/AC justification.
- **gym/activewear (in scope — decided 7 Jul 2026):** activewear top + activewear bottom + sports shoes; candidates restricted to gym/activewear occasion tags; formality fixed at level 1 (bypasses the formality window); no accessories; layer only <15°C or user preference; comfort weight doubled; repeat cooldown shortened (activewear repeats are expected).

### 7.4 Ethnic & cultural rule table (seed set; extensible; human-curated)
- Kurta sets: never add western belt; never suggest tucking; footwear from {juttis, flats, sandals, kolhapuris, minimal heels} for festive, +loafers for men.
- Dupatta: only per 7.3 rules; never on western top+pants; never doubled with a heavy-work kurta unless set includes it.
- Festive occasions: prefer ethnic/fusion tags; metallic/embellished accents allowed; office festive-day = "festive-lite" (ethnic + office formality floor).
- Saree occasions: function/festive/formal only; never "casual Friday saree" unless user history shows it.
- Sherwani/bandhgala: occasion ≥4 only; never mixed with sneakers unless user has explicitly worn and confirmed that combo.
- Fusion legality: kurta+jeans yes (mainstream, §2.6); ethnic bottom + western formal shirt = blocked by default, unlocked if user wears it.
- Religious/regional garments the system can't classify → never auto-recommend into outfits until user confirms tags.

### 7.5 Cross-cutting logic specs
- **Color harmony (MVP rule table):** neutrals pair with everything; same-family depth variation allowed; complementary pairs allowed at ≤1 saturated item; block >2 saturated non-neutral hues per outfit; metallics count as accents. Learning layer (Next) adjusts to user's proven palette.
- **Pattern clash:** ≤1 bold pattern; small-scale+large-scale mixing allowed only with shared color anchor; user history can unlock mixing.
- **Accessory relevance (the anti-dupatta-spam rule):** accessory added only when it (a) closes a formality gap, (b) serves weather (actual scarf-cold, sun), (c) is user-favorited with this outfit type, or (d) occasion is festive and accessory is occasion-tagged. Default = no accessory. Copy never says "add X to elevate" without a concrete reason.
- **Shoes:** formality match; monsoon exclusions; comfort constraints (user "no heels" absolute); college/travel bias to walkable.
- **Repeat avoidance:** item-level cooldown (default 4 days casual, 7 office-visible; user-tunable "repeat tolerance") + combination-level cooldown (same top+bottom pair 14 days per audience-occasion). Favorites can override with user consent ("You love this — wear it anyway?").
- **Comfort score:** fabric stretch/breathability + fit tag + user comfort preference + day context (travel day → +walkable, +breathable).
- **Confidence score:** function of inventory depth for the occasion, tag completeness, and score margin over runner-up. Below threshold → present 2 options with honest copy; never fake confidence.

### 7.6 Learning loop
| Signal | Meaning | Strength | Learns what | Adaptation speed | Don't overreact |
|---|---|---|---|---|---|
| Wore It | full endorsement | strong | item_preference↑ both items, pair affinity↑, occasion_fit↑ | immediate | one wear ≠ love; cap per-event delta |
| Skipped drop (opened, no action) | soft mismatch | weak | nothing item-level; track drop-level | 5+ occurrences | mornings are chaotic; skip ≠ dislike |
| Swapped item X out | X wrong in context | medium | X context-penalty; kept-items affinity↑ | 2–3 occurrences | penalize context, not item globally |
| Disliked + reason chip | explicit negative | strong | targeted: formality/style/comfort model per chip | immediate | one dislike ≠ ban; decay over 60 days |
| Saved outfit | aspiration | medium | pair affinity↑, style_alignment↑ | immediate | saved ≠ worn; weight below Wore It |
| Removed accessory | accessory irrelevant here | strong | accessory_relevance↓ for this outfit-type | immediate | global accessory aversion only after 3+ |
| Chose more modest/casual/formal/comfortable | context recalibration | medium | occasion→formality/modesty offset for this user | 2 occurrences same occasion | per-occasion, not global |
| Marked laundry post-wear | wash-cycle behavior | weak | per-category wear-per-wash estimate | 5+ data points | households vary wildly |
| Edited item tags | ground truth correction | strong | tag override + auto-tagger feedback | immediate | none — user is right |
| Repeated a favorite | comfort formula | medium | favorite_score↑, novelty weight↓ for user | 3 occurrences | don't collapse into rut; keep gems flowing |
| Notification ignored 5+ days | time/value mismatch | medium | prompt time change once; reduce frequency | after 5 | never auto-increase notifications |
| Used Another Option | first pick miss | weak | rank-order tuning | aggregate only | normal browsing behavior |

**Scoring stores (per user):** item_preference_score, pair_affinity, outfit_success_score, occasion_fit_offset, comfort_score, repeat_penalty state, accessory_relevance_score, user_style_alignment vector, confidence calibration. All human-readable in admin; no opaque embeddings as source of truth in MVP.

---

## 8. Personalization Input Plan (Onboarding & Profile)

**Onboarding budget: ≤6 questions, ≤90 seconds.** Everything else is progressive (asked in context, later) or defaulted. Every question shows "why we ask" microcopy and a skip.

| Input | Ask when | Req? | Why it matters | Logic effect | Default if missing |
|---|---|---|---|---|---|
| Dressing category (western F/M, ethnic F/M, mixed, neutral) | Onboarding Q1 | Yes | replaces gender; filters candidate space + copy | template + candidate filtering | mixed |
| Age range (band) | Onboarding Q2 | Yes | tone, defaults, formality norms | style_alignment prior, copy | 25–34 |
| Lifestyle (office / college / home / mixed / field work) | Onboarding Q3 | Yes | default daily occasion | Daily Drop occasion default | mixed→casual |
| City | Onboarding Q4 | Yes | weather engine | forecast + climate priors | ask again at first drop |
| Style vibe (3 image-chip picks + "you decide") | Onboarding Q5 | No | style_alignment prior | initial ranking prior | neutral prior |
| Comfort vs. polish (3-chip) | Onboarding Q6 | No | comfort weight | w4 adjustment | balanced |
| Modesty preference | Progressive: first ethnic/office drop | No | coverage floor | hard filter level | occasion norms |
| Avoided colors/types | Progressive: first dislike w/ reason, or profile | No | absolute exclusions | hard filter | none |
| Footwear constraints | Progressive: first shoe suggestion | No | absolute | hard filter | none |
| Preferred fit | Progressive/profile | No | comfort + silhouette scoring | soft score | from tags worn |
| Ethnic/western balance | Learned from wardrobe mix + wears | No | candidate mix | ranking prior | wardrobe ratio |
| Usual getting-ready time | First notification setup | Yes (for push) | drop timing | pre-generation schedule | 7:00 |
| Occasion priorities | Learned from Style Me usage | No | inventory warnings | forecast feature | — |
| Laundry behavior (wash frequency) | Progressive: 2nd laundry prompt | No | default in-wash duration | availability estimates | 4 days |
| Accessory comfort | Learned (removed-accessory signal) | No | accessory guard threshold | relevance score | conservative (few) |
| Repeat tolerance | Progressive: first repeat-safe chip tap | No | cooldown lengths | repeat_penalty tuning | occasion defaults |
| Experimentation level | Progressive: after 2 weeks ("want bolder picks?") | No | novelty weight w6 | w6 adjustment | low |
| Budget sensitivity | Never asked directly | — | avoid commerce tone | copy only | assume sensitive |
| Climate quirks (AC office, 2-wheeler commute) | Profile, optional | No | layer/practicality logic | soft rules | none |

**Anti-patterns:** no free-text style questions; no body measurements ever; no photo-of-you requirement; every "learned" input visible and editable in You → Personalization ("What WearWise thinks you like — correct me").

---

## 9. Wardrobe Data Schema Plan

**E = essential for MVP engine; L = later.** (Migration note: extends the existing items schema; field list is the planning target, not DDL.)

| Field | E/L | Notes |
|---|---|---|
| category / subcategory | E | controlled vocabulary incl. ethnic taxonomy (kurta, kurti, saree, blouse, lehenga, sherwani, dupatta, churidar, palazzo…) |
| color (primary) + color_family | E | family drives harmony rules; secondary_colors L |
| pattern | E | solid/stripe/check/floral/print/embellished + boldness flag |
| fabric | E (coarse) | cotton/linen/denim/silk/synthetic/wool/blend/unknown; fine-grain L |
| sleeve_length | E | modesty + weather |
| fit | E (coarse) | slim/regular/relaxed/oversized |
| formality (1–5) | E | the single most important tag |
| occasion_tags[] | E | office, college, casual, festive, wedding, function, travel, gym, home |
| season/weather_suitability | E | hot/mild/cold/rain-ok flags |
| cultural_tag | E | western/ethnic/fusion/regional-specific |
| modesty_level | E | derived from sleeve/neck/length/fit; overridable |
| layering_role | E | base/mid/outer/none |
| accessory_role | E | for accessories: functional/formal/festive/statement |
| footwear_type | E | for shoes: category + formality + walkability + rain_ok |
| set_id + set_required_components | E | ethnic set integrity (§7.3) |
| state (available/in_wash/archived) | E | §10 |
| in_wash_since | E | §10 |
| last_worn_at / wear_count | E | exists; repeat + gems |
| favorite_score / user_feedback_score | E | learning stores §7.6 |
| compatibility_tags[] / avoid_with[] | E (seeded by rules) | user-editable L |
| condition | L | good/worn-out; retirement suggestions later |
| purchase_price | L | optional, cost-per-wear later |
| neckline, length_exact, brand, size | L | not needed for engine v2 |
| photo_quality_flag | E | low-quality photo → lower auto-tag confidence → gentle re-shoot prompt |
| tag_confidence per field | E | drives "needs a quick check" queue; user edits set confidence=1 |

**Auto-tagging policy:** auto-fill everything with confidence scores; only surface the 3 lowest-confidence, highest-impact fields per item for correction (formality, category, cultural_tag first). Never require completing tags to use the app. **(needs validation: auto-tag accuracy on ethnic garments — run a 200-item labeled test before beta.)**

---

## 10. Laundry / In Wash Plan

**Positioning:** availability infrastructure, not a chore tracker. Copy never nags; the app simply *knows what's clean*.

### 10.1 Where it lives
- **Wardrobe tab:** "Laundry / In Wash" section at the bottom of the Closet Board — a visually distinct basket area showing item thumbnails with a subtle "in wash" wash-tag badge and days-in-wash count.
- **Item level:** every item card has a one-tap state toggle (Available ⇄ In Wash).
- **Post-wear prompt:** after "Wore It," a single dismissible sheet: "Where does this go tonight?" → [Back in wardrobe] [Into the wash] [Ask me less]. Multi-item outfits: one sheet, per-item chips, smart defaults by category (tees→wash, jeans→wardrobe, dupatta→wardrobe).

### 10.2 State machine & defaults
- available → in_wash (user tap, post-wear prompt, or bulk-select).
- in_wash → available: user tap, bulk "laundry done" action, or **soft auto-return prompt** after the user's learned wash-cycle length (default 4 days): a quiet Wardrobe badge — "5 items might be back from laundry — mark what's clean?" Never a push notification for laundry alone.
- No hard auto-return in MVP: silently marking dirty clothes clean is worse than asking. **(needs validation: does the 4-day prompt annoy or help?)**

### 10.3 Effects on recommendations
- **Daily Drop / Style Me / Swap:** in_wash items are hard-filtered (§7.1). Non-negotiable.
- **Explanation on constraint:** if the user's favorites are in the wash and options are thin, Why This Works adds gentle honesty: "Your top office picks are in the wash — this is the best clean combination today."
- **If >60% of an occasion-critical category is in wash:** one soft inline note (not push): "Office options are running low — a wash tonight keeps mornings easy." Max once per cycle.
- **Plan/Tomorrow (Next phase):** planning an outfit reserves items — post-wear prompt for a reserved item warns: "This is planned for Thursday — wash and return by then?"
- **Packing (Later):** packing list checks availability and generates a pre-trip wash list.

### 10.4 UI copy, states, edge cases
- **Empty laundry state:** "Nothing in the wash. Everything's ready to wear." (positive, closed).
- **Badges:** item card corner tag "In wash · 3d". Board section header shows count.
- **Edge cases:** (a) user never uses laundry → feature stays silent, zero prompts after 3 consecutive "Ask me less"/dismissals; (b) outfit worn but not marked → no retroactive nagging; (c) dry-clean items → category default long cycle (14d), silent; (d) same item worn multiple times before wash (jeans) → wear-per-wash learning (§7.6); (e) all items of a category in wash → Style Me returns honest empty-state with loosen-occasion offer, never a dirty item.
- **Tone test for every laundry string:** would a helpful flatmate say it once, quietly? If it sounds like a chore app or a parent, rewrite.

---

## 11. Swap One Item — UX and Logic Plan

**Contract with the user: the outfit you liked stays; only what you asked changes.**

### 11.1 Flow
1. Tap **Swap one thing** on any outfit card.
2. Bottom sheet: outfit rendered as tappable item chips + mood chips below:
   - Item chips: Top · Bottom · Shoes · Layer · Accessory (only slots present in this outfit)
   - Mood chips: More formal · More casual · More comfortable · More modest · Weather-safer · New mood (full-outfit re-theme, clearly separated at the bottom)
3. Single tap → instant replacement in place (target <1s, candidates precomputed) with a one-line reason. Buttons on result: [Keep it] [Try another] [Put back].

### 11.2 Lock-and-replace rules per swap type
| Swap | Locked | Changes | Candidate rules | Ranking |
|---|---|---|---|---|
| Top | bottom, shoes, layer, accessory, occasion, formality, color theme | top only | passes all §7.1 filters against locked items; color harmony vs. locked bottom; formality window kept | outfit_score with locked items fixed; novelty tiebreak |
| Bottom | everything else | bottom only | same, mirrored | same |
| Shoes | garments | footwear | formality+weather+comfort constraints | comfort-weighted |
| Layer | garments, shoes | layer (may resolve to "no layer" — a first-class result) | temperature/formality justification required | relevance first |
| Accessory | all garments | accessory (may resolve to "none — this outfit is complete") | Accessory Relevance Guard | relevance |
| More formal/casual | color theme, occasion | minimum items to shift formality ±1 (usually 1, max 2) | recompute with shifted window; change fewest pieces | fewest-changes first |
| More comfortable | occasion, formality | the least comfortable item | comfort_score ascending replacement | comfort |
| More modest | occasion | minimum items to reach coverage | modesty floor raised | fewest-changes |
| Weather-safer | occasion, formality | offending item(s) | weather filter tightened | fewest-changes |
| New mood | occasion, availability only | full outfit | full regeneration | standard |

### 11.3 Error & limit states
- **No valid candidate:** honest, specific, next-step: "No clean top matches this bottom for office. Try swapping the bottom instead, or loosen to smart-casual?" Never silently relax a hard filter; never show a bad match to avoid the empty state.
- **Caps (decided 7 Jul 2026 — both features capped):** free = 3 single-item swaps/day and 2 Another-Options/drop. Because capping the correction features is trust-sensitive, the cap message must do three jobs — reassure, explain, and offer agency — in this order:
  - **Cap copy (draft):** "These are the strongest matches from your clean wardrobe today. I rank every valid combination — going further means lower-scored pairings, where colors and formality start to drift. If something's off, tap 👎 and tell me why — tomorrow's pick gets sharper. Pro lets you keep exploring anyway."
  - **Why this framing is honest, not spin:** the engine genuinely ranks candidates by outfit_score (§7.2); options 4+ really are lower-scored. Stating that converts the cap from a paywall into a quality statement — "we stopped because quality drops," which is true and verifiable by the user (Pro users who explore past the cap will see weaker combos, which itself reinforces the claim).
  - **Rules:** never show the cap message mid-first-session (first 3 sessions are cap-exempt); always pair it with the feedback path (agency); Pro mention is one line, last, no button-color tricks; monitor cap-hit → next-week-retention correlation (§19 R6) and soften limits if churn correlates.
- **Undo:** every swap reversible with [Put back]; the pre-swap outfit is never lost.

### 11.4 Learning
Swap-out = context penalty for the removed item; Keep-after-swap = strong pair affinity for the replacement (§7.6). Mood swaps recalibrate the user's occasion offsets after 2 consistent uses.

---

## 12. Daily Outfit Drop Plan

(Existing infra: drop + cron + push shipped; this plan hardens product behavior.)

- **Generation:** server-side pre-generation ≥30 min before each user's chosen time; hero + 2 backups; confidence computed; low-confidence → dual-pick honest mode (§7.5).
- **Notification:** one per day at chosen time, content-forward ("Your Tuesday office look is ready — cotton day, 33°C"), never clickbait, never guilt ("You haven't opened…" is banned). Ignored 5+ consecutive days → in-app (not push) prompt to retime or pause. Pause is one tap and honored indefinitely.
- **On open:** hero card fills the screen. Actions in priority order: **Wear this / Wore it** (primary), Swap one thing, Show another (≤2), Save for later. Below fold: Why This Works, repeat-safe chip, quiet-gem note when applicable, laundry-aware note when constrained.
- **Backup UX:** backups are horizontal-swipe alternates on the hero, not a list — preserves "one answer" psychology.
- **Weekend/holiday behavior:** occasion default shifts (office→casual) using lifestyle input + calendar weekday; user can set "no weekend drops."
- **Festive overlay:** on major festival dates (regional calendar), drop offers a festive alternate alongside the daily pick, never replacing it uninvited. **Decided scope (7 Jul 2026):** major pan-Indian festivals — Diwali, Holi, Navratri/Durga Puja, Ganesh Chaturthi, Raksha Bandhan, Eid (both), Christmas, and New Year; regional festivals (Onam, Pongal, Baisakhi, Chhath, Gudi Padwa, etc.) offered as user-editable opt-ins during onboarding city setup, never assumed from name or location. Data source and maintenance owner still open (§23 Q6).
- **Metrics it must move:** open-to-decision time <60s; Wore It rate; 7-day drop retention. See §21.

---

## 13. Screen-by-Screen App Plan

Navigation (5 tabs): **Today · Wardrobe · Style Me · Plan · You**

### 13.0 One-Screen Design Rule (CEO directive, 7 Jul 2026)

Every tab must deliver its answer **within one viewport — no scrolling required to act.** Scrolling is allowed only for optional depth, never for the primary job.

- **Above the fold, always:** the screen's answer + its primary action. Today = hero outfit + Wore It. Style Me = occasion grid. Wardrobe = closet sections start + Add. Plan = tomorrow slot. You = top preferences.
- **Sheets, not pages:** secondary flows (swap, feedback, post-wear laundry, item detail, refine chips) open as bottom sheets over the current screen — the user never loses their place and never navigates away to complete an action. Target: 90% of daily interactions happen without leaving the Today tab.
- **Progressive disclosure:** Why This Works, repeat-safe/laundry/gem notes, and insights are collapsed chips/one-liners that expand in place. Default state shows headlines only.
- **Hard budgets per screen:** ≤1 primary action, ≤3 secondary actions visible, ≤1 screen-height of default content on a 380px-wide viewport (mobile-first PWA baseline). Anything beyond the budget moves into a sheet or gets cut.
- **Thumb-zone layout:** primary and secondary actions live in the bottom 40% of the screen; content on top, controls below.
- **Fixed anatomy:** every tab uses the same skeleton — context strip (top) → answer card (middle) → action row (bottom) — so navigation is learned once and transfers everywhere.
- **Scroll audit in QA:** each release, measure default-content height per tab; any tab exceeding 1.3× viewport at default text scale fails review. (Accessibility exception: large system font sizes may scroll — content must reflow, never truncate.)

### 13.1 Today
- **Question answered:** "What should I wear today?" **First impression:** the answer, not a dashboard.
- **Hierarchy (fits one viewport per §13.0):** greeting + weather/context strip (single compact line) → **hero outfit card** (~60% viewport) → collapsed chips row (Why This Works · repeat-safe · laundry/gem notes — expand in place) → action row pinned in thumb zone (Wore it · Swap one thing · Show another) → nothing else, no scroll needed to act.
- **Empty (wardrobe too small):** upload coach with progress ("6 of 8 items — almost there").
- **Loading:** skeleton hero, <2s. **Error:** proven-favorite fallback (§5.1).
- **Personalization insight:** one line max ("Picked lighter fabrics — humid day").
- **Upgrade moment:** only at Another-Option exhaustion, soft.
- **Accessibility:** all outfit info available as text (screen readers read item names, not just images); tap targets ≥44px; supports system font scaling.
- **Privacy note:** none needed here. **Do not show:** streak pressure, more than 3 outfit options, shopping anything, body imagery.

### 13.2 Wardrobe (Closet Board)
- **Question:** "What do I own and how useful is it?"
- **Sections:** Hanging Rail (tops/dresses/outerwear) · Folded Shelf (bottoms/tees/knits) · Occasion & Traditional (ethnic sets, festive) · Shoe Rack · Accessories Tray · Laundry/In Wash (bottom, distinct).
- **Per-section:** horizontal shelves with item cards (photo, wear-count dot, state badge). Add button persistent.
- **Insight cards (max 3, honest only):** most-worn, quiet gems count ("4 pieces you haven't touched in 6+ weeks"), laundry snapshot. "Missing basics" only when rule-derivable and true (e.g., office lifestyle + zero formality-3+ bottoms) — never generic shopping bait; frame as "gap," link nowhere.
- **Empty:** camera-first batch upload coach. **Tag-check queue:** "3 items need a quick check" chip, optional.
- **Upgrade:** none in MVP. **Do not show:** item counts as gamified goals, monetary valuations, condition shaming.

### 13.3 Style Me
- **Question:** "What do I wear for this situation?"
- **Layout:** occasion grid (Work · Casual · College · Date · Dinner · Travel · Interview · Gym · Wedding guest · Family function · Festival · Formal event) → optional refine chips (More formal/casual · More modest · More comfortable · Ethnic/Western/Mixed · Weather-safe · Reuse favorites · Avoid recent repeats) → single result card with same action row as Today.
- **Result count:** ONE at a time with Show-another — same decision-fatigue discipline.
- **Empty/error:** thin inventory for occasion → honest note + closest alternative + (if relevant) "2 suitable items are in the wash."
- **Upgrade:** occasion request caps are a candidate Pro lever — but keep interview/wedding always free (high-stakes moments build the reputation). **(needs validation)**
- **Do not show:** trend content, shop links, more than 12 occasions.

### 13.4 Plan
- **Question:** "What am I wearing later?"
- **MVP:** Tomorrow slot (accepts any outfit via Save-for-tomorrow) · Saved Looks grid · light week strip (7 dots showing planned/worn days). Nothing else.
- **Next:** reservation-aware tomorrow prep, weekly preview with weather. **Later:** trips/packing, calendar events, laundry planning, weekly recap.
- **Empty:** "Nothing planned. Mornings still covered — your daily pick arrives at 7:00." (Plan must never feel mandatory.)
- **Do not show:** empty months of calendar grid (a barren calendar reads as a dead app).

### 13.5 You / Profile
- **Question:** "How does WearWise understand me?"
- **Sections:** Style preferences (all §8 inputs, editable) · "What I've learned about you" (transparent learned-prefs list with correct/remove controls) · Daily Drop time & notification prefs (incl. one-tap pause) · Privacy & data (photo storage explanation, delete-all, export; "your photos are never public, never used to train shared models") · Wardrobe stats (honest counts) · Feedback history (past dislikes, editable) · Account · Premium (Next phase; hidden until eligible per §18).
- **Accessibility:** full text-scale support; language switch placeholder (Hindi + regional — Later, but architect copy for it now).

## 14. Button and Navigation Map

| Surface | Primary action | Secondary | Tertiary/overflow |
|---|---|---|---|
| Today hero | Wore it | Swap one thing · Show another | Save for later · Share card · Feedback (👎+chips) |
| Swap sheet | item chips (Top/Bottom/Shoes/Layer/Accessory) | mood chips (formal/casual/comfortable/modest/weather) | New mood |
| Swap result | Keep it | Try another | Put back |
| Wardrobe | Add items | section nav | item card → detail (edit tags, state toggle, wear history) |
| Item detail | Available⇄In Wash toggle | Edit tags | Archive |
| Laundry section | Mark clean (bulk) | select items | — |
| Style Me | occasion tile | refine chips | result → same as Today actions |
| Plan | Tomorrow slot | Saved Looks | week strip |
| You | edit preferences | notification time | privacy · account |
| Post-wear sheet | Into the wash / Back in wardrobe | per-item chips | Ask me less |

Global rules: one primary action per screen; destructive actions two-step; every AI output within one tap of a correction control (swap, feedback, tag-edit) — correction proximity is the trust architecture.

---

## 15. Visual Theme Options

Constraint honored: no childish graphics, influencer visuals, e-commerce catalog look, social-feed patterns, mannequin/body imagery, emoji-heavy UI, or exclusionary luxury.

### Theme 1 — Calm Premium Wardrobe *(recommended default; matches current design system)*
- **Segment:** working women/men 22–40, fashion-lovers, modest-wear. **Feeling:** a well-organized dressing room; quiet confidence.
- **Palette:** warm ivory ground (#FAF7F2 family), charcoal text, plum + muted rose + sage accents (existing tokens).
- **Type:** Inter for UI, Instrument Serif for display moments (already in system). **Cards:** soft-radius, generous padding, item photos on ivory. **Icons:** thin-line, rounded. **Motion:** slow fades, gentle card lifts; nothing bouncy.
- **Strength:** premium without luxury exclusion; ages well; gender-neutral. **Risk:** can feel muted to 16–24; mitigate with photography warmth, not UI color.
- **Best on:** Today, Wardrobe.

### Theme 2 — Practical Daily Utility
- **Segment:** men, students, minimalists, not-fashion-forward. **Feeling:** Apple-Health/WhatsApp clarity; a tool that respects your morning.
- **Palette:** near-white ground, ink text, single functional accent (deep teal or slate blue), semantic chips only.
- **Type:** Inter throughout, tighter scale. **Cards:** flatter, hairline borders, dense info. **Icons:** geometric line. **Motion:** instant, minimal.
- **Strength:** fastest comprehension; broadest gender/age neutrality. **Risk:** loses wardrobe emotion; Closet Board feels like a file manager.
- **Best on:** Today, Style Me, You.

### Theme 3 — Festive Personal Closet
- **Segment:** occasion-heavy, ethnic-wardrobe, homemakers. **Feeling:** your almirah before a family wedding — warm, celebratory, adult.
- **Palette:** deeper warm ivory, terracotta + deep plum + marigold accents used sparingly; jewel-tone section headers.
- **Type:** Instrument Serif more present in headers; Inter body. **Cards:** subtle woven-texture backers on Occasion & Traditional section only. **Icons:** rounded with occasional cultural motifs (bangle, jutti) drawn in the same line weight — decorative, never cartoon. **Motion:** soft shimmer on festive drops only.
- **Strength:** cultural belonging no competitor signals. **Risk:** becoming decorative/dated; strict accent budget required.
- **Best on:** Style Me (festive/wedding/function), festive Daily Drop overlay.

### Theme 4 (optional) — Morning Mode
Not a brand theme but a context skin: pre-9am, higher contrast, larger hero, actions enlarged, insights hidden. Works under any theme. Cheap to build, directly serves the core moment. **(assumption: measure open-hour distribution first)**

**Recommendation:** ship Theme 1 as base; Theme 3 as an automatic festive-context overlay (not a setting); hold Theme 2 as an "appearance: simple" toggle for Next phase. Do not build a theme picker in MVP.

---

## 16. Customer Psychology and Trust Strategy

**Why wardrobe stress exists:** getting dressed is a daily public identity decision under time pressure with too many options (choice overload) and asymmetric downside (a bad outfit is remembered; a fine one isn't). ~34 micro-decisions and ~17 minutes every morning (§2.3) make it a real cognitive tax, not vanity.

**Why users distrust AI outfit advice:** styling is subjective + personal; when a machine gets it wrong it feels like being *misunderstood*, not just miscalculated. Distrust triggers: ignoring stated constraints, generic output, no reasoning, and recommending the physically impossible (laundry, weather). Trust builders: visible obedience, explanation, instant correction, and remembered corrections (§2.13).

**Why explainability matters:** a reason converts instruction into advice and failure into feedback ("wrong reason" is correctable; "wrong vibe" is not). It also teaches users, which builds the app's authority.

**Why privacy copy matters:** closet photos are domestic photos (§2.12). One sentence at upload ("Private to you. Never shared. Never used to train shared models.") removes a silent objection that users won't voice — they'll just not upload.

**Why "from clothes you already own" is powerful:** it removes purchase pressure and guilt, aligns the app with the user against waste, and monetizes their sunk cost — every rediscovered item feels like free money. It's also the sharpest positioning against shopping apps.

**Why daily utility beats gimmicks:** habit follows a job done reliably at a fixed moment (§2.14). Try-on demos get one wow; a correct Tuesday outfit gets a Wednesday open.

**Why too many choices reduce conversion:** the product's promise is *fewer* decisions; every extra option re-imports the original problem. One hero, two backups, chips not sliders.

**Why the first outfit within 5 minutes matters:** it's the activation event — proof of concept on the user's own clothes. Every onboarding step must be justified against this clock.

**Why "Wear this / Wore it" creates habit:** it closes the loop — commitment (put it on) + confirmation (log it) + visible consequence (tomorrow's pick improves). That's a complete, honest habit cycle with no manufactured variable rewards.

**Why users pay after value:** Indian subscription behavior requires continuous, visible outcomes before recurring payment (§2.16). The paywall placed before proof reads as a scam; after two good weeks it reads as fair.

**Why bad recommendations destroy ratings:** a bad suggestion costs the user real social exposure; app-store reviews in this category are written at the moment of feeling misunderstood. One weather/laundry/culture failure outweighs ten good outfits.

### Conversion moments
| Moment | UI copy (draft) | Emotional value | Upgrade trigger? | Over-aggression risk |
|---|---|---|---|---|
| First outfit generated | "From your closet, for today. Want a different take? Swap any piece." | relief, proof | No. Never here. | Any paywall here kills activation |
| First successful swap | "Kept the rest, swapped the top." | being heard | No | — |
| First quiet gem worn | "That kurta hadn't been out in 7 weeks. Welcome back." | rediscovery, thrift joy | Soft first mention of insights (free card) | Don't monetize the feeling itself |
| First laundry-aware save | "Skipped two favorites in the wash — this one's ready to go." | competence, being known | No | — |
| First week recap (Next) | "5 mornings decided. 2 pieces rediscovered." | accumulation of value | Yes — first Pro mention, dismissible | Cap at one mention; no countdown timers |
| First occasion success (wedding/interview) | "Hope the day went well. Look saved to your Lookbook." | gratitude peak | Yes — strongest moment; offer trial | Don't ask during the panic, only after |
| First saved-look collection (3+) | "Your Lookbook is taking shape." | curation pride | Soft | — |
| First avoided bad repeat | "Fresh pick — you wore the blue set to office on Monday." | invisible competence made visible | No | Never shame the repeat itself |

Forbidden globally: guilt copy, fear copy, body-change framing, fake scarcity/countdowns, streak-loss shaming, "your friends are using…" fabrications.

---

## 17. Retention and Word-of-Mouth Strategy

**Retention = the morning job done well.** Mechanics, in order of importance:
1. Drop reliability and accuracy (the whole engine).
2. Chosen-time push with content preview; pausable without penalty (§12).
3. Loop closure: Wore It → visibly smarter tomorrow ("Noted — more like this").
4. Laundry awareness compounding: the longer you use it, the more the app knows what's actually wearable — switching costs from accumulated truth, not lock-in.
5. Gentle streak alternative: weekly "mornings sorted" count, pause-and-repair semantics, no fire emojis, no loss framing (§2.14 meditation-app precedent). **Decision (7 Jul 2026):** the already-shipped streaks feature converts to this model — weekly count framing, pausable without penalty, repairable after misses, no daily-loss mechanics. Migration should preserve users' historical counts (present as total mornings sorted, not a broken streak).

**Word of mouth engines (in likely order of power):**
1. **The compliment moment** — offline, unprompted. Support it: share card (shipped) shows the outfit + "styled from my own closet by WearWise"; never watermark spam.
2. **Wedding/festival season** — "it planned all four function outfits from clothes I owned." Seasonal Style Me excellence is the referral campaign. **(assumption; instrument referral source)**
3. **The Closet Board show-off** — people show their digitized closet to friends. Make the board screenshot-beautiful.
4. **Friend vote (shipped)** — keep private-link only; no public feed.
5. **The skeptic's demo** — "it knows my kurta shouldn't get a belt." Cultural correctness is itself shareable.

Anti-goals: no invite-gating of features, no referral spam, no social pressure loops. Measure: referral source survey at signup + share-card CTR (§21).

---

## 18. Monetization Plan

**Gate:** monetization features activate only after a user crosses a value threshold (suggested: 10+ Wore Its or 14 days active) — before that, the Premium section is invisible. Price points below are hypotheses for beta testing, not commitments. All payments via Razorpay with UPI-first flows (§2.16).

| Offer | Why they'd pay | Trust required first | Best trigger | Stays free | Paid | Risks | Beta validation |
|---|---|---|---|---|---|---|---|
| Free basic wardrobe | — (the funnel + WOM base) | — | — | Full core loop: upload (≥200 items), 1 daily drop + 2 backups, 3 swaps/day, Style Me core occasions, laundry, saved looks (cap ~20), basic insights | — | Making free too thin kills WOM (Indyx lesson §2.1) | Is the free loop alone retention-positive? |
| 7-day Pro trial | risk-free depth taste | 2 good weeks free | week-recap or occasion-success moment | — | all Pro | trial-start before value = burn | trial→paid conversion by trigger moment |
| Pro monthly — **₹199 (decided)** | mornings materially easier | high | occasion success | — | unlimited swaps+options, all occasions, Tomorrow Prep+, insights depth, priority generation | ₹199 is above impulse range for students — they are served by the free tier, not discounts | conversion rate at ₹199; cap-message sentiment |
| Pro annual — **₹1,999 (decided; ~2 months free vs monthly)** | committed users, works-for-men pattern (§4.4) | very high | after 1–2 paid months or festive season | — | same + festive season pack | refund pressure if engine degrades | annual uptake share |
| One-time wardrobe analysis (₹199–299, automated report) | curiosity + closet audit desire | medium | after full upload (≥60 items) | summary version | deep report: gaps, combinations unlocked, gem map | must not read as generic; needs real per-user substance | willingness at 3 price points **(needs validation)** |
| Premium weekly planning | night-planner segment | high | 3rd manual Tomorrow Prep use | tomorrow slot | full week + reservations + laundry forecast | overlaps Pro; fold into Pro, don't sell separately | — |
| Premium unlimited swaps + options | power correctors | high | hitting caps repeatedly | 3 swaps/day, 2 options/drop | unlimited | **Decided:** both capped, protected by confidence-framed cap copy (§11.3); soften if churn correlates with cap-hits | cap-hit frequency vs. churn correlation |
| Premium travel packing | trip-heavy users | high | Later phase | — | packing engine | premature; Later | demand via fake-door link **(needs validation)** |
| Premium advanced insights | fashion-lovers, minimalists | medium | gem/recap moments | 3 honest cards | combination coverage, wear economics, occasion readiness | fabricated-feeling insights destroy the surface | which insight card gets tapped most |

**Structural rules:** never paywall corrections (tag edits, feedback, laundry marking) — users maintaining data quality is a gift; never paywall privacy; never interrupt the morning flow with upsell; one upgrade prompt per trigger moment, dismiss = 30-day silence for that trigger. No revenue projections belong in this document — model after beta conversion data exists.

---

## 19. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Early signal |
|---|---|---|---|---|---|
| R1 | Upload friction kills activation before first outfit | High | Critical | 10-item minimum viable closet; batch capture; background tagging; first outfit at item 8 | signup→10-items conversion |
| R2 | Auto-tagging inaccurate on ethnic garments | High | High | 200-item labeled pre-beta test; confidence-gated recommendations; fast correction UX | tag-edit rate per category |
| R3 | One visible bad recommendation (weather/laundry/culture) early | Medium | Critical | fail-closed filters; conservative first week (favorites-biased picks) | first-week dislike rate |
| R4 | Notification fatigue → uninstall | Medium | High | one/day, chosen time, easy pause, auto-quiet after ignores | push opt-out rate |
| R5 | Users stop marking Wore It → learning starves | High | Medium | one-tap logging; visible payoff copy; passive fallbacks (drop opened + not swapped = weak positive) **(assumption)** | Wore-It rate decay curve |
| R6 | Caps on Swap/Another Option poison the trust features | Medium | High | Decided: both capped — mitigate with confidence-framed cap copy (§11.3), first-3-sessions exemption, feedback path at cap; soften limits if data warrants | cap-hit vs. next-week retention |
| R7 | Privacy scare (screenshot of someone's closet leaks, press narrative) | Low | High | no public surfaces; explicit copy; strict RLS (existing convention); delete-all that works | support tickets mentioning privacy |
| R8 | Over-personalization creep (app asks too much) | Medium | Medium | 6-question onboarding cap; progressive asks; every learned pref visible/deletable | onboarding drop-off per step |
| R9 | Festive/regional calendar errors (wrong festival, wrong region) | Medium | Medium | opt-in festival selection; never assume religion from name/city | festive-overlay dismiss rate |
| R10 | Free tier too generous → no conversion | Medium | Medium | acceptable in beta; conversion levers are depth not core | Pro-eligible→trial rate |
| R11 | Engine complexity outruns team capacity | Medium | High | rules table before ML; every §7 guard shippable independently; weights in config not code | build velocity vs. §22 phases |
| R12 | Competitor ships laundry/ethnic logic first | Low | Medium | speed on §10 + §7.4; these are the moat | competitor release notes |

---

## 20. Validation Questions for Beta Users

**Activation & upload:** How many items did you add before it felt useful? Where did you almost quit? Did auto-tags feel right for your ethnic wear?
**Daily Drop:** Did you actually wear it? If not, why (style/formality/comfort/weather/laundry/other)? What time do you actually decide your outfit? Was one pick + two backups enough or too few?
**Swap:** When you swapped one item, did the result respect the rest? Did you ever want to lock a specific item?
**Laundry:** Did the post-wear prompt help or annoy? (count "Ask me less" taps) Is the 4-day return prompt right? Do you even manage laundry per-item, or in loads?
**Trust:** Show the Why This Works line — does it sound like a real reason or filler? What one suggestion made you trust the app less?
**Modesty/culture:** Did anything feel culturally off? Did modesty settings cover your contexts (office vs. family vs. friends)?
**Repeat:** Do you care about repeating for office? For college? How many days feels safe?
**Payment (ask last, after 2+ weeks):** What here would you pay ₹99/month for? What should never be paid? Would a one-time closet report at ₹199 interest you? (fake-door the packing and analysis offers)
**WOM:** Have you shown the app to anyone? What did you show them — an outfit, the board, or something it "got right"?

---

## 21. Metrics to Track

**Activation:** signup→10 items (%); time to first generated outfit (target <5 min); first-outfit → any action (wear/swap/save) rate.
**Habit:** DAU/WAU on Today tab; drop open rate; open→decision time (target <60s); Wore It rate (north-star candidate: **wears per active user per week**); D7/D30 retention.
**Trust & quality:** dislike rate with reason distribution; swap rate per drop (moderate = engaged, spiking = engine failing); "kept after swap" rate; laundry-violation reports (target 0); weather-complaint rate; tag-edit rate by category (auto-tagger QA).
**Learning:** Wore-It rate trend per user cohort week-over-week (is it getting smarter, measurably?).
**Laundry:** post-wear prompt response rate; Ask-me-less rate; items stuck in_wash >14d.
**WOM:** share-card sends; friend-vote sessions; referral-source survey mix.
**Monetization (post-gate):** value-threshold reach rate; trial starts by trigger; trial→paid; cap-hit frequency; churn at renewal.
**Guardrail metrics:** push opt-out, notification-driven uninstalls (proxy), onboarding step drop-off, insight-card dismiss rate.

---

## 22. Final Recommended Roadmap

**Phase A — Accuracy Foundation (build next, ~4–6 weeks of scope):**
Engine v2 pipeline (filters → scoring → explain) with all guards from §7 · wardrobe schema extensions (§9 essentials) · Laundry/Availability system (§10) · Swap One Item (§11) · Why This Works · Daily Drop hardening (§12) · onboarding v2 (§8, 6 questions) · privacy copy/controls · Wore-It/feedback signal wiring · Insights (3 honest cards) · Theme 1 polish.
**Exit criteria:** laundry violations = 0; first outfit <5 min for 80% of testers; Wore It rate baseline established; dislike-with-reason <15% of drops. **(thresholds are assumptions — set final numbers with first cohort)**

**Phase B — Personalization & Habit (after A stabilizes in beta):**
Learning-loop weight tuning from real signals · Tomorrow Prep with reservations · laundry forecast · Weekly Recap · repeat-across-events for wedding season · Theme 3 festive overlay · Occasion Theme Lock · insights depth behind Pro · Pro trial + monthly/annual with §18 gating.

**Phase C — Expansion (only after B shows D30 retention and first conversions):**
Packing list · calendar integration · one-time wardrobe analysis (if fake-door validates) · cost-per-wear · language localization (Hindi first) · appearance:simple toggle (Theme 2) · saree advanced logic · family accounts exploration.

**Standing rejections re-affirmed:** virtual try-on, avatars/AR, body scoring, attractiveness ratings, public feeds, shopping-first, native app before PWA retention is proven.

---

## 23. Open Questions Before Build

1. **Auto-tagger accuracy on ethnic garments** — run the 200-item labeled test; if <80% on category/formality/cultural_tag, budget a manual-correction-first flow. **(blocking for Phase A quality bar)**
2. ~~Swap caps~~ **RESOLVED (7 Jul 2026):** both capped (3 swaps/day, 2 options/drop) with confidence-framed cap copy per §11.3; monitor R6 signal.
3. **Weather source & granularity** — city-level daily is enough for launch? Hourly for commute windows Next? Which provider fits the stack?
4. **Set modeling migration** — how do existing uploaded items map to set_id semantics without forcing users to re-tag?
5. **Occasion taxonomy final list** — 12 proposed in §13.3; confirm against beta users' real calendars. *(Gym: RESOLVED — in scope, engine template in §7.3.)*
6. **Festival calendar source and opt-in UX** — scope RESOLVED (major pan-Indian list in §12, regional opt-ins). Still open: data source (static table vs. API) and who maintains yearly date updates.
7. **Repeat-audience modeling** — is days-since-worn + occasion enough, or do beta users demand audience separation (office vs. social) explicitly?
8. **Confidence threshold** — what score margin triggers dual-pick honest mode? Needs offline evaluation set first.
9. ~~Existing streaks feature~~ **RESOLVED (7 Jul 2026):** convert to pause-and-repair "mornings sorted" per §17, preserving historical counts.
10. ~~Pricing hypotheses~~ **RESOLVED (7 Jul 2026):** ₹199/month, ₹1,999/year. Beta measures conversion and cap-message sentiment at these points; revisit only if trial→paid falls far below category norms.

---

*Sources cited throughout: [Nouva wardrobe-app comparison 2026](https://www.nouva.app/blog/best-wardrobe-apps-2026-comparison) · [Indyx vs Acloset/Whering](https://www.myindyx.com/versus/acloset-vs-whering) · [Short & Sweet Fashion digital closet review](https://shortandsweetfashion.substack.com/p/30-years-since-clueless-digital-closet) · [Acloset Play Store reviews](https://play.google.com/store/apps/details?id=com.looko.acloset&hl=en_US) · [Klodsy AI stylist comparison](https://klodsy.com/blog/best-ai-stylist-apps-2026-comparison/) · [Beauty AI stylist roundup](https://beautyai.app/blog/best-ai-stylist-apps-2026) · [Clothing decision-fatigue statistics](https://bestcolorfulsocks.com/blogs/news/clothing-choice-decision-fatigue-statistics) · [Refinery29 on decision fatigue](https://www.refinery29.com/en-us/nothing-to-wear-fashion-decision-fatigue) · [PsychCentral on outfit repetition](https://psychcentral.com/blog/decision-fatigue-does-it-help-to-wear-the-same-clothes-every-day) · [DRESSED wardrobe paralysis](https://trydressed.com/wardrobe-paralysis/) · [The Carousel, psychology of getting dressed](https://thecarousel.com/beauty-fashion/the-psychology-of-getting-dressed-why-we-keep-wearing-the-same-clothes-even-when-our-wardrobes-are-full/) · [Credence Research India women's apparel](https://www.credenceresearch.com/report/india-women-apparel-market) · [LikeADiva 2026 Indian fashion trends](https://www.likeadiva.com/editorial/latest-trends/latest-fashion-trends-2026-the-hottest-indian-fashion-picks-for-women) · [Loom outfit recommendation (arXiv)](https://arxiv.org/html/2605.09830) · [Springer colour-harmony recommendation models](https://link.springer.com/article/10.1186/s40691-025-00433-y) · [UserIntuition habit loops](https://www.userintuition.ai/reference-guides/habit-loops-and-retention-what-to-study-what-to-ship/) · [Nir Eyal Hooked model](https://medium.com/googleplaydev/optimize-app-retention-with-the-hooked-model-a0781f8e5d29) · [Razorpay Rize Indian subscription psychology](https://rizevault.razorpay.com/p/the-psychology-of-subscriptions-in) · [ScienceDirect freemium willingness-to-pay](https://www.sciencedirect.com/science/article/pii/S0268401224000355) · [BusinessToday UPI price sensitivity](https://www.businesstoday.in/india/story/upi-fee-backlash-3-in-4-users-say-they-will-stop-using-platform-if-transaction-charges-are-imposed-525210-2026-04-11)*

---

## Addendum — Corrected Phase 3 Swap Contract (2026-07-10)

*Records the corrected product contract after the Phase 3 swap-wiring fix. This is the authoritative behaviour for the two dashboard actions; it does not replace the Phase 3 rationale above, it pins the final interaction split.*

### Swap One Thing
- Opens a slot picker first.
- Does not request candidates before slot selection.
- Replaces exactly one selected slot.
- Locks every non-selected item.
- Try another remains within the selected slot.
- Put back restores exact pre-swap item IDs.

### Another Option
- Is a separate full-outfit action.
- Uses a separate handler, route, loading state, and cap.
- Never opens the Swap One Thing sheet.
- Never uses the single-item swap route.

### Single-Hero Today Dashboard
- Today's Drop is the sole primary recommendation.
- Legacy Best Pick cards must never appear on the dashboard.
- Missing Daily Drop data triggers idempotent creation, not legacy fallback.
- Cron jobs may precompute recommendations but are not required for dashboard use.
- Different accounts may correctly receive different recommendation content.
- Release comparison checks structure and functionality, not identical outfits across accounts.
- Each dashboard request may perform at most one write-producing recommendation action. A newly created or regenerated outfit must pass final availability validation before rendering. If that validation fails, the request fails closed rather than writing again.
