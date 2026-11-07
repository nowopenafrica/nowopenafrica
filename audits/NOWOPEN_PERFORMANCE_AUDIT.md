# NowOpen Africa — Performance Audit

**Date:** 2026-09-14 · Measured against production, not estimated.

---

## 1. Measured

| Metric | Value |
|---|---|
| Homepage TTFB | **0.476s** |
| Homepage shell | 7,579 bytes |
| Crawler profile page (TTFB / total) | 1.122s / 1.123s |
| Crawler profile size | 6,246 bytes |
| Location page (crawler) | 38,243 bytes |
| `index` JS chunk | **353,116 bytes** |
| `vendor-react` | 180,024 bytes |
| `vendor-supabase` | 124,530 bytes |
| Sitemap | 178,015 bytes, 1,113 URLs |
| Test suite wall time | ~26s for 4,074 tests |

The shell is small and TTFB is good for an audience on mobile networks. Vendor
chunks are already split.

---

## 2. Where the cost is

**`index` at 353KB is the number to watch.** It is the entry chunk, so it is on
the critical path for every visitor. Route chunks are split correctly
(`AdminDashboard`, `BusinessDetail`, `Discover`, `Dashboard`, `Studio` and ~40
others load on demand), so the work is in shared code pulled into the entry.

**Not measured, and worth measuring before optimising:** Core Web Vitals on a
real device over a 3G-class connection. Everything above is transfer size and
server timing, which is necessary but not sufficient.

---

## 3. Query behaviour

| Surface | Query shape |
|---|---|
| Homepage | 4 parallel reads — adverts 30, businesses 30 newest, businesses ≤24 claimed, media 30 |
| Discover | 1 read of ≤400 businesses ordered by `listing_score desc, created_at desc`, plus one review tally |
| Profile | `select('*')` on one row, plus services, products, reviews, locations |
| Admin | `select('*')` across ~14 tables in parallel on load |

Two observations:

- **`select('*')` on the profile** pulls all 72 columns including every jsonb
  story field. Fine for one row; it is the pattern to avoid in lists.
- **The admin console loads every table at once.** With 3,059 businesses and
  3,550 candidates that is already a heavy first paint for staff, and it grows
  linearly. Pagination or per-tab loading is the obvious next step — but
  measure it on a real admin session first.

**No N+1 found** in the public paths. The discover page tallies reviews in one
query rather than per card.

---

## 4. Scaling notes

The directory grew 453 → 3,059 in under a week. At that rate:

- `Discover`'s `limit(400)` already truncates: 2,659 listings are never
  considered by the rails. Ordering by `listing_score desc` means the ones cut
  are the thinnest, which is the right trade — but it is a silent one, and at
  10,000 listings the rails will represent 4% of the directory.
- The sitemap at 1,113 URLs is well under the 50,000 limit; it will need
  splitting eventually, not now.
- `business_evidence` at 18,851 rows is growing ~6 rows per published listing.
  Indexed on `(business_id, field_name, confidence desc)`.

---

## 5. Recommendations, in order

1. **Measure before optimising.** Run Lighthouse on a real Android device
   against `/` and one profile. Nothing below should start without that.
2. Look at what pulls 353KB into the entry chunk — likely a shared import that
   drags a heavy dependency into every page.
3. Paginate the admin console rather than loading 14 tables at once.
4. Revisit `Discover`'s `limit(400)` when the directory passes ~5,000.

Nothing here is a launch blocker.
