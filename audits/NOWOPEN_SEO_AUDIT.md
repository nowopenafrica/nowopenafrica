# NowOpen Africa — SEO Audit

**Date:** 2026-09-14 · Measured with and without a crawler user-agent.

**Verdict: strong, and easy to misjudge.** The one thing that was wrong — the
share image — is fixed.

---

## 1. Read this before touching anything

A plain `curl` of **every** route returns the same 7,579-byte SPA shell with the
same title. That looks like total SEO failure. It is not.

`middleware.ts` rewrites **crawler** requests to server-rendered Vercel
functions. Measured with `Googlebot`:

| Route | Bytes | Title |
|---|---|---|
| `/` | 2,464 | NowOpen Africa — The Operating System for Business… |
| `/discover` | 1,512 | Discover businesses — NowOpen Africa |
| `/businesses` | 1,971 | Businesses Directory — Find Businesses Across Africa |
| `/adverts` | 2,189 | Advertise in Africa — Book Billboards & Ad Placements |
| `/media` | 2,162 | NowOpen Create — Design, Print & Promote for Africa |
| `/platform` | 2,286 | Industry Operating Systems — NowOpen Africa |
| `/yemzoarts` | 14,468 | YemzoArts Studios — Media & Publishing in Ikot… |
| `/businesses/in/lagos` | 38,243 | Businesses in Lagos — NowOpen Africa |

To verify anything here:

```bash
curl -sL -A "Mozilla/5.0 (compatible; Googlebot/2.1)" https://www.nowopenafrica.com/<route>
```

The routing is in `middleware.ts`, **not** `vercel.json`.

---

## 2. What is right

- **Unique titles and descriptions** per route.
- **Canonical** on every page (`https://nowopenafrica.com/<slug>`).
- **Structured data**: valid `LocalBusiness` (name, url, description, image,
  telephone, sameAs, address) and `BreadcrumbList`. `sameAs` carries the
  website plus each social profile.
- **Heading hierarchy**: exactly one `<h1>` per profile.
- **Alt text**: zero images without `alt` on the crawler page.
- **Indexability is gated on usefulness** — `listing_score >= 40`, so thin
  profiles are `noindex, follow` rather than padding the index.
- **True 404s**: `/this-route-does-not-exist` and `/no-such-business-xyz`
  return **404** with `noindex` to crawlers.
- **Empty location pages** return 200 `noindex, follow` — right for a page that
  may fill later.
- **Sitemap**: 1,113 URLs. **robots.txt** disallows `/admin`, `/dashboard`,
  `/profile`, `/studio`, `/login`, `/register`, `/digital-forms`,
  `/reset-password`, `/forgot-password`.
- **No doorway pages.** Location and category pages are generated from real
  listings and carry real content (38KB for Lagos).

---

## 3. Fixed this session

**`og:image` and schema.org `image` were the stock placeholder.**

A profile's share card and its `LocalBusiness.image` both pointed at
`images.pexels.com`. `image` in schema.org asserts the photograph depicts the
business, and a share card is the most-forwarded surface NowOpen has — with no
room for the caption the page now carries.

Now: a placeholder is excluded from both. A real **logo** still stands (it is
the business's own mark); otherwise the card falls back to NowOpen's own
`og-image.png`. Four tests pin it, including "leaves a real photograph exactly
as it was".

---

## 4. Open

| Item | Priority | Note |
|---|---|---|
| `/discover` is 1,512 bytes for a crawler | P2 | The hub a discovery product should rank for is the thinnest page on the site |
| 70% of indexable listings are hospitals/schools | P1 | You will rank for "hospital in Lagos", not for the SME queries the brand targets |
| Sitemap lists hub pages only once each | P3 | Fine, but category × location pages are absent from it despite being the richest pages |
| `listing_score >= 40` excludes most of the directory | — | Correct behaviour. It is the *data* that needs to improve, not the bar |

---

## 5. Not a problem, recorded so it is not re-raised

- The identical SPA shell for humans is by design (§1).
- `/` being a username namespace (`/:username`) is deliberate and works — the
  middleware disambiguates, and unknown slugs 404 properly.
- Duplicate titles across routes exist **only** in the human shell, which
  crawlers do not receive.
