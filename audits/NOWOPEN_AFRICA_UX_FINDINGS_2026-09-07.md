# NOWOPEN AFRICA — UX / UI FINDINGS
**Audit Date:** 2026-09-07 · Companion to `NOWOPEN_AFRICA_PLATFORM_AUDIT_2026-09-07.md`

Tested against production. Desktop 1665px and mobile 360×740 / 375×812.

> **Testing caveat, stated up front:** the audit browser held a signed-in **admin** session. Navigation observations ("Manage", "Dashboard", "Admin Creator", "Sign Out" all present) reflect an authenticated admin view, not a first-time visitor's. Public-content findings are unaffected. A clean anonymous pass is **still needed** and is listed at the end.

---

# THE CORE UX PROBLEM

> A first-time customer arrives asking "what's near me and open right now?" The page's honest answer is "two things, both belonging to the person who built this." Its actual answer is forty-two cards explaining that they are not businesses.

The homepage, below two real listings, is dominated by a block headed **"EXAMPLES, NOT LISTINGS — These are not businesses, no business is named, and there is nothing here to call."** Forty-two industry cards follow.

This is the *right* decision compared to the alternative — the platform previously carried invented businesses with fabricated ratings, and removing them was correct. But the current arrangement means the dominant impression of a business directory is a well-written explanation of why it has nothing to show.

**Recommendation:** pick one city and one vertical. Let the homepage answer the customer's actual question with real supply from that slice, even if it is fifteen barbers in Ikeja. Move the industry wall behind a single link. A directory that credibly serves one neighbourhood is worth more than one that gestures at 42 industries and serves none.

---

# FINDINGS BY SEVERITY

## 🔴 UX-1 — The homepage's centre of gravity is a disclaimer
- **Where:** `/`, below the two real listings
- **Evidence:** 42 cards under "EXAMPLES, NOT LISTINGS"; the two real listings occupy a fraction of the same viewport
- **Consequence:** the value proposition a customer tests ("can I find something?") fails, and the page explains the failure at length
- **Fix:** lead with real supply from a single slice; one link to the industry wall
- **Complexity:** Low (layout only)

## 🟡 UX-2 — Industry taglines claim capabilities that do not exist
- **Where:** `/` industry cards and `/platform`, rendered beside **"LIVE PAGE"** badges
- **Evidence, verbatim from production:**
  - "Designers — **Portfolios that plug into Behance, Dribbble and Figma**" — no such integration exists
  - "Fashion — Catalog, custom measurement and **live runway shows**" — does not exist
  - "Barbers — Cuts, **queue status and walk-in availability in real time**" — the queue module is a form; nothing is real-time
  - "Retail Shops — A storefront with inventory, flash sales and **same-day delivery**" — no delivery integration
  - "Hospitals & Clinics — Departments, doctors and appointments with **telemedicine built in**" — no telemedicine
- **Consequence:** this is precisely the category of claim the founder's own brief prohibits ("Do not leave fake buttons, placeholder interactions or non-functional UI"), on the most-viewed surface. A "LIVE PAGE" badge next to an unbuilt capability reads as a claim that it is live.
- **Note:** `/platform` was corrected earlier today — it now separates a derived "Working today" block from a clearly-labelled roadmap. **The homepage taglines were not**, and they are the same strings from `industrySystems.ts`.
- **Fix:** rewrite the taglines to describe shipped modules. `liveModulesFor()` already computes the truthful list per industry.
- **Complexity:** Low (copy)

## 🟡 UX-3 — Directory copy overstates coverage
- **Where:** `/businesses`
- **Evidence:**
  - Body copy: *"2 businesses across food, retail, tech, health, professional services and more."* Both businesses are `Media & Publishing`.
  - Page title: *"Businesses Directory — Find Verified Businesses Across Africa."* Exactly 1 business is verified, and it is the founder's own studio.
- **Consequence:** the two sentences a visitor reads first are both untrue in a checkable way
- **Fix:** derive the breadth sentence from the categories actually present, so it cannot drift
- **Complexity:** Low

