# NowOpen Africa — Launch Readiness Report

**Date:** 2026-09-14
**Previous score:** 6.7 / 10 (2026-09-08)
**Current score:** **7.4 / 10**
**Verdict:** **Soft-launch ready** — with one product decision outstanding that
should be taken before any marketing spend.

---

## 1. Why the score moved

**+0.9 for engineering.** The platform did a great deal in six days: a real
discovery pipeline with rights enforcement, field-level provenance writing at
scale (0 → 18,851 rows), an enrichment engine, an admin editor with a
database-enforced claim boundary, and a full-profile CSV importer. The test
suite grew to 4,076.

**−0.2 for what that pipeline produced.** The directory is now 3,059 listings
of which 70% are hospitals and schools, essentially none have opening hours, and
1,176 wore a stock photograph presented as their own until this session.

A platform is scored on what a visitor meets, not on what was built.

---

## 2. Status by area

| Area | Status | Evidence |
|---|---|---|
| **Build** | ✅ Green | `npm run verify` exit 0 |
| **Tests** | ✅ 4,152 passing, 297 files | Was exit 1 with 14 hidden failures |
| **Security** | ✅ Sound | No secrets client-side; RLS on every table; SSRF probe-verified; claim guard verified in 4 directions |
| **Rights compliance** | ✅ Fixed | robots.txt gate failed open; now 10/10. No production crawl had used it |
| **SEO** | ✅ Strong | Per-route server rendering for crawlers, valid LocalBusiness + Breadcrumb JSON-LD, true 404s, 1,113-URL sitemap, indexability gated on usefulness |
| **Performance** | ✅ Good | TTFB 0.48s, 7.6KB shell; entry chunk 353KB is the one number to watch |
| **Mobile** | ✅ No horizontal scroll, 0 unnamed controls | 83 sub-40px targets remain (rem trap) |
| **Accessibility** | 🟡 Improved | 31 → 0 unnamed controls; modals, contrast and reduced-motion not yet swept |
| **Data quality** | 🟡 **The weak point** | 70% hospitals/schools; 0 hours on 2,810 listings; 1,176 stock covers (now labelled) |
| **Trust labelling** | ✅ Excellent | Unclaimed badge, 0/7-checks trust score, "24/7 assumed", "No reviews yet" |
| **Claim flow** | 🟡 Built, unused | Guarded on both sides; **2 claims of 3,059** |
| **Admin** | ✅ Capable | 23 tabs, discovery, review queue, business editor, audit log |
| **Advertise / Media** | 🟡 Thin | 97 placements, 18 creative services |

---

## 3. What improved this session

1. The repository's own quality gate was red and hiding 14 failing tests.
   Restored.
2. The robots.txt compliance gate allowed every URL, disallowed or not. Fixed.
3. The website parser crashed on any page without structured data. Fixed.
4. 1,176 profiles presented stock photographs as the business — on the page, in
   the alt text, in the WhatsApp share card and in schema.org. Fixed on all five
   surfaces and verified live.
5. 31 controls with no accessible name on the mobile homepage. Now zero.
6. The SSRF guard's cloud-metadata rejection now names the real reason.
7. The conservative "Open right now" behaviour is pinned by tests so it cannot
   flip silently.

---

## 4. What remains weak

**Critical (product, not code)**

- **The directory is not made of the businesses the homepage promises.** 1,621
  hospitals and 524 schools of 3,059. Either narrow the Wikidata type map and
  find an SME source, or change what the front page says.
- **Nothing has opening hours.** 0 of 2,810 discovered listings. "Open Now" —
  the feature the platform is named for — has three real listings to work with.
- **Two claims of 3,059.** The claim machinery is complete and unexercised.

**Important**

- The enrichment engine's only production output to date is 1,176 stock covers.
  No name, phone, address, hours or description has ever been proposed.
- OpenStreetMap would fix the hours gap and covers SMEs well, but its ODbL
  share-alike terms are a company decision nobody has taken.
