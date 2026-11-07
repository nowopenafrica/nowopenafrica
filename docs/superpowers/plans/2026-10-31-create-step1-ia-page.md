# Create Step 1 — One Taxonomy, New Create Page, Batches 2–3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three category systems on Create with nine real-life needs, rebuild the Create page around them, list only finished (looked) designs, move services to `/media/services`, and give every need at least six finished designs.

**Architecture:** A presentation taxonomy `src/lib/create/needs.ts` (nine needs, each a list of deliverables) sits on top of the existing per-template `DELIVERABLES` map: every entry gains `need` and `deliverable`. The database `category` column and its seven values stay untouched (uploads keep working); the page, gallery, search and request box read needs only. The listing rule (has a `look`) lives in one function. Design batches 2–3 are hero looks written into templates, exactly like batch 1.

**Tech Stack:** React 18, React Router 7, TypeScript, Vitest 3, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-31-create-flow-10-design.md` §3, §4, §9 step 1. Redesign rules: `docs/superpowers/plans/2026-10-31-template-redesign.md`.

## Global Constraints

- Nine needs, slugs exactly: `stationery`, `brand`, `social`, `promotions`, `flyers`, `events`, `menus`, `outdoor`, `documents` — titles exactly as spec §3.
- Popular now, exactly six deliverables in this order: business card, flyer, Instagram post, WhatsApp status, menu, invitation.
- Listing rule: a template is listed only when it has a `look`; unlisted templates stay reachable by `?template=` link.
- A need is shown on the page only when it has ≥ 6 listed templates; at the end of this plan all nine must pass that.
- The database `category` column and `DeliverableCategory` values are not changed or migrated.
- Old `?category=<13-discipline slug>` and gallery `?category=<7 value>` URLs redirect to the matching need.
- Redesign rules apply to batches 2–3: hex only in palettes.ts, `looks.test.ts` + `libraryVariety.test.ts` pass, fix designs not thresholds, at least one decorative shape in a second colour.
- Typecheck `npm run typecheck`. Preserve each file's line endings (several in `src/components/create` are CRLF). No commits without the founder's approval. Dev server shares the production database: write no rows.

## Review Focus

1. **A visitor lands with an old link** (`/media?category=packaging`, a bookmarked gallery filter) — expect the matching need open, never an empty page. → Task 4 test.
2. **A request the taxonomy doesn't hold** ("logo animation", "wedding video") — expect the plain no-match message plus the nearest need and "Have it made for you", never an unrelated grid. → Task 2 test.
3. **A saved design or shared `?template=` link to a now-unlisted template** — expect it still opens in the customiser/editor. → Task 3 test.
4. **Phone width (375px)** — need tiles and the popular row wrap without horizontal scroll; touch targets ≥ 44px explicit px. → Task 4 test + Task 6 browser check.
5. **An uploaded (database) template with no look** — expect it absent from every need and from counts, without breaking the gallery's merge of uploaded rows. → Task 3 test.

---

### Task 1: The needs taxonomy

**Files:**
- Create: `src/lib/create/needs.ts`, `src/lib/create/needs.test.ts`
- Modify: `src/lib/design/deliverables.ts` (type `Deliverable`; every `DELIVERABLES` entry)

**Interfaces:**
- Produces:
  - `type NeedSlug = 'stationery' | 'brand' | 'social' | 'promotions' | 'flyers' | 'events' | 'menus' | 'outdoor' | 'documents'`
  - `interface Need { slug: NeedSlug; title: string; blurb: string; deliverables: { slug: string; name: string }[] }`
  - `const NEEDS: Need[]` (spec §3 table order and titles)
  - `const POPULAR: { need: NeedSlug; deliverable: string; label: string }[]` (the six, in order)
  - `isListed(t: Pick<DesignTemplate, 'look'>): boolean` — true iff `t.look` set
  - `needFor(t: Pick<DesignTemplate, 'key'>): NeedSlug | null`, `deliverableSlugFor(t): string | null` — from `DELIVERABLES` (+ uploaded overlay)
  - `listedIn(need: NeedSlug, from: DesignTemplate[]): DesignTemplate[]`, `listedFor(deliverable: string, from): DesignTemplate[]`
  - `shownNeeds(from: DesignTemplate[]): Need[]` — needs with ≥ 6 listed
  - `needFromLegacy(slug: string): NeedSlug | null` — maps the 13 disciplines and 7 categories
- `Deliverable` gains `need: NeedSlug; deliverable: string` (required for code entries; optional on uploaded overlay).

- [ ] **Step 1: Failing tests** in `needs.test.ts`:
  - `it('has the nine needs in order')` — slugs equal the Global Constraints list; titles equal spec §3.
  - `it('files every code template under exactly one need and a deliverable of that need')` — for each `DESIGN_TEMPLATES` entry: `needFor` non-null and `NEEDS.find(n => n.slug === need).deliverables` contains `deliverableSlugFor`.
  - `it('lists only templates with a look')` — every `listedIn(...)` member has `look`; a lookless template is in none.
  - `it('keeps popular now to the six')` — `POPULAR.map(p => p.label)` equals `['Business card', 'Flyer', 'Instagram post', 'WhatsApp status', 'Menu', 'Invitation']` and each deliverable exists in its need.
  - `it('maps every legacy category to a need')` — each of the 13 `CREATE_CATEGORIES` slugs and 7 `DELIVERABLE_CATEGORIES` ids → non-null.
- [ ] **Step 2:** `npx vitest run src/lib/create/needs.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Write `needs.ts`; add `need` and `deliverable` to every `DELIVERABLES` entry (business cards keep slug `business-card`; deliverable slugs are kebab-case of spec §3 names, e.g. `letterhead`, `email-signature`, `instagram-post`, `story`, `carousel`, `flyer`, `poster`, `event-poster`, `ticket`, `invitation`, `menu`, `price-list`, `shopfront-sign`, `roll-up`, `billboard`, `company-profile`, `certificate`…). Legacy map (`needFromLegacy`): branding→brand (cards resolve to stationery via deliverable), social→social, outdoor/signage→outdoor, events→events, packaging/merchandise/artwork→brand, print/flyers→flyers, campaigns→promotions, documents→documents, menus→menus, video/photography→null.
- [ ] **Step 4:** Run the file + `npx vitest run src/lib/design src/lib/create` → PASS.

