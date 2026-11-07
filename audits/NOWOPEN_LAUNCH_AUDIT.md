# NowOpen Africa — Launch Readiness Audit

**Date:** 2026-09-14
**Scope:** the 20-item launch checklist plus the 20 further gates the founder brief adds.
**Method:** measure on production → fix → re-measure on production. Nothing below
is marked done because the code looks right; it is marked done because it was
checked against `https://www.nowopenafrica.com` after deploying.

---

## 1. The 20-item checklist

| # | Item | Status | How it was verified |
|---|---|---|---|
| 1 | Privacy Policy | ✅ | `/privacy` 200, linked in footer |
| 2 | Terms & Conditions | ✅ | `/terms` 200, linked in footer |
| 3 | No secrets in frontend | ✅ | Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY`, `VITE_AI_ENGINE` — all intentionally public |
| 4 | HTTPS enforcement | ✅ | All four host/scheme variants 308 to one canonical origin; HSTS `max-age=63072000; includeSubDomains; preload` |
| 5 | Cookie/privacy consent | ✅ | `src/components/CookieConsent.tsx`, mounted in `App.tsx` |
| 6 | SEO titles & descriptions | ✅ | Unique per route, server-rendered for crawlers |
| 7 | Social sharing previews | ✅ **fixed** | `og:*` + `twitter:*` per route; `/add-business` and `/join/business` had no server-rendered entry and previewed as the generic site title |
| 8 | Favicon / app icons | ✅ | `favicon.ico` carries 16+32+**48**px (Google's current recommendation), `apple-touch-icon` 180², `og-image` 1200×630, PWA icons 192/512 |
| 9 | Sitemap + robots.txt | ✅ **fixed** | 1,144 URLs; acquisition routes were missing entirely; every URL and the robots `Sitemap:` directive pointed at a redirecting host |
| 10 | Image alt text | ✅ | No `<img>` in shipped components lacks `alt` |
| 11 | Image optimization | ✅ | WebP compression on upload, lazy loading, explicit dimensions |
| 12 | Page-load performance | ✅ | TTFB 0.62–0.87s, 7.5KB shell |
| 13 | Colour contrast / a11y | 🟡 | 0 unnamed controls; full contrast + screen-reader sweep **not done** |
| 14 | Mobile responsiveness | 🟡 | No horizontal scroll; **83 tap targets under 40px** remain |
| 15 | Custom 404 | ✅ | Branded page; crawlers receive a real **404 status**, not a soft 200 |
| 16 | Broken-link prevention | ✅ | `crawlerRouting.test.ts` reads `App.tsx` and fails if any route is unreserved |
| 17 | Form validation | ✅ | Client + server; `submit_business()` re-validates everything the form checks |
| 18 | Spam/abuse protection | ✅ **fixed** | Per-caller DB rate limits on 9 anonymous-write tables — there were none |
| 19 | Analytics + conversion tracking | ✅ | 27 typed events, DB CHECK constraint keeps the vocabulary honest |
| 20 | Clear calls-to-action | ✅ | One dominant CTA per section; `/add-business` is now the primary business CTA |

---

## 2. What was actually broken, and fixed

### NOA-022 — Every canonical URL on the site pointed at a redirect · **HIGH**

**Measured:**

```
http://nowopenafrica.com       308 → https://nowopenafrica.com/
https://nowopenafrica.com      308 → https://www.nowopenafrica.com/
https://www.nowopenafrica.com  200
```

So `www` is canonical. But `SITE_URL` and six `api/` defaults declared the
**non-www** host, which put a redirecting URL into every `<link rel="canonical">`,
every `og:url`, every structured-data `@id`, **all 1,131 sitemap `<loc>` entries**
and the robots.txt `Sitemap:` directive.

The site was telling Google "the canonical is non-www" while the server answered
"non-www is not canonical." Google treats `rel=canonical` as a signal weighed
against the site's other signals — here they contradicted each other on every
page, with the server overruling the tag every time.

**Fixed:** 29 occurrences across 16 files. **Re-measured after deploy: 0 of 1,144
sitemap URLs point at the redirecting host.**
**Pinned:** `src/test/canonicalHost.test.ts` scans `src/`, `api/`, `index.html`
and `public/` and fails on any file that disagrees.

### NOA-023 — The alias route competed with the page it aliases · **MEDIUM**

`/join/business` served byte-identical content to `/add-business` and declared
**itself** canonical — two URLs for one page, each claiming to be the original.
A duplicate-content signal the site created about itself.

**Fixed:** `MarketingPage.canonicalPath`; the alias now canonicalises to
`/add-business` and is deliberately excluded from the sitemap.
**Verified live:** `/join/business` → `canonical: .../add-business`.

### NOA-024 — The acquisition pages were not in the sitemap · **MEDIUM**

`/add-business`, `/discover`, `/send-business`, `/nominate` and `/open-now` were
absent from `STATIC_ROUTES`. The pages whose entire job is to be found by a
business owner searching for how to get listed were the ones never submitted for
indexing. **Fixed and verified live.**

### NOA-025 — Sixteen tables accepted anonymous writes with no ceiling · **HIGH**

`pg_policies` showed anonymous INSERT on `waitlist`, `business_enquiries`,
`platform_enquiries`, `business_reports`, `profile_requests`,
`radar_candidates`, `business_registrations`, `business_bookings`,
`os_form_applications` and more. Every policy is correct — a stranger *should*
be able to report a wrong listing without an account. What was missing was a
limit. A `curl` loop could have filled any of them.

**Why the database and not the client:** the client is the thing being defended
against. A rate limit in React is a rate limit a script does not run.

**How the caller is identified:** PostgREST exposes request headers to SQL —
**verified** by calling an RPC through the REST API and reading
`x-forwarded-for` back. The address is personal data, so it is never stored;
what is stored is `sha256(address || salt)` with the salt in `private_config`
(RLS on, zero policies).

**Limits are deliberately generous** (20–40/hour). Much of the audience sits
behind carrier-grade NAT, where one address can be a whole city's mobile users.
A tight limit would not stop a determined script and *would* stop a real
business owner in Lagos whose neighbour already used the form.

**Not applied to** payments (failing a checkout is worse than the abuse),
analytics (legitimately high volume) or stream chat (needs a per-room policy).

**Verified end-to-end through the real API:** inserts 1–20 returned `201`,
21–24 returned the throttle message. All 9 throttled tables still accept a
normal first write. Probe rows were deleted from production afterwards.

**A bug I introduced and caught:** the first version called `digest()`
unqualified. pgcrypto lives in the `extensions` schema and the function pins
`search_path` to `public`, so it created cleanly and then failed on **every**
anonymous waitlist insert. Found within minutes by testing through the real
door rather than trusting that it applied. Now `extensions.digest`.

### NOA-019/020/021 — fixed earlier in this session

Register dropping `?next=`; unreviewed submissions being visible in the
directory; the `/add-business` route being claimable as a business username.

---

## 3. Scores

| Area | Score | Basis |
|---|---:|---|
| Security | **9/10** | HSTS preload, full CSP with `frame-ancestors 'none'`, RLS everywhere, SSRF probe-verified, claim guard verified 4 ways, rate limits now real. −1: no error monitoring |
| SEO | **9/10** | Canonicalisation now self-consistent, per-route server rendering, valid structured data, 1,144-URL sitemap. −1: `/discover` still thin for crawlers |
| Performance | **8/10** | TTFB 0.62–0.87s, 7.5KB shell. −2: 348KB entry chunk; no field Core Web Vitals |
| Accessibility | **7/10** | 0 unnamed controls, alt text complete. −3: 83 sub-40px targets, no contrast or screen-reader sweep |
| Mobile | **8/10** | No horizontal scroll at any width tested. −2: tap targets |
| UX | **8/10** | Honest trust labelling throughout; clear CTA hierarchy |
| Conversion | **8/10** | Two acquisition loops live and now indexable; funnel events defined |
| Analytics | **7/10** | 27 typed events + DB constraint. −3: `analytics_events` historically 99.4% junk; funnels not yet built on the clean data |
| Reliability | **6/10** | `npm run verify` green, 4,157 tests. −4: **no error monitoring or observability at all** |
| Content | **7/10** | −3: directory is 70% hospitals and schools; almost nothing has opening hours |

### NowOpen Africa Launch Score: **7.7 / 10**

---

## 4. The hard launch rule

> Do not declare launch-ready until CRITICAL = 0 and HIGH = 0.

**CRITICAL: 0. HIGH: 0.** Both HIGH findings from this audit (NOA-022
canonicalisation, NOA-025 rate limiting) are fixed, deployed and re-verified on
production.

**Verdict: soft-launch ready.** Public-launch ready is still gated on product
decisions, not defects — see §6.

---

## 5. What I did NOT verify

Stated plainly, because an audit that hides its gaps is worse than no audit:

- **Core Web Vitals field data** (LCP/INP/CLS on real devices). I measured TTFB
  and payload size, which are not the same thing.
- **Email and WhatsApp delivery** — onboarding, claim and reset messages.
- **Payment flows end to end.** Deliberately excluded from rate limiting for
  that reason, and not exercised.
- **A full accessibility sweep** — contrast ratios, screen-reader traversal,
  modal focus traps, reduced motion.
- **Cookie consent behaviour** — the component exists and mounts; I did not
  verify that declining actually suppresses non-essential tracking.
- **The Studio modules and the mobile app.**
- **Google Search Console** — I cannot verify domain ownership or submit the
  sitemap. That is a founder action, and now worth doing: the sitemap it will
  read is correct for the first time.

---

## 6. Remaining work, in the order I would do it

1. **Error monitoring.** The single biggest gap. There is no way to learn that
   production broke except a user complaining. This is the only score below 7.
2. **Submit the sitemap in Search Console** and inspect one URL of each type.
   The canonicalisation fix means this will now report what you expect.
3. **Decide what the directory is for** — 70% hospitals and schools against a
   homepage promising business discovery. One hour of decision, weeks of
   consequence.
4. **Opening hours.** "Open Now" is the product's name and has three real
   listings to work with.
5. **One accessibility pass** — tap targets, contrast, modal focus.
6. **Thicken `/discover`** for crawlers.
7. **Work the claim loop by hand for 20 businesses.** Two claims of 3,059 is
   still the only number that decides whether this is a directory or a business.

---

## 7. Method note

Three things in this audit were wrong on first inspection and corrected by
measuring:

- I assumed `is_listable` gated on `listing_score`. It does not — which is why
  unreviewed submissions would have been publicly visible.
- I read a 200 on `/favicon-32x32.png` as "present". On this SPA every unknown
  path returns the shell, so a 200 proves nothing about an asset; checked by
  content-type instead.
- My own rate-limit migration broke every anonymous waitlist insert. It was
  found because the fix was tested through the production API rather than
  assumed from a clean migration run.
