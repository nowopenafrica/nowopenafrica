# NowOpen Africa — Platform Audit

**Date:** 1 September 2026
**Method:** measured against the live Supabase project and production
`nowopenafrica.com`, not read off the repository. Where a claim could not be
measured it is listed under *Not tested* rather than asserted.

---

## 1. What exists

A larger and more complete platform than its public footprint suggests.

| | Count |
|---|---|
| Source files (`src/**/*.ts,tsx`) | 647 |
| Lines of TypeScript | 114,062 |
| Components | 221 |
| Pages | 37 |
| Libraries (`src/lib`) | 254 |
| Database migrations | 94 |
| Edge functions | 15 |
| Serverless API handlers | 4 |
| Test files / tests | 181 / 2,282 |
| Runtime dependencies | **11** |

The dependency count is the standout. Eleven runtime dependencies for a
platform this size is unusually disciplined and is the main reason the
performance targets in the brief are reachable at all — there is no framework
debt to pay down first.

**Working subsystems** (verified this session): business profiles with
category-specific modules, Discover with filters and suggestions, Open Now
derived from real hours, Keeps, Offers, claim flow with admin approval, trust
tiers, Founding 1,000, Studio (Brand Kit, Design, Reel/Video, Motion, Creative
Director), Admin console (18 tabs), Radar discovery engine, Import Center,
Review Queue, AI workforce on a 15-minute cron, campaign layer.

---

## 2. The single largest gap: discovery is not crawlable

Measured as Googlebot on production, 1 September:

| Route | Server-rendered | Title returned |
|---|---|---|
| `/golden-sands-hotel` | **Yes** — 2 JSON-LD blocks | *Golden Sands Hotel — Hotel & Lodging in Lagos* |
| `/` | No | generic |
| `/discover` | No | generic |
| `/businesses` | No | generic |
| `/open-now` | No | generic |
| `/offers` | No | generic |
| `/businesses/in/lagos` | No | generic |
| `/businesses/restaurant/in/lagos` | No | generic |

Only business profiles render. The sitemap lists **175 URLs**, and all but the
~32 profile URLs return an identical `<title>`.

This is worse than "the homepage is a shell". `/businesses/in/lagos` and
`/businesses/restaurant/in/lagos` are the pages built to rank for *"restaurants
in Lagos"*, and to a crawler they are indistinguishable from the home page. The
sitemap actively submits them, so the platform is volunteering near-duplicate
URLs on the exact pages meant to earn organic discovery.

**Also:** the sitemap contains only **4** city discovery URLs
(`/businesses/in/{lagos,nairobi,accra,…}`) while 8 cities have listable
businesses.

> **Priority 1.** This is the item the brief calls a first-class architectural
> requirement, and it is measurable, bounded, and does not touch the working
> profile renderer.

---

## 3. Content reality — the constraint behind everything else

| | Live |
|---|---|
| Businesses total | 532 |
| Publicly listable | **32** |
| Synthetic prospects (hidden) | 500 |
| Claimed by an owner | 2 |
| With opening hours | 2 |
| Verified (real signals) | 1 |
| Founding numbers issued | 1 |
| Public reviews | 0 |
| Running offers | 0 |
| Registered users | 11 |
| Cities represented | 8 |
| Categories represented | 29 |

**30 of 32 public listings cannot answer "are they open?"** — the question the
product is named after. The platform's own chief-of-staff agent flags this as
critical on every run.

This constrains the SEO work rather than blocking it: rendering
`/businesses/in/lagos` for Google today surfaces a page where almost nothing can
answer the query it would rank for. Hours and claims are the prerequisite for
the discovery layer paying off, not a parallel track.

---

## 4. Technical debt

**Six files exceed 50KB**, three exceed 110KB:

| File | Size |
|---|---|
| `components/admin/MotionGraphicsStudio.tsx` | 141KB |
| `pages/BusinessDetail.tsx` | 123KB |
| `components/studio/DesignStudio.tsx` | 118KB |
| `pages/AdminDashboard.tsx` | 113KB |
| `components/studio/CreativeDirectorStudio.tsx` | 94KB |
| `components/dashboard/BusinessContentManager.tsx` | 81KB |

`BusinessDetail.tsx` is the concerning one: it is the **public** profile page,
the most SEO-critical and most-linked surface, and its lazy chunk is 310KB.
`MotionGraphicsStudio` and `AdminDashboard` are admin-only, so their size costs
staff time rather than customer time.

**Bundle:** main 571KB; `ContentFactory` 528KB, `jspdf` 386KB,
`AdminCreator` 359KB, `Studio` 315KB, `BusinessDetail` 310KB — all lazy.

**Latent bug found this session:** `ClaimBusiness` links to
`/login?next=<path>`, but `Login.tsx` reads `location.state.from` and ignores
`?next=`. A visitor who signs in to claim a business is returned to `/` instead
of the profile they were claiming — silently losing the highest-intent moment in
the funnel.

---

## 5. Security

Two findings, both fixed this session, and one still open.