### Task 2: Request box speaks needs

**Files:** Modify `src/lib/create/intent.ts`, `src/lib/create/intent.test.ts`

**Interfaces:**
- Consumes: `NEEDS`, `NeedSlug` (Task 1).
- Produces: `needForIntent(intent: CreateIntent): NeedSlug | null`; `deliverableForIntent(intent: CreateIntent): string | null` (replaces `deliverableSlugForIntent`, which stays as a deprecated alias returning the same for `business-card`). `categoryForIntent` stays for the 7-value callers until Task 3 removes them.

- [ ] **Step 1: Failing tests:** "I need a business card" / "visiting card" → `stationery` + `business-card`; "flyer for my weekend sale" → `promotions` + `flyer`; "menu for my restaurant" → `menus` + `menu`; "wedding invitation" → `events` + `invitation`; "whatsapp status for new arrivals" → `social` + `story`; "shop sign" → `outdoor` + `shopfront-sign`; "logo animation" → `null` + `null` (Review Focus 2).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement by synonym lists (as the existing functions do; include Nigerian phrasings already in the file). **Step 4:** run `src/lib/create` → PASS.

### Task 3: Gallery and options list needs, listed designs only

**Files:** Modify `src/components/create/TemplateGallery.tsx` (CRLF), `src/test/createGallery.test.ts`

**Interfaces:**
- Consumes: Task 1 functions.
- Produces: `TemplateGallery` props `{ focus?: { need: NeedSlug | ''; deliverable: string; n: number } }` (replaces `focusCategory`); filter chips are needs, then the chosen need's deliverables; counts from `listedIn`.

