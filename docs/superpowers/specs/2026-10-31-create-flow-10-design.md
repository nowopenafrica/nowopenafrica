# Create flow to 10/10 — design spec

2026-10-31 · status: **awaiting written review** · extends `2026-10-29-create-media-redesign-design.md` (whose sub-projects 3 and 4 this replaces and enlarges)

## 1. Intent

**Founder's words:** "Think of this as a modern day creative media request platform, make the workflow seamless and the templates best of the best, no gimmicks no unprofessional look. Completely structure everything including categories arrangement as best required. Best experience from Create – Template – Editor – Export – Pay/Donate/Free – Finish." Target 10/10 from an audited ~4/10.

**Decisions taken:**

| Question | Decision |
|---|---|
| What's paid at export | Every download free and full quality; an optional pay-what-you-want "Support NowOpen" step; prints and "designer finishes it" as optional upgrades |
| Unfinished (single-colour) templates | Hidden from the gallery until redesigned; rows and code stay |
| Hire-a-creator / services | One short lane inside each category; the long services list moves to `/media/services` |

**Success looks like:**
1. A first-time visitor finds "business card" within one tap of landing and sees 6+ finished, distinct options at card shape.
2. One category system everywhere (page tiles, gallery filters, search, request box).
3. From choosing a design to holding the file: no dead ends, no screen that asks the same thing twice.
4. Export offers PNG, PDF, print-ready PDF and a size pack; "Download free" is never harder to reach than paying.
5. A support payment is confirmed server-side before it is thanked or recorded; a failed or abandoned payment never blocks the free download.
6. After download there is always a next step: save, make the matching set, share sizes, order prints.

**Out of scope:** AI generation; logo generation; changing service prices; turning on live payment keys (founder action in Paystack).

## 2. Audit (measured 2026-10-31)

| Step | Score | Main problem |
|---|---|---|
| Create page | 4/10 | ~14 stacked sections |
| Categories | 3/10 | Three different taxonomies on one page (13 discipline tiles, 7 gallery filters, service disciplines) |
| Request → template | 4/10 | Text panel + one button, no options |
| Templates | 5/10 | 22 of 175 art-directed |
| Customiser / editor | 7/10 | Two editors; stat lists and some treatments not carried into Studio |
| Export | 6/10 | No print-ready, no size pack |
| Pay / Donate | 1/10 | No step; Credits inert; Paystack webhook never fired on live |
| Finish | 1/10 | Nothing after download |

## 3. Information architecture — one taxonomy

`src/lib/create/needs.ts` becomes the single source. Nine **needs**, each holding **deliverables** (the existing `DELIVERABLES` slugs and names, re-filed):

| Need (slug) | Deliverables |
|---|---|
| Business cards & stationery (`stationery`) | business card, letterhead, email signature, invoice, compliment slip |
| Brand & packaging (`brand`) | brand launch post, brand guidelines, product label, hang tag, packaging, merch |
| Social media (`social`) | post, story / WhatsApp status, carousel, reels cover, page & profile banners, YouTube thumbnail |
| Promotions & sales (`promotions`) | sale post, offer flyer, gift voucher, display ads |
| Flyers & posters (`flyers`) | A5/A4 flyer, A3 poster, notice |
| Events & invitations (`events`) | event poster, ticket, speaker card, wedding invitation |
| Menus & price lists (`menus`) | menu, price list, rate card |
| Signs & outdoor (`outdoor`) | shopfront sign, roll-up, billboard, banners |
| Documents & presentations (`documents`) | company profile, proposal, certificate, report & deck covers |

- `deliverables.ts` keeps its per-template map but each entry names a `need` and a `deliverable` slug; `DeliverableCategory` and `CREATE_CATEGORIES` (13 disciplines) are retired in favour of `NEEDS`. A test asserts every listed template sits in exactly one need and every need has ≥ 6 listed templates before the need shows on the page.
- `intent.ts` (request box) and `taxonomy.ts` (search) read `NEEDS`, so typing "business card" and tapping the tile land in the same place.
- **Listing rule:** the gallery and option grids list only templates with a hero `look`. Lookless code templates and uploaded rows without a look are not listed (still reachable by direct `?template=` link so nothing saved breaks).

