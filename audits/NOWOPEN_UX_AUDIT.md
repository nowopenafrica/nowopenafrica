# NowOpen Africa — UX, Brand and Accessibility Audit

**Date:** 2026-09-14 · Measured at 375×812 and desktop against the running app.

---

## 1. The honest-labelling system is the product's best asset

Most directories overstate. NowOpen does not, and this is worth protecting as a
deliberate design system rather than a set of accidents. On one profile a
visitor sees:

- `Unclaimed` beside the business name
- `Business Trust Score — UNVERIFIED — 11/100 — Not yet verified. 0 of 7 checks
  confirmed by our team.`
- `Open 24/7 — assumed · No hours confirmed yet, so we show the 24/7 default.
  The business can confirm real hours.`
- `No reviews yet` rather than a zero-star rating
- `Is this your business? Claim it to manage your page…`

Every one of those is a place a competitor would have written something
flattering. Keep them.

**Verified:** no component passes `hideDetail` to `OpenStateBadge`, so the
"default" qualifier can never appear stripped of its caveat.

---

## 2. Fixed this session

### The cover photograph was making a claim the page could not support
1,176 profiles showed a stock image as the business. Now captioned *"Stock
photo — not this business"* with a tooltip explaining the owner can replace it
by claiming, and alt text that says *"Stock photograph used as a placeholder
cover for …"* rather than naming the business as its subject.

### 31 unnamed controls on the mobile homepage → 0
Card image links were unnamed when a business had no image, and duplicated the
adjacent text link when it did — so a screen-reader user heard either "link"
with no destination, or every business twice. The image link is now correctly
decorative (`aria-hidden` **and** `tabIndex={-1}`).

---

## 3. Accessibility — measured

| Check | Result |
|---|---|
| Controls with no accessible name | **0** (was 31) |
| Images missing `alt` | 0 |
| `<h1>` per page | 1 |
| Horizontal scroll at 375px | none |
| Tap targets under 40px | **83** — see below |
| Skip link | present ("Skip to main content") |

**The 83 small targets** are mostly the known rem trap: the root font size is
under 16px, so Tailwind's `h-11` renders 39px rather than 44px. Several others
are 9–10px decorative dots that are not interactive targets. Worth one pass with
explicit pixel minimums; not a launch blocker.

Not yet audited in depth: keyboard traps in modals, focus-visible coverage
across all interactive states, `prefers-reduced-motion`, and colour contrast in
dark mode. These need a dedicated pass with an axe-style tool.

---

## 4. Brand and visual quality

**Strong.** Consistent blue CTA hierarchy, a coherent card system, restrained
use of gradients, dark mode throughout, sensible density. The profile page
carries a real information architecture — overview, services, products, gallery,
reviews, contact — rather than a wall of sections.

**Weak spots**

| Issue | Priority |
|---|---|
| 1,176 near-identical stock covers make the directory look generated | P1 — now labelled, but the *visual* monotony remains |
| A directory of hospitals and schools reads as a health registry, not a business network | P1 (product, see bug register NOA-007) |
| `/discover` rails collapse to two when most listings have no hours | P2 |
| Advertise (97) and Media (18) look empty beside 3,059 businesses | P2 |

**Recommendation on the placeholders:** now that they are labelled, the honest
options are (a) keep them — a labelled placeholder beats a grey box, or (b) drop
them for a branded category illustration that never pretends to be a
photograph. (b) is stronger for brand and removes the question permanently. It
is a product decision, not a defect, so I have not made it.

---

## 5. Journeys — state of each

| Journey | State |
|---|---|
| Find a business | Works. Search, category chips, location, sort; claimed businesses rank first |
| See whether it is open | Honest, but 3,056 of 3,059 answer "assumed" |
| Contact it | Call / WhatsApp / enquiry present; 2,913 of 3,059 carry a phone |
| Save it | Keep works, `/keeps` lists them |
| Claim it | Built end to end and guarded on both sides. **Two claims exist** |
| Owner edits profile | Full editor: details, story, socials, services, hours, gallery |
| Admin maintains an unclaimed listing | Built this month; blocked the moment a listing is claimed, with the reason shown |
| Advertise enquiry | Placements browse; 97 rows |
| Hire a creative | 18 services listed |

---

## 6. Recommended next UX work

1. Decide the placeholder question above (§4).
2. One pass on tap-target sizes with explicit px.
3. A dedicated a11y sweep (modals, focus, contrast, reduced motion).
4. Thicken the empty states on Advertise and Media — say "early" rather than
   showing a sparse grid.