- [ ] **Step 1: Failing tests:** gallery renders nine-or-fewer need chips equal to `shownNeeds`; selecting `stationery` then `business-card` shows only `listedFor('business-card')`; a lookless code template and an uploaded row without a look are not rendered (Review Focus 5); `templateByKeyAnywhere('<lookless key>')` still resolves (Review Focus 3).
- [ ] **Step 2:** FAIL. **Step 3:** implement; keep the uploaded-row merge (`useDesignCatalogue`) and filter after it. **Step 4:** `npx vitest run src/test/createGallery.test.ts src/components/create src/test/lookCustomiser.test.tsx` → PASS.

### Task 4: The Create page and the services page

**Files:**
- Create: `src/components/create/NeedTiles.tsx`, `src/components/create/PopularNow.tsx`, `src/components/create/NeedView.tsx`, `src/pages/MediaServices.tsx`, `src/test/createPage.test.tsx`
- Modify: `src/components/create/CreateMarketplace.tsx`, `src/pages/Media.tsx`, `src/App.tsx` (route `/media/services` declared before `/media/:id`), `src/components/create/IntentComposer.tsx` (answers with a need/deliverable instead of the text panel when one resolves)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: Create page order exactly spec §4: request bar + `NeedTiles`, `PopularNow`, `NeedView` (deliverable chips → `TemplateGallery focus` → lane "Have it made for you" · "Order prints"), footer strip "Track an order" · "All services". `MediaServices` page holds: Hire a creator, Browse by discipline, the services list, Business packs, Create credits — moved verbatim from `Media.tsx`/`CreateMarketplace.tsx`.

- [ ] **Step 1: Failing tests** (`createPage.test.tsx`, Testing Library, router memory history):
  - renders sections in spec §4 order and none of: "Hire a creator", "Browse by discipline", "Business packs", "Create credits";
  - tapping "Business card" in Popular now shows the business-card options and the lane links;
  - `/media?category=packaging` opens the `brand` need; `/media?category=menus` opens `menus` (Review Focus 1);
  - every need tile and popular chip has `min-height: 44px` in explicit px (Review Focus 4);
  - `/media/services` renders "Hire a creator" and the services list.
- [ ] **Step 2:** FAIL. **Step 3:** implement; the request bar keeps `IntentComposer`'s classifier and, when `needForIntent` resolves, opens `NeedView` instead of the text panel; no-match shows the plain message + nearest need + "Have it made for you". **Step 4:** `npx vitest run src/test/createPage.test.tsx src/test src/components/create` → PASS; `npm run typecheck`.

### Task 5: Redesign batches 2–3 — every need reaches six

**Files:** Modify `src/lib/designTemplates.ts`, `src/lib/design/catalogueTemplates.ts`; Modify `src/lib/create/needs.test.ts` (gating test)

- [ ] **Step 1: Failing test:** `it('shows all nine needs')` — `shownNeeds(DESIGN_TEMPLATES).length === 9`.
- [ ] **Step 2:** FAIL (only stationery and brand pass today).
- [ ] **Step 3:** Give hero looks to ≥ 6 templates in each of social, promotions, flyers, events, menus, outdoor, documents — the strongest compositions for real requests first (Instagram post, WhatsApp status, sale flyer, event poster, menu, price list, roll-up, company profile, certificate, invoice). Per redesign plan: assign palettes across the batch (≤ 6 uses each, no repeat inside a deliverable), pattern/type, move a decorative shape to `secondary`/`highlight`; where a small accent-toned line fails contrast, retone it rather than loosen anything.
- [ ] **Step 4:** `npx vitest run src/lib src/components/studio src/test` + `npm run check:templates` → PASS.

### Task 6: Verify, browser check, review sheet

- [ ] `npm run verify` — report its real result (the known unrelated `adminCreator.smoke` rejection may remain; name it).
- [ ] Browser (dev server `nowopen-edit`, `/media`) at desktop and 375px: the page order; each of the nine needs opens with ≥ 6 options at true shape; Popular now chips; an old `?category=` link; `/media/services`; console 0 errors.
- [ ] Publish a review sheet (screenshots of the new page at both widths and every new design from batches 2–3) and stop for the founder's approval before deploying.