**Fixed — automation endpoints failed open.** `run-automations` guarded with
`if (AUTOMATION_SECRET && header !== AUTOMATION_SECRET)` while
`AUTOMATION_SECRET` was **never set in production**, so the check was skipped
entirely and the endpoint was public. That function sends booking reminders,
review requests and trial nudges by **email and WhatsApp**; the anon key that
reaches it ships in the frontend bundle. Anyone could have made the platform
message its customers on demand. Now refuses to run without the secret —
verified 401 without a key, 401 with a wrong key, 200 with the right one.

**Fixed — the platform asserted trust it could not support.** Four industry
modules printed fixed claims with no condition: a pharmacy page stated
*"Genuine, verified medicines"*, a finance page *"Licensed & regulated"*, car and
property pages *"Inspected & documented"*. They rendered for every business in
those categories, including the 24 seeded listings with `trust_score 0` and no
owner. Now gated through `lib/trustClaims.ts`, which permits a claim only when a
real signal backs it.

**Open — the audit trail can be bypassed.** `audit_log` is written only from the
admin UI in the browser. RLS makes entries authentic when written; nothing makes
them get written. An admin acting through the API or SQL editor leaves no trace.
Sensitive actions should be logged by database triggers.

**Open — no error monitoring.** `reportError` and the global handlers are wired
and write to `analytics_events`, which exists with correct policies. But the
write is in a silent catch, the table is staff-read only, and **nothing alerts**.
An outage would be learned about from a customer.

---

## 6. Trust and moderation

| Capability | State |
|---|---|
| Unclaimed / claimed / verified states | **Built**, kept strictly apart |
| Lifecycle: suspended / temporarily closed / permanently closed | **Built** |
| Report a listing | **Built** — 11 reasons, anonymous-capable |
| Suggest a business | **Built** — feeds the Radar queue |
| Claim + admin approval | **Built** |
| Review Queue | **Built** |
| Provenance per record | **Built** — `source_*`, `data_status` |
| Report a **review** | **Missing** |
| Review moderation queue | **Missing** |
| Business right of reply | **Missing** |

Reviews are the exposure. A business cannot delete a bad review — only the
author can write their own row, which is correct — but there is no way to report
one, no moderation queue and no right of reply. The first fake or abusive review
arrives with no process behind it. Currently masked by there being **0 reviews**.

---

## 7. Growth infrastructure

**Built:** referral codes with server-side claiming, activation on meaningful
action (keep / add / claim — never on registration), Founding Circle, WhatsApp-
first share targets, campaign layer with server-authoritative counters, QR
generation, business share kit, Smart QR lockup, digital card.

**Missing:** creator program, business ambassador kit, embeddable widget,
`/stories` editorial hub, press page, programmatic city+category pages,
SEO opportunity dashboard, Internet Command Centre.

**Deliberately not built:** Keep & Win prize mechanics. Flagged twice —
a random-draw promotion in Nigeria engages promotional-competition rules and a
regulator. The configurable campaign shell exists; the draw does not.

---

## 8. Operations

- **Deployment is `npx vercel --prod`, not git push.** On 1 September the live
  site was found running a build from **7 August** — 151 commits behind — while
  36 migrations had been applied to the live database. The database ran a month
  ahead of the deployed frontend. Never infer what is live from git state.
- **No feature flags.** If Live, Offers, orders or AI video misbehaves on launch
  day the choices are ship a fix under pressure or take the platform down.
- **AI workforce is autonomous** — pg_cron every 15 minutes, four agents,
  notifications on critical findings only. Agents may read and report; they may
  not publish, message, approve or change a business.
- **Schema drift has closed.** All 11 critical tables answer on live.

---

## 9. Not tested

Stated so nothing above is read as more than it is. None of the following was
exercised: payments end to end including failure, duplicate and refund paths ·
backup restoration · account recovery flows · admin MFA · performance on a
mid-range Android over a slow connection · deep links from WhatsApp into the app
· the mobile app's parity with this session's web changes · an independent
security review · RLS coverage beyond the tables named above · Lighthouse.

**A backup you have not restored is not a proven backup** — the item I would
move to the top of this list.

---

## 10. Recommended priority

Ordered by measured value per unit of risk, not by the brief's section order.

| # | Work | Why now |
|---|---|---|
| 1 | Server-render city and city+category discovery | The only measured, bounded SEO gap. Does not touch the working profile renderer. |
| 2 | Opening hours for the 30 listings without them | Every discovery page ranks for a query the inventory cannot answer until this lands. |
| 3 | Fix the `?next=` claim redirect | One-line loss of the highest-intent moment in the funnel. |
| 4 | Feature flags | Smallest item here; makes launch day recoverable. |
| 5 | Error alerting + trigger-based audit logging | You cannot run a launch you cannot see. |
| 6 | Review reporting and moderation | Zero reviews today; unbounded exposure the day that changes. |
| 7 | Legal set + help centre | Mostly writing. Blocking for payments. |
| 8 | Programmatic city+category at a quality threshold | Only after 1 and 2, so pages have something to answer with. |

**Sequencing note.** Items 1 and 2 are one project, not two. Rendering discovery
pages before the inventory can answer "are they open?" produces exactly the thin
result Google's current guidance penalises — and the brief's own §29 forbids.