## 🟡 UX-4 — 250 category filters against 2 listings
- **Where:** `/businesses` category selector
- **Evidence:** all 250 `BUSINESS_CATEGORIES` render as options; 249 produce an empty state
- **Consequence:** the same "controls that cannot work" defect fixed on the Create page earlier today. It reads as broken rather than empty.
- **Fix:** render only categories with listings; state the count honestly
- **Complexity:** Low

## 🟡 UX-5 — Hero promises five things and lands none
- **Evidence:** *"Africa is NowOpen. Discover customers. Find businesses. Advertise everywhere. Create anything. Grow with AI."* plus a badge reading *"Built for Africa's 100M+ businesses"*
- **Consequence:** a business owner cannot answer "what do I get?" in 30 seconds. The 100M+ badge is a market-size statement, but sitting above a two-listing directory it reads as puffery. "Grow with AI" also overstates what ships — Studio is rule-based and there is no LLM in the product path.
- **Fix:** one sentence per audience. The business-side promise is strong and specific — "a real business page that takes bookings, in ten minutes, free" — and it is currently buried.
- **Complexity:** Low (copy)

## 🟡 UX-6 — Mobile touch targets
- **Evidence at 360×740 on `/yemzoarts`:** 30 interactive elements under 40×40px
  | Control | Size | Standard |
  | --- | --- | --- |
  | **"Open menu" hamburger** | **35 × 35** | Most-tapped control on mobile; below the 44×44 guideline |
  | "Switch to dark mode" | 32 × 32 | Below guideline |
  | "Something wrong with this listing?" | 177 × **17** | **Fails WCAG 2.2 AA (24×24 minimum)** |
  | Footer contact links | 332 × 32 | Below guideline |
- **Note:** the codebase applies `min-h-[44px]` to primary CTAs throughout, so the standard is understood — these are icon-only and inline-text controls that were missed
- **Fix:** raise to 44×44; add a test asserting no interactive element renders under 44px at 360px
- **Complexity:** Low

## 🟢 UX-7 — Two tables for one "saved" concept
`business_keeps` (1 row) and `favorites` (0 rows). A user's saved businesses are split across two schemas. Consolidate before either accumulates data.

---

# WHAT IS GENUINELY GOOD

Recorded because it should not be lost while fixing the above.

### Honest empty states — the product's strongest UX trait
Consistently, across the app, the product tells the truth about its own emptiness and offers a next action:
- **Business profile:** "No reviews yet" — not a fabricated `0.0` beside a gold star
- **Create marketplace:** "No creative professionals listed yet — Nobody is listed here until a real person has claimed their profile. In the meantime you can make what you need yourself, higher up this page." With two ways out: *Browse the designs* / *List yourself as a creator*
- **Demo profiles:** a permanent banner — "This is a demo profile, not a real business… nothing to contact"
- **Directory search miss:** falls through to the industry directory with a route to listing your own business

This is rarer and more valuable than it sounds. Most early platforms fabricate to look busy. Preserve it.

### Search works correctly
Verified on production:
- Substring matching — "yemzo" finds "YemzoArts Studios"
- `?search=` deep-links are honoured and **pre-fill the input** (my first read of this was wrong; the URL param does work)
- No-results state is useful, not a dead end
- **Missing:** typo tolerance and synonyms. "barbin salon" or "resturant" return nothing. See the `pg_trgm` proposal in the remediation plan.

### Open/closed status renders honestly
`/yemzoarts` shows **"Closed · Opens tomorrow at 10:00 AM"** — the right information in the right words. The directory header shows "1 open / 1 closed / 0 hours not confirmed", including the honest third state for unconfirmed hours. (The underlying gaps — public holidays and non-expiring overrides — are logic defects covered in the technical findings, not UX.)

### Accessibility semantics are strong
Homepage, measured:
| Check | Result |
| --- | --- |
| `<h1>` count | 1 ✅ |
| Heading-level skips | 0 ✅ |
| Images without `alt` | 0 of 11 ✅ |
| Visible buttons without a label | **0 of 68** ✅ |
| Skip link | present ✅ |
| `<main>` landmark | present ✅ |
| Inputs without a label | 2 of 8 ⚠️ |

