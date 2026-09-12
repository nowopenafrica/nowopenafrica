# NOWOPEN AFRICA — SCORECARD
**Audit Date:** 2026-09-07 · **Overall: 5.1 / 10** · **Status: ⚠️ SOFT-LAUNCH READY**

Scores judge **outcomes**, not effort or complexity. A sophisticated implementation of something nobody uses scores low.

---

## THE TABLE

| Category | Score /10 | Confidence | Biggest Problem |
| --------------------- | --------: | ---------- | --------------- |
| Product               | 5 | High | A directory with 2 listings, both the founder's |
| UX                    | 6 | High | Homepage answers "find a business" with 42 cards saying "these are not businesses" |
| UI                    | 7 | High | Strong and consistent; icon-only controls under-sized |
| Mobile                | 6 | High | 0 overflow at 360px, but 30 touch targets <40px incl. hamburger at 35×35 |
| Performance           | 6 | Medium | 193 KB gzip entry, 4.3 MB assets; only measured on a fast connection |
| Functionality         | 6 | High | Most flows work; stale chunks break pages after every deploy |
| Search                | 4 | High | Client-side substring match, no pagination, no typo tolerance, no index |
| Discovery             | 2 | High | There is nothing to discover |
| Business Experience   | 7 | High | Substantial and real; no traffic, so ROI is unprovable |
| Customer Experience   | 3 | High | No supply, no reason to return |
| Advertiser Experience | 4 | Medium | 89 "active" placements owned by nobody; rights UNVERIFIED |
| Creative Experience   | 2 | High | Marketplace empty — 0 rows in `media_services` |
| Admin                 | 6 | Medium | Broad tooling; every moderation path is manual |
| Security              | 7 | High | Strong fundamentals; no rate limiting, policy lacks column restriction |
| Privacy               | 6 | High | Correct bucket privacy; dev telemetry writes to production |
| SEO                   | 3 | High | 105 of 111 sitemap URLs serve homepage metadata and canonical `/` |
| Accessibility         | 7 | High | Excellent semantics; touch targets and 2 unlabelled inputs |
| Data Architecture     | 6 | High | Sensible indexes and RLS; junk table, text price column, no pagination design |
| Scalability           | 3 | High | `select('*')` with no limit; all filtering client-side |
| Analytics             | 3 | High | 99.4% of events are one runaway emitter; no environment separation |
| Monetization          | 6 | High | Real Paystack/Stripe rail, 2 settled payments, plan caps now bite |
| Retention             | 2 | High | 1 keep, 0 offers, nothing to come back for |
| Trust & Safety        | 5 | Medium | Honest demo banners, no fake ratings; unowned ad inventory, aspirational taglines |
| African Market Fit    | 8 | High | Genuinely adapted, not merely localised |
| Brand                 | 8 | High | Distinctive, coherent, confident |

**Sum 128 ÷ 25 = 5.12 → 5.1 / 10**

---

## SCORE DISTRIBUTION

```
9-10  ████                                              0 categories
8     ████████                                          2   African Market Fit, Brand
7     ████████████████                                  4   UI, Business Exp, Security, Accessibility
6     ████████████████████████████                      7   UX, Mobile, Performance, Functionality,
                                                             Admin, Privacy, Data Architecture, Monetization (8)
5     ████████                                          2   Product, Trust & Safety
4     ████████                                          2   Search, Advertiser Exp
3     ████████████████                                  4   Customer Exp, SEO, Scalability, Analytics
2     ████████████                                      3   Discovery, Creative Exp, Retention
```

**Reading the shape:** nothing is world-class, nothing is catastrophically broken, and the tail is concentrated in exactly one theme — **the platform is empty and cannot yet be found.** Discovery (2), Retention (2), Creative (2), SEO (3), Scalability (3), Analytics (3) and Customer Experience (3) are all consequences of that single fact, not of seven independent failures.

---

## WHAT MOVES THE SCORE MOST

Ranked by score gained per unit of effort.

| Action | Categories lifted | Effort | Est. new overall |
| --- | --- | --- | --- |
| Fix SEO crawlability (SSR all public routes, fix sitemap) | SEO 3→7 | Days | 5.3 |
| Fix analytics (emitter + env gate) | Analytics 3→7 | Hours | 5.5 |
| Server-side pagination + search index | Search 4→7, Scalability 3→7 | ~1 week | 5.8 |
| **100 real businesses in one city** | Discovery 2→6, Customer 3→6, Retention 2→5, Product 5→7 | 30 days | **6.5** |
| Resolve advertising rights + real inventory | Advertiser 4→7, Trust 5→7 | Founder + weeks | 6.7 |
| Retention loop (offers / open-now alerts) | Retention 5→7 | ~2 weeks | 6.8 |

Note the ordering: the technical fixes together are worth about **+0.7**. Supply alone is worth about **+0.7** by itself and unlocks everything else. Both matter, but only one of them is the actual business.

---

## SCORE BAND

**5.1 → "Major weaknesses"** (5.0–5.9)

This is not a verdict on code quality. Read it as: *the product cannot yet do its core job for its core user.* A customer cannot discover a business, because there are two. That single failure caps the score regardless of how well everything around it is built.

For contrast, the same codebase with 500 real listings in Lagos, working SEO and fixed analytics — no new features — would score approximately **7.0**.

---

## CONFIDENCE NOTES

**High confidence** ratings rest on direct measurement: production SQL, crawler probes, in-browser instrumentation, bundle inspection.

**Medium confidence** ratings are limited by what could not be exercised:
- **Performance (Medium)** — measured warm-cache on a fast connection. No 3G throttling, no low-end Android, no load test.
- **Admin (Medium)** — surfaces inspected, but moderation was not exercised at volume; there is no volume to exercise it with.
- **Advertiser (Medium)** — the rights question is unanswerable from code.
- **Trust & Safety (Medium)** — depends on the same unresolved rights question.

**Explicitly UNVERIFIED and material to the score:**
1. Whether the 45 demo profiles are `noindex` in production. If they are not, SEO drops to 2 and Trust & Safety to 3.
2. Whether NowOpen holds rights to the 89 named advertising placements. If not, Advertiser drops to 1 and Trust & Safety to 2.
3. Why `create_orders` is empty despite 3 recorded order events. If orders are failing silently, Functionality drops to 4 and Monetization to 4.

Resolving those three could move the overall score by roughly ±0.4 in either direction. They should be answered first.