- `/discover` is the thinnest crawler page on the site (1,512 bytes).
- Advertise and Media look sparse beside 3,059 businesses.

**Landed since (2026-09-14, later the same day)**

- The five in-flight migrations are **applied**; `check:drift` reports no drift.
  The four admin Business Intelligence tabs now read tables that exist.
  (NOA-017 closed)
- **Conflict resolution built** — a per-field source-authority ladder, a
  conflicts view over evidence, two resolution functions and an admin tab.
  Probe-verified against production inside a rolled-back transaction. Zero
  conflicts exist today because only one source has ever enriched a business;
  the tab says so rather than implying a fault.
- **NOA-018 fixed:** the enrichment engine discarded a second source's
  disagreement in silence — a unique-index rejection on an insert whose error
  was never inspected. Now reported rather than swallowed.
- **Public business submission shipped** — `/add-business` and `/join/business`,
  a shareable link for WhatsApp, Instagram, QR codes and outreach. Three
  submission types with different trust outcomes; a recommendation creates no
  business at all. This is the second acquisition loop, and the one that can
  move NOA-008 (2 claims of 3,059) — it is the only number that decides whether
  NowOpen is a directory or a business.
- **NOA-020 fixed before it could bite:** `profile_state` was declared but
  filtered nowhere, so an unreviewed public submission would have gone straight
  into the directory. Filtered at all six query sites and pinned by a test that
  scans the codebase.

**Housekeeping**

- 395 lint warnings (0 errors).
- 83 sub-40px tap targets (rem trap).
- Stock placeholders are recorded at evidence tier `source_confirmed`, which is
  wrong but currently consumed by nothing.
- `supabase db push` remains dangerous: the ledger records 20 of 119 migrations.
- Development and production share one Supabase project.

---

## 5. Critical unresolved issues

None that block a soft launch. The three "critical" items above are product
decisions, not defects — and each is now documented with the evidence needed to
decide it.

---

## 6. Readiness

| Level | Assessment |
|---|---|
| Not ready | — |
| Internal testing ready | ✅ passed |
| Private beta ready | ✅ passed |
| **Soft-launch ready** | ✅ **yes — this is where it sits** |
| Public-launch ready | ❌ not until the directory matches the promise and real businesses claim listings |

**Soft launch** means: invite businesses directly, work the claim flow by hand,
and let search engines index what is genuinely useful — **2,920 of 3,059
listings now clear the 40-point bar** (average score 54, up from 13 a week ago,
because discovery brought phones and addresses with it), plus the location and
category pages. The platform is honest
enough, fast enough and secure enough for that today.

**Public launch** — marketing spend, press, paid acquisition — should wait for:
a directory whose composition matches the pitch, opening hours on a meaningful
fraction of it, and enough claimed businesses to prove the loop closes.

---

## 7. Recommended next seven actions

1. **Decide what the directory is for.** Narrow the discovery type map to SMEs,
   or reposition the front page around services people search for (which
   genuinely includes hospitals and schools). One hour of decision, weeks of
   consequence.
2. **Solve hours.** Either take the OSM/ODbL decision, or make hours the single
   thing the claim flow asks for first.
3. **Run the claim loop by hand for 20 businesses.** Phone them. Two of 3,059
   is the only number that matters right now, and nothing else in this report
   changes it.
4. **Point the enrichment engine at facts, not pictures.** It has proposed 1,176
   images and zero contact details.
5. **Decide the placeholder question** — keep the labelled stock covers, or
   replace them with branded category illustration that never pretends to be a
   photograph.
6. **Thicken `/discover`** for crawlers.
7. **One accessibility pass** — tap targets, modal focus, contrast, reduced
   motion.

---

## 8. What this report is not

I did not test: payment flows end to end, email/WhatsApp onboarding delivery,
the Studio modules, the mobile app, or Core Web Vitals on a real device. Those
remain unverified rather than known-good.