Zero unlabelled buttons out of 68 is better than most production sites achieve. The weakness is target *size*, not semantics.

### `/platform` was corrected today and is now a model for the rest
The industry panel now leads with a **"Working today"** block computed from the shipped module config — it cannot claim a capability the product lacks — above a clearly-labelled *"The full system we are building"*. The roadmap chips lost their green ticks, because a tick is a claim. **The same treatment should be applied to the homepage industry cards** (UX-2).

### Create page: 6-across catalogue and gated empty state
17 priced items at 6 per row matching the design gallery above it, and when nothing is listed the whole filter apparatus (search box, 21-option dropdown, six chips reading `0`, a heading counting to zero) is hidden rather than shown inert.

### Navigation hide-on-scroll
Slides away going down, returns going up, by transform so no content shifts. Respects `prefers-reduced-motion`, holds open while the mobile menu is open, and reveals on keyboard focus. Correctly built.

---

# MOBILE UX

Tested at 360×740 and 375×812 on production.

| Check | `/` | `/yemzoarts` |
| --- | --- | --- |
| Horizontal overflow | **0 px** ✅ | **0 px** ✅ |
| Widest element | a deliberately `w-max` marquee, contained ✅ | — |
| Card grid | 2-across, readable ✅ | — |
| Touch targets <40px | — | **30** ⚠️ |

**Not yet tested and material for this market:**
- 320px (older Android) — **UNVERIFIED**
- Throttled 3G — **UNVERIFIED.** The measured LCP of 1,484 ms is a *fast-connection* number. With a 193 KB gzip entry bundle the Lagos experience will be materially slower and should not be inferred from it.
- Intermittent connectivity — **UNVERIFIED.** No service worker and no offline state, so a dropped connection mid-navigation produces the lazy-import failure documented in the main audit rather than a graceful retry.
- On-screen keyboard behaviour over the sticky nav — **UNVERIFIED**

---

# RECOMMENDED UX DIRECTION

**One principle: stop explaining the emptiness and start filling it in one place.**

1. **Choose a slice.** One city, one or two verticals. Everything on the homepage serves that slice.
2. **Answer the customer's question with real data.** "Open now near you" with fifteen real barbers beats 42 industries with none.
3. **Let empty things be absent, not inert.** The Create page and `/platform` now do this. Apply it to the 250-category filter and the industry wall.
4. **Say one thing per audience.** The business promise — a real page that takes bookings, in ten minutes, free — is strong, specific, and currently competing with four other promises.
5. **Show proof, not tools.** A business owner will pay for customers, not for Studio. The dashboard needs one honest number: views, calls, WhatsApp clicks. That is the conversion lever, and it needs traffic before it can exist.
6. **Never re-introduce fabricated supply.** The honesty is a genuine asset. Fix emptiness with real businesses, not with plausible ones.

---

# STILL TO TEST

Named so the gaps in this audit are explicit rather than implied.

1. **A clean anonymous session** — all navigation findings here were made as a signed-in admin
2. **Signup → onboarding → first published profile**, timed end to end
3. **The claim-a-business flow** — `business_claims` = 0, never exercised
4. **Booking submission end to end** — `business_bookings` = 0, so the 8 module shapes have never been used by a real customer
5. **A Create order end to end** — `create_orders` = 0 despite 3 recorded order events; this is the paid path and it may be failing silently
6. **Dashboard and Studio on a 360px phone** — only public pages were tested at mobile widths
7. **Admin moderation at volume** — there is no volume to test with
8. **320px, throttled 3G, and a real low-end Android device**
9. **Safari/iOS** — 9 production errors read `Can't find variable: EmptyRanges` with a `played@ | syncControl@` stack on `/`, which looks like a WebKit `<video>` issue on the homepage hero. Not reproducible in the Chromium audit browser.
