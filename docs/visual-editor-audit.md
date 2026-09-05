# NowOpen Visual Editor — Audit

Required by §1 of the brief, written before any editor code. Everything below is
measured against the repository, not assumed.

Measured 2026-09-05: 37 page components, 97 migrations, `site_settings` already
exists as a key→JSONB store with public read and staff write.

---

## 1. Existing page types

Four kinds, and they need completely different treatment:

| Type | Pages | Editable? |
|---|---|---|
| **Static marketing** | About, Contact, NowOpenOs, Platform, Founder, Security, Terms, Privacy | Yes — this is the editor's real remit |
| **Marketing + live data** | Home, Campaign, Pricing, Waitlist, DigitalForms | Copy yes, data no |
| **Data-driven records** | BusinessDetail, DiscoveryPage, Businesses, Offers, Adverts, Media | No — the content belongs to a business |
| **Application surfaces** | Dashboard, AdminDashboard, Login, Register, Profile, Studio, Forms | No — these are software, not pages |

Measured dependencies (`supabase` / `jsonLd` references per file):

```
Home            402 lines   5 supabase   0 jsonLd
About            85 lines   0 supabase   0 jsonLd    <- fully static
Platform        325 lines   0 supabase   1 jsonLd
Campaign        530 lines   6 supabase   1 jsonLd
Founder         615 lines   0 supabase   1 jsonLd
Pricing         592 lines   2 supabase   0 jsonLd
Contact         106 lines   0 supabase   0 jsonLd    <- fully static
BusinessDetail 2191 lines  10 supabase   1 jsonLd    <- never editable
```

## 2. Existing reusable components

`src/components/` is organised by domain (`business/`, `admin/`, `studio/`,
`campaign/`, `home/`, `layout/`). These are behavioural components with props,
not content blocks. **They are not, and should not become, editor primitives.**
An editor that can reorder `<BusinessCard>` is an editor that can break booking.

## 3. Editable content

Copy that a marketer should own without a deploy: hero headline and subheading,
section headings, body paragraphs, feature-card titles and descriptions, CTA
button labels, and the destination of a CTA *chosen from the existing route
list*. Plus per-slot presentation tokens (size, alignment, tone) and, where
explicitly permitted, visibility.

## 4. Dynamic content — must remain dynamic

Read from the database at render time and never overridable: business names,
addresses, phone numbers, hours, Open Now status, review ratings and counts,
trust tier and trust claims (`src/lib/trustClaims.ts`), offers, prices,
subscription plans, founding-member counts (`src/lib/founding.ts`), campaign
counters, search results and category listings.

## 5. Static content

Legal copy (Terms, Privacy), security disclosures, and any statement of fact
about the company. Technically static, but see §12 — static does not mean
editable.

## 6. Global components

`Header`, `Footer`, `Nav`, the cookie/consent surface and the SEO head managed
by `src/lib/seo.ts`. Navigation structure is **system-controlled**: the two-sided
architecture (people nav vs business nav) is a product invariant, and the router
in `App.tsx` is the source of truth for what a link may point at.

## 7. Page-specific components

Hero sections, pillar grids, pricing tables, FAQ blocks, campaign explainers.
These are where editable slots live.

## 8. Database dependencies

`site_settings` (key→JSONB, public read / staff write) is the existing precedent
and the model the editor follows. Business data lives in `businesses` behind the
generated `is_listable` column; visibility is decided by RLS, never by a page.
The editor introduces `page_content` and `page_content_versions` and touches
nothing else.

## 9. Routing dependencies

41 routes in `App.tsx`. `middleware.ts` treats single-segment paths as business
usernames unless reserved — so **the editor must never be able to create a
route**. It edits content on routes that already exist. CTA destinations are
validated against the router's own path list.

## 10. SEO dependencies

`applySeo()` owns title, description, canonical, robots, OG and JSON-LD.
Indexability is decided by code — `isIndexable` (discovery) and
`isIndexableProfile` (business profiles) — on provenance grounds, and the
sitemap is generated. **None of this is reachable from the editor.** Title and
description are editable per page as text; canonical, robots, JSON-LD and
sitemap membership are not.

## 11. Components that should become editable

In adoption order, lowest risk first: About, Contact, NowOpenOs, Platform,
Founder, Security, then the marketing copy on Home, Pricing, Waitlist and
Campaign. Adoption is per-slot and opt-in; an un-adopted page is byte-identical
to today.

## 12. Components that must remain system-controlled

Non-negotiable, and enforced by the architecture rather than by a rule:

- business verification, trust tier and trust claims
- Open Now / closing-soon status and opening hours
- `is_listable`, indexability, canonical URLs, JSON-LD, sitemap
- prices, plans, payment and checkout
- booking, ordering and inventory logic
- authentication, roles, RLS and anything in `permissions.ts`
- customer data of any kind
- legal notices (Terms, Privacy) — editable only through legal review, not a click
- platform navigation and routing
- every value read live from the database

---

## Architecture decision — overlay, not page builder

The obvious implementation is to turn each page into a JSON block tree and render
from it. **This is rejected.** It would mean rewriting working, SEO-critical
pages into data — the exact failure the brief warns about ("that's how good
existing functionality gets destroyed") — and a generic block tree would let an
editor type a trust claim into a paragraph or delete a canonical tag.

Instead: **pages stay React. The database stores overrides only.**

```
<Editable id="about.hero.title" as="h1">The operating system for
business growth in Africa</Editable>
```

The text in the code is the default and always renders. `page_content` stores
`slot id -> override`. The resolver returns override-or-default.

Four properties fall out of this, and they are the reason for the choice:

1. **Incremental by construction.** Adopting a page means wrapping copy. Nothing
   is rewritten, and un-adopted pages are untouched.
2. **Nothing can be destroyed.** Delete every row and the site renders exactly as
   the code says. A database outage is invisible.
3. **The allowlist is the schema.** Only what a developer wrapped is editable. A
   denylist ("don't let them edit trust badges") fails the day someone adds a new
   badge; this fails safe.
4. **No arbitrary CSS, ever.** Style is a fixed vocabulary of tokens per slot,
   mapped to a fixed class table. No author string reaches `style` or `class`.

## Build sequence (§67)

1. AUDIT — this document
2. SCHEMA — types, resolver, validation
3. SLOT REGISTRY — the allowlist
4. RENDERER — `<Editable>` and the content provider
5. STORAGE — `page_content`, `page_content_versions`, draft/publish RPC, RLS
6. ADOPTION — About, end to end, as proof
7. EDITOR OVERLAY — click to edit
8. VERSION HISTORY, PERMISSIONS, TEMPLATES, AI-assist (suggest only, never publish)