## 4. Create page

Order, top to bottom, and nothing else:
1. **Request bar** — "What do you need?" input + the nine need tiles.
2. **Popular now** — business card, flyer, Instagram post, WhatsApp status, menu, invitation (six deliverables, one tap each).
3. **Need view** (when a tile, popular chip or request resolves) — the deliverable chips for that need, then the options grid (§5), then a slim lane: "Have it made for you" · "Order prints" (links into the existing configurator / services).
4. Footer strip — Track an order · All services (`/media/services`).

Moved off Create: Hire a creator, Browse by discipline, the 30-service list (→ `/media/services`); business packs and Credits (→ services page). Removed: the facts strip duplicated by §7.

## 5. Options and details (replaces spec sub-project 3)

- Selecting a deliverable shows **6+ options** (listed templates for it, each in its hero look, true shape), "Show more" after six; variety rule from the redesign plan applies.
- **Your details** panel beside the grid: fields per deliverable (card: name, role, business, phone, email, website; flyer: headline, date, venue, phone; menu: business + items; …), logo upload, "Use my brand colours". Updates all options live. Signed-in businesses are pre-filled from their profile.
- Each option: **Customise** (opens the customiser on that design with details applied), **Remix**, **Use this** (straight to Export).
- No match for a request → plain message + nearest need + "Have it made for you".

## 6. One editing experience

The quick customiser and Studio share the design document: "More editing" in the customiser opens `/media/studio` with the same document (look, details, text edits), never a fresh one; returning keeps edits. Known editor gaps carried from the look engine (stat lists as one colour; headline gradient gated) stay listed, not blocking.

## 7. Export — a checkout-style step

A panel (customiser and Studio share it):
1. **What do you need?** — PNG (social), PDF, **Print-ready PDF** (3 mm bleed, crop marks, at the print spec's delivered dpi; refuses formats that cannot reach print quality and says why), **Size pack** (one zip: the design re-laid at post, story and A4 where the template supports them).
2. **Support NowOpen (optional)** — ₦500 / ₦1,000 / ₦2,000 / custom, and an equally prominent **Download free**. Copy is calm and factual; no countdowns, no guilt, no watermark ever.
3. **Upgrades** — Order prints · Have a designer finish it (existing configurator / services).

**Payment design:** Paystack inline checkout → on return, an edge function calls Paystack **transaction verify** (server-side, secret key) and only then writes `support_payments` (amount, currency, reference, user or anonymous id, design key, status) and shows thanks. Webhook stays optional. The download is never gated on payment: choosing an amount opens checkout and the download proceeds whatever the result. Test mode first; live keys are the founder's action. RLS: insert only via the edge function; owners read their own rows.

## 8. Finish

After download, a finish screen (modal or route `/media/done/:id`):
- Download again (same files)
- **Save to My designs** (signed in; else "Sign in to keep it", nothing lost)
- **Make the matching set** — same look + details on the sibling deliverables of that need (e.g. card → letterhead, email signature, social post)
- Share-ready sizes (WhatsApp status, Instagram post/story)
- Order prints
- Thank-you line only when a support payment was verified

## 9. Build order (each ships after founder review)

1. **IA + Create page** (§3, §4) with redesign batches 2–3 so every need has ≥ 6 listed designs; services page split.
2. **Options + details** (§5) and one editing experience (§6).
3. **Export + Support** (§7) — print-ready PDF, size pack, Paystack verify edge function, `support_payments` table (one migration, recorded in the ledger).
4. **Finish** (§8) — matching set, save, share sizes.
5. Redesign batches 4–8 continue throughout.

## 10. Risks

- **Thin catalogue while hiding** — mitigated by gating each need on ≥ 6 listed designs and shipping batches 2–3 with step 1.
- **Payments** — webhook has never fired live; design depends on verify, not webhook. Real money: test mode only until founder switches keys.
- **Print-ready in a browser** — A3 cannot reach 300 dpi under the 4096 px export cap (printSpec.ts); the button says so instead of producing a soft file.
- **Shared dev/prod database** — the migration and any test rows hit production; test payments use Paystack test mode and are tagged `test`.
- **Broken links** — retiring the 13 disciplines must redirect old `?category=` URLs to the matching need.
