# NowOpen Africa — Principal Product & Engineering Audit

**Audited build:** `Latest Web UI Updates/NowOpen Africa - (OpenCode) - Claude`
**Date:** 2026-08-04
**Method:** every finding below was verified against the running app, the production build output, the migration set, or a live DOM measurement. Nothing here is inferred from convention.

**Verification baseline:**

| Gate | Result |
|---|---|
| `npm run typecheck` | **FAILS — 14 errors across 9 files** |
| `npm run lint` | **FAILS — 1 error, 195 warnings** |
| `npm run test` | 412 passed / 412, 48 files |
| `npm run build` | succeeds, 5.88s |

> **Correction (2026-08-05).** The first version of this document reported typecheck and lint as clean. That was wrong. Both were run as `npm run <script> | tail -n`, and a shell pipeline exits with the status of its *last* command — `tail` always returns 0. The real exit codes are 2 and 1. This has been re-verified without the pipe. Any CI job written as `npm run typecheck | tee log` inherits exactly the same false-pass, which is worth checking before trusting a green build badge.

The test suite (412 passing, all real) and the clean build are genuine. But `vite build` uses esbuild, which strips types without checking them, and Vitest does not typecheck either — so **nothing in the current pipeline would fail on a type error.** That is how 14 of them accumulated.

This changes the character of the audit less than it might seem. The code is still disciplined — `src/lib/` is well-factored and heavily tested, and 12 of the 14 type errors are unused-import noise or genuine-but-contained bugs in two recent files (`renderVideo.ts`, `missions.ts`). But it removes the "all gates green" framing, and it adds a blocking item: **wire typecheck and lint into CI as hard gates, without pipes.**

---

## Executive Summary

**Overall score: 5.4 / 10**

**Product maturity:** Advanced feature-complete prototype. The feature surface is far ahead of most seed-stage products — 26 routes, 48 Studio modules, 31 industry-specific profile experiences, 52 migrations, real AI tooling. The *productisation* layer is behind the feature layer by roughly one quarter of work.

**Launch readiness: NOT READY.** Five critical blockers, and they cluster in one revealing pattern: **the things that only break in production are the things that are broken.** Dev works. Tests pass. Production silently loses features, search traffic, and all observability.

**The strategic finding.** NowOpen Africa's core promise is *"get discovered."* It is a discovery platform. Yet:

- Per-route SEO is wired into **2 of 26 pages** — every business profile is invisible to Google as a distinct entity.
- The Open Graph image is an **SVG**, which WhatsApp, Facebook, X and LinkedIn all refuse to render. In a WhatsApp-first market, every share is a bare link.
- There is **no analytics and no error monitoring of any kind.**

The product cannot currently prove it delivers its own headline value, and would not know if it stopped working. That is the launch blocker — not any individual bug.

**Critical blockers (detail in §Critical):**

1. Two divergent working copies of the codebase, no branch discipline
2. Per-route SEO on 2 of 26 pages + SVG `og:image` — discovery platform that can't be discovered
3. CSP blocks two live runtime dependencies **in production only**
4. Zero analytics, zero error monitoring
5. `device_push_tokens` UPDATE policy allows any anonymous caller to rewrite every row

**Quick wins — high value, under a day each:**

| Fix | Effort | Impact |
|---|---|---|
| Add 3 hosts to CSP `connect-src`/`media-src` | 10 min | Unbreaks stock footage + currency in prod |
| Render `og-image.png` alongside the SVG | 30 min | Restores link previews on every WhatsApp share |
| Wire `applySeo()` into the remaining 24 pages (it already exists and works) | 4 h | Makes the entire directory indexable |
| Scope the `device_push_tokens` UPDATE policy | 20 min | Closes a live write vulnerability |
| Add Sentry + one analytics provider | 3 h | Turns launch from blind to instrumented |
| `loading="lazy"` + explicit `width`/`height` on images | 3 h | Removes CLS, cuts mobile payload |
| Add a skip link | 15 min | WCAG 2.4.1 |
| Put Studio in the navbar | 30 min | Surfaces the flagship product |

Those eight items are ~2 days and move the overall score to roughly 7.

---

## Category Scores

| Category | Score | Basis |
|---|:--:|---|
| **Design** | 5 | Competent and consistent-*looking*, full dark mode, thoughtful fluid type scale. But no design system: 740 raw `<button>` across 128 files, 18 colour families, 14 radius variants, no token layer in `tailwind.config.js`. |
| **UX** | 6 | Flows work; deprecated-module aliasing is genuinely thoughtful. Undermined by the flagship being buried and 8 competing "how am I doing" scores. |
| **Performance** | 5 | Real route-level splitting (25/26 pages lazy) — good foundation. Then a 1,067 kB Studio chunk, 0/7 images lazy, 86/87 without dimensions. |
| **Architecture** | 5 | `src/lib/` is excellent: pure, testable, 412 tests prove it. Let down by five 60–96 KB god components and no data-fetching layer. |
| **Security** | 7 | **The strongest area.** Well-built CSP, HSTS preload, 109 RLS policies across 34 tables, service-role-only token isolation, server-side payment verification. Three specific defects hold it back. |
| **Accessibility** | 4 | Alt text 86/87, global `prefers-reduced-motion`, consistent `aria-modal`. But 0 focus traps, no skip link, no `focus-visible`, 87% of tap targets undersized. |
| **AI** | 7 | Genuinely differentiated and genuinely built — Creative Director, caption engine, trend radar, competitor insights, copywriter, brand health. Not vapourware. **Correction (2026-08-05):** this audit originally stated that none of it was model-backed and that an AI backend was the missing prerequisite. That was true of the copy audited, but wrong of the codebase: the sibling copy held `pollinations.ts`, a real keyless generative-AI integration (Flux Schnell images, Wan 2.x video), now merged in. The rule-based point still stands for `aiCopy`, `designCoach`, `captionEngine`, `trendRadar` and friends. |
| **Growth** | 4 | No analytics, SEO on 2/26 routes, SVG OG image. The growth loop is unmeasured and unshareable. |
| **Discovery** | 5 | Strong in-app search, filters, categories, and 31 industry-tailored profiles. Zero organic discoverability. |
| **Marketing** | 6 | Studio is a real, saleable asset that most competitors don't have. |
| **Scalability** | 5 | Config-driven industry system scales beautifully. Component and data layers don't. |
| **Maintainability** | 5 | 412 passing tests is a real moat. God components and 8 duplicate scoring systems cut against it. |
| **Developer Experience** | 5 | Exemplary `.env.example`, a real `LAUNCH.md` runbook, 412 real tests. Revised down from 7: typecheck and lint both fail, and nothing in the build or test pipeline catches type errors — plus the two-divergent-copies problem. |
| **Business Value** | 7 | The industry-OS thesis plus Studio is a defensible wedge. |
| **Production Readiness** | 4 | Features that work in dev break in prod; nothing is observable. |

---

## Critical Issues

### C1 — Two divergent working copies of the codebase

`Latest Web UI Updates/` contains **21 sibling copies** of this project. Two are actively being edited:

| Copy | `.ts/.tsx` in `src/` | Last edit |
|---|---|---|
| `NowOpen Africa - (OpenCode) - Claude` | 318 | `CreativeDirectorStudio.tsx` |
| `NowOpen Africa - (OpenCode)` | 320 | `pollinations.ts`, **~19 min later** |

Both descend from the same single commit (`339871e first commit`). Both were editing `CreativeDirectorStudio.tsx` and `renderVideo.ts` in the same session. There is one commit in history and no branches.

**Why it's critical:** there is no merge path. Work in one copy is silently invisible to the other, and `- Claude` is *missing two files* that exist in `(OpenCode)`. Every audit finding below, and every fix, applies to whichever copy you designate canonical — and the other one will drift further the moment someone touches it.

**Fix:** designate canonical today. `git init` properly, real commits, feature branches, and delete or archive the other 20 copies. Nothing else on this list matters if the code you fix isn't the code you ship.

**Effort:** 2 h. **Priority: do this first.**

> **RESOLVED 2026-08-05.** `NowOpen Africa - (OpenCode) - Claude` is canonical: committed, pushed to `origin/creative-studio-live-canvas`, and gated by `npm run verify`. The fork turned out to be two-way — the sibling held a real generative-AI "AI Art Director" (`pollinations.ts`) that this copy lacked, and has now been merged in. **The other 20 copies are still on disk and still a hazard; archiving them is the remaining step.**

---

### C2 — A discovery platform that cannot be discovered

Three compounding defects:

**(a) Per-route SEO covers 2 of 26 pages.** `src/lib/seo.ts` exports a working `applySeo()` with title, description, canonical, OG and JSON-LD support. It is imported by exactly two files:

```
src/pages/Founder.tsx:9
src/pages/Platform.tsx:4
```

Not `BusinessDetail` (every business profile). Not `Businesses` (the directory). Not `Home`, `Pricing`, `Media`, or `Adverts`. Confirmed live: `/studio` still serves the homepage `<title>`. This is an SPA with no SSR or prerendering, so a crawler receives one identical title and description for the entire site — including all 31 industry demo profiles and every real business.

**(b) `og:image` is an SVG.** `index.html:35` and `:47` both point at `/og-image.svg`, and `public/` contains only `og-image.svg` (2,167 bytes) — no PNG. WhatsApp, Facebook, X and LinkedIn **do not render SVG** in link previews. In a market where WhatsApp is the primary distribution channel, every shared business profile appears as a bare grey link.

**(c) No `document.title` per route.** Beyond SEO, this is an accessibility failure — screen readers announce page titles on navigation, and SPA route changes are silent.

**Business impact:** this is the mission. A directory whose listings don't rank has no organic acquisition funnel, and its viral loop (share your profile) produces previews that suppress click-through.

**Fix:** wire `applySeo()` into all 26 pages with business-specific metadata + `LocalBusiness` JSON-LD on profiles; render a 1200×630 PNG and point OG/Twitter tags at it (keep the SVG for favicon use); add prerendering (`vite-plugin-prerender`) or migrate the public surface to SSR for profile pages.

**Effort:** 4 h for SEO + PNG, 1–2 days for prerendering. **Priority: Critical.**

---

### C3 — CSP blocks live runtime dependencies in production only

`vercel.json`'s CSP is well-constructed, which is exactly why this is dangerous: it is strict, and it is missing three hosts the code actually calls. Dev has no CSP, so **these features work in every test and break only once deployed.**

| Call site | Host | Missing directive |
|---|---|---|
| `src/lib/stockFootage.ts:148` | `api.pexels.com` | `connect-src` |
| stock video playback | `videos.pexels.com` | `media-src` |
| `src/lib/currency.ts:98` | `open.er-api.com` | `connect-src` |

Consequence in production: AI Creative Director stock-footage search throws on every call, and multi-currency pricing silently falls back to stale rates across a 20-market platform.

**Fix:** add `https://api.pexels.com https://open.er-api.com` to `connect-src` and `https://videos.pexels.com` to `media-src`. Then add a CI check that greps `fetch()` hosts in `src/` and diffs them against the CSP allowlist — this class of bug will recur otherwise.

**Effort:** 10 min + 2 h for the guard. **Priority: Critical.**

---

### C4 — Zero analytics, zero error monitoring

No Sentry, PostHog, GA, Plausible, Mixpanel or equivalent appears anywhere in `src/` or `index.html`.

You have proposed a standing rule that every PR must improve **Discoverability, Speed, Trust, Business Growth, or Revenue**. That rule is currently unenforceable — none of the five is instrumented. You cannot run the process you want without this.

Equally: with 222 `catch` blocks routing to `toast.error`, production failures are shown to the user and then discarded. You will not know that C3 is breaking stock footage for every merchant.

**Fix:** Sentry for errors + one product analytics provider. Instrument the five metrics as explicit events: profile impressions/search appearances (Discoverability), Web Vitals via `web-vitals` → analytics (Speed), verification and review events (Trust), bookings/enquiries/leads (Business Growth), `payment_intents` transitions (Revenue). Add both hosts to the CSP in the same change.

**Effort:** 3 h basic, 1 day for the full five-metric funnel. **Priority: Critical.**

---

### C5 — `device_push_tokens` allows anonymous rewrite of every row

`supabase/migrations/20240722000000_device_push_tokens.sql:30-32`:

```sql
CREATE POLICY "Anyone can update a push token" ON device_push_tokens
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
```

`USING (true)` with no row scope means any caller holding the public anon key — which ships in the JS bundle — can `PATCH /rest/v1/device_push_tokens?id=gt.0` and overwrite `token` and `user_id` on **every row in the table**.

Impact: all platform push notifications redirect to an attacker-controlled device; or trivial denial of notification service. `SELECT` is correctly admin-gated, but reading isn't required to exploit this.

**Fix:** drop the anonymous UPDATE. Scope to `USING (user_id = auth.uid())` for authenticated users, and handle anonymous device registration as an idempotent upsert keyed on the token value inside an edge function with the service role.

**Effort:** 20 min + redeploy. **Priority: Critical.**

---

## High Issues

### H1 — There is no design system

The single largest source of long-term drag. Measured across `src/`:

| Metric | Count |
|---|---|
| Raw `<button>` elements | **740**, across **128 files** |
| Shared UI primitives (`components/ui/`) | **0 — directory does not exist** |
| Tailwind colour families in use | **18** |
| `rounded-*` variants | 14 (`rounded-lg` 806, `rounded-full` 361, `rounded-xl` 236, `rounded-2xl` 226, `rounded-md` 49, …) |
| `shadow-*` variants | 6 |
| Distinct CTA gradient pairs | dozens, no canonical primary |
| Design tokens in `tailwind.config.js` | **none** — only `fontSize` clamps and `fontFamily` |

`tailwind.config.js` extends no colours, spacing, radii, shadows, or motion. Every visual decision is a raw utility string at 740 call sites. There is no `primary`, no `--radius`, no elevation scale. `rounded-lg` vs `rounded-xl` vs `rounded-2xl` are all in heavy use with no rule distinguishing them.

**Consequence:** a rebrand, a dark-mode contrast fix, or a radius change is a 128-file find-and-replace with no way to verify completeness. This is why the UI reads as "consistent-looking" rather than *systematic* — the consistency is manually maintained and will decay with every new module.

**Fix — the highest-leverage refactor available:**
1. Define semantic tokens in `tailwind.config.js`: `primary`/`surface`/`muted`/`success`/`warning`/`danger`, a 3-step radius scale, a 3-step elevation scale. Collapse 18 colour families to ~6 roles.
2. Build `src/components/ui/`: `Button` (variant × size × loading), `Input`, `Select`, `Card`, `Badge`, `Dialog`, `Tooltip`, `Table`, `Alert`, `Avatar`. Use `cva` + `tailwind-merge`.
3. Migrate incrementally — `Button` and `Dialog` first (they carry the accessibility fixes in H2 and H3 for free).
4. Add an ESLint rule banning raw `<button>` outside `components/ui/`.

**Business impact:** every subsequent UI change gets cheaper; accessibility and mobile fixes become one-file changes instead of 128.

**Effort:** 2 days for tokens + primitives, then incremental. **Priority: High.**

---

### H2 — 15 modals declare `aria-modal` and none implement it

15 components render `role="dialog"` + `aria-modal="true"`. Measured:

- **13 of 15** have no `Escape` key handler (only `BusinessDetail` and `MediaDetail` do)
- **0 of 15** trap focus or set initial focus

`aria-modal="true"` is a contract with assistive technology: it asserts that content outside the dialog is inert. Declaring it without implementing focus containment is **worse than omitting it** — a screen reader announces a modal context while focus silently remains in the page behind it. Keyboard users cannot close any of these 13 dialogs without a mouse.

Affected: `PaymentModal`, `BookingModal`, `CartModal`, `EnquiryModal`, `ConfirmDialog`, `GoLiveModal`, `TeamManager`, `TrustPanel`, `PlatformEnquiryModal`, `TrialPromoModal`, `LiveViewerModal`, `BusReelCapture`, `AdminDashboard`.

`PaymentModal` and `BookingModal` are in the revenue path.

**Fix:** one `<Dialog>` primitive (Radix UI, or `focus-trap-react`) with focus trap, restore-on-close, `Escape`, and scroll lock. Replace all 15. This is a single well-tested component, not 15 fixes.

**WCAG:** 2.1.2 (No Keyboard Trap), 2.4.3 (Focus Order). **Effort:** 1 day. **Priority: High.**

---

### H3 — 87% of mobile tap targets are below minimum size

Live measurement, `/studio` at 375×812:

```
tap targets total: 100
under 44×44:        87
```

Examples: theme toggle **32×32**, icon button **35×35**, business selector **347×33**, "Growth Center" **116×32**, "Dashboard" link **74×18**.

Apple HIG requires 44×44pt; Material requires 48×48dp; WCAG 2.5.5 requires 44×44 CSS px. For a platform whose users are overwhelmingly on Android phones, this is the defect most likely to make the product feel unfinished in a user's hand.

**There is a structural cause, found while fixing an unrelated feature.** `src/index.css:44–76` uses the root font-size as a deliberate global "zoom lever": 16px base, **15px ≥768px, 14.5px ≥1536px, and 14px ≤640px**. Because Tailwind's spacing scale is rem-based, every size utility shrinks with it. Verified in the running app: `min-h-11` (nominally 2.75rem = 44px) computes to **39.875px** on desktop and **38.5px on phones** — the exact breakpoint where the 44px minimum matters most.

So `min-h-11` *cannot* satisfy the touch-target requirement anywhere in this app. Any fix written in rem will silently miss by 9–12.5%.

**Fix:** enforce touch targets in **px**, not rem — `min-h-[44px] min-w-[44px]` — inside the `Button` primitive (H1). Do not use `min-h-11`. Either add a `touch` size token to `tailwind.config.js` that is px-based, or exempt interactive minimums from the rem scale. Then audit remaining links and selects.

**Effort:** 4 h after H1. **Priority: High.**

---

### H4 — Edge-to-edge rendering enabled without safe-area insets

`index.html:5` sets `viewport-fit=cover`; `index.html:25` sets `apple-mobile-web-app-status-bar-style="black-translucent"`. Both opt the app into drawing under the notch and home indicator.

`env(safe-area-inset-*)` appears **nowhere** in `src/` — not in any component, not in `index.css`.

Consequence on any modern iPhone: header content sits under the status bar, and bottom-anchored content sits under the home-indicator gesture area. Also affects Android devices with gesture navigation.

**Fix:** add safe-area padding to the app shell, header, and any fixed-position element:
```css
padding-top: env(safe-area-inset-top);
padding-bottom: max(1rem, env(safe-area-inset-bottom));
```

**Effort:** 2 h. **Priority: High.**

---

### H5 — Studio ships as a single 1,067 kB chunk

Production build:

| Chunk | Raw | Gzip |
|---|---|---|
| `Studio` | **1,067.40 kB** | 302.97 kB |
| `index` | 519.65 kB | 155.88 kB |
| `BusinessDetail` | 274.22 kB | 43.72 kB |
| `html2canvas` | 201.42 kB | 48.03 kB |
| `Dashboard` | 159.54 kB | 36.26 kB |

Route splitting is correctly done at the page level, but all **48 Studio modules load together**. A merchant opening the Digital Business Card downloads the video renderer, `html2canvas`, the AI Creative Director and 45 other modules. On a 3G connection that is a multi-second wait for one tool.

The 519 kB `index` chunk is also the entry cost for every visitor, including the landing page.

**Fix:** `lazy()` each Studio module behind its `switch` branch in `renderModule()` — the existing structure makes this mechanical. Dynamic-import `html2canvas`/`jspdf` at export time only. Add `manualChunks` to split vendor. Target: Studio shell under 150 kB, index under 250 kB.

**Effort:** 1 day. **Priority: High.**

---

### H6 — Pexels API key shipped to the browser

`VITE_PEXELS_API_KEY` is a `VITE_`-prefixed variable, so it is inlined into the production bundle and readable by anyone. `stockFootage.ts:149` sends it as an `Authorization` header.

Anyone can extract and exhaust your quota or get the key banned. Notably, `.env.example` is otherwise **exemplary** about this distinction — it explicitly documents that `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY` and the social secrets must never be `VITE_` vars. This one slipped through the same reasoning.

**Fix:** proxy Pexels search through an edge function holding the key as a secret. Resolves H6 and half of C3 together.

**Effort:** 3 h. **Priority: High.**

---

### H7 — The flagship product has one entry point

Studio — 48 modules, the largest chunk, the primary paid differentiator — is linked from exactly **one** place in the entire app: a link inside `/dashboard`.

Main nav is `Home · Businesses · Adverts · Media · Pricing`, plus `Platform`/`Waitlist` in a dropdown. Studio is not in the navbar, not in the authenticated user menu, not on the homepage.

A merchant signs up, lands on Dashboard, and must notice one link to discover the entire marketing suite. The Dashboard/Studio split is itself unclear: bookings, enquiries, products and team live in Dashboard; brand, campaigns and content live in Studio. Both are "manage my business."

**Fix:** Studio as a primary nav item for authenticated business users. Longer term, merge Dashboard and Studio into one merchant workspace with a single sidebar — Dashboard's operational modules become Studio groups ("Orders", "Customers"), matching the mission statement's "manage their business from one platform."

**Effort:** 30 min for nav; 1 week for the merge. **Priority: High.**

---

### H8 — Eight competing "how is my business doing" scores

Distinct scoring functions in `src/lib/`:

```
computeTrustScore      (trust.ts)
computeBrandHealth     (brandHealth.ts)
getBusinessHealth      (businessStatus.ts)
growthScore            (growth.ts)
marketingHealth        (marketingHealth.ts)
marketingScore         (marketingHealth.ts)
```

Plus three redundant number→label formatters: `healthLabel`, `scoreLabel`, `analyticsScoreLabel`.

Surfaced across 10 panels: `GrowthScorePanel`, `BrandHealthPanel`, `HealthDashboard`, `DailyGrowthDashboard`, `CampaignAnalytics`, `GrowthHome`, `TrustPanel`, `CompetitorInsightsPanel`, `BrandKitStudio`, `SocialStudioHub`.

A merchant is shown at least five different numbers, on different scales, all claiming to represent their standing. This actively destroys trust in all of them — if Growth Score says 72 and Marketing Health says 45, the product looks broken and the merchant disengages from the metric entirely.

**Fix:** one canonical **NowOpen Business Score** with published sub-scores (Trust, Discoverability, Marketing Activity, Growth Momentum) that roll up to it. One `lib/businessScore.ts`, one gauge component, sub-scores shown as contributing pillars. Collapse the three label functions into one.

**Business impact:** a single credible score is the retention hook for the whole product — it is the reason a merchant opens Studio on a Tuesday.

**Effort:** 3 days. **Priority: High.**

---

### H9 — Unrate-limited anonymous write endpoints

Eight tables accept anonymous `INSERT` with `WITH CHECK (true)`:

`waitlist`, `business_registrations`, `payment_intents`, `business_enquiries`, `business_bookings`, `stream_followers`, `platform_enquiries`, `device_push_tokens`

Rate limiting exists (`supabase/functions/_shared/rateLimit.ts`) but is applied **only to the chatbot function**. These tables are reachable directly via PostgREST with the public anon key.

Anyone can flood merchant enquiry inboxes and booking calendars, poison the waitlist, or inflate `payment_intents`. Public insert is the *correct* design for these — unmetered public insert is not.

**Fix:** extend `_shared/rateLimit.ts` to a `submit-form` edge function fronting these tables; revoke direct anon insert. Add a Cloudflare Turnstile check on `business_enquiries`, `business_bookings` and `waitlist`. Add DB-level constraints (per-IP hourly cap via a trigger).

**Effort:** 2 days. **Priority: High.**

---

### H10 — No skip link

No skip-to-content link exists (verified live: no `a[href="#main"]` or equivalent). Keyboard and screen-reader users must traverse the entire navigation on every page.

**WCAG 2.4.1 (Bypass Blocks), Level A.** **Fix:** one `sr-only focus:not-sr-only` anchor in `App.tsx` + `id="main"` on `<main>`. **Effort:** 15 min. **Priority: High** (trivial cost, Level A failure).

---

## Medium Issues

**M1 — Images: no lazy loading, no dimensions.** Live: 7 of 7 rendered images have `loading` ≠ `lazy` and no `width` attribute. Codebase-wide: 8 `loading="lazy"` for 87 `<img>`; 1 image with an explicit `width`. Missing dimensions cause CLS on every page; eager loading wastes bandwidth on 3G. No `fetchpriority="high"` on the hero LCP element (only the font is preloaded). *Fix: an `<Image>` primitive enforcing dimensions + lazy default. 3 h.*

**M2 — Root `/:username` catch-all is expensive.** `App.tsx:67` routes every unmatched single-segment URL to `BusinessDetail` — a 274 kB chunk. A typo like `/pricng` downloads it before rendering NotFound. *Fix: lightweight resolver route that checks existence before loading the heavy chunk. 3 h.*

**M3 — No `focus-visible` anywhere.** 0 uses of `focus-visible:` against 293 `focus:ring`. Focus rings fire on mouse click, so they read as visual noise and get removed — the usual path to inaccessible focus states. *Fix: `focus-visible` in the Button primitive. Folds into H1.*

**M4 — Five god components.** `BusinessDetail.tsx` 96 KB, `AdminDashboard.tsx` 84 KB, `studio/DesignStudio.tsx` 82 KB, `CreativeDirectorStudio.tsx` 78 KB, `BusinessContentManager.tsx` 63 KB. Untestable at unit level, unreviewable in a PR, and guaranteed to cause merge conflicts once more than one person works here. Note the contrast with `src/lib/` — pure, small, 412 tests. The discipline exists; it just stops at the component boundary. *Fix: extract per-tab/per-section components and move logic to `lib/`. 1 week.*

**M5 — No data-fetching layer.** Only 6 hooks in a 318-file app, none for data. Supabase queries are inline `useEffect` calls in components (`Studio.tsx`, `Dashboard.tsx`, `AdminDashboard.tsx`, …). No caching, no dedup, no background refetch, no consistent loading/error handling — the same business list refetches on every mount. *Fix: TanStack Query + a `src/api/` layer of typed query hooks. 3 days, and it removes a large amount of duplicated state code.*

**M6 — Name collision on `DesignStudio`.** Two different components share the name: `src/components/DesignStudio.tsx` (8 KB, imported by `BusinessDetail`) and `src/components/studio/DesignStudio.tsx` (84 KB, imported by `DesignStudioHub` and `SocialStudioHub`). *Fix: rename the smaller to reflect its actual role. 30 min.*

**M7 — `/admin` is outside `ProtectedRoute`.** `App.tsx:108` renders `AdminDashboard` unwrapped; gating is a client-side `role !== 'admin'` check at line 421. This is *safe today* — `is_admin()` RLS means an attacker sees an empty shell — and the `?preview` mode is correctly `import.meta.env.DEV`-gated so it compiles out. But it relies on a single client check with no route-level defence. *Fix: wrap in `ProtectedRoute requireRole="admin"`. 30 min.*

**M8 — Studio sidebar overflows on mobile.** Live at 375px: three `div.flex.lg:flex-col.gap-1` elements measure 410–435px, overflowing their container. *Fix: proper mobile treatment for module nav — a bottom sheet or segmented scroller. 4 h.*

**M9 — Avoidable `innerHTML` sink.** `Security.tsx:131` injects `enroll.qr` (Supabase MFA `totp.qr_code`) via `dangerouslySetInnerHTML`. First-party and low risk, but it's the *only* such sink in the app — closing it gets you to zero. *Fix: render as `<img src={dataUri}>`. 30 min.*

**M10 — Upload validation is client-side only.** Size caps are enforced (5 MB images, 50 MB video, 10 MB documents) and `accept` attributes are set, but `accept` is advisory and there is no MIME or magic-byte verification server-side. *Fix: validate content type in a storage trigger or edge function. 4 h.*

**M11 — 18 roadmap items advertised in-product.** `Studio.tsx` renders `ROADMAP` (10 items) and `ROADMAP_PLANNED` (8 items) including Booking Manager, Order Manager, Customer CRM and Payment Center. Bookings and enquiries *are* already manageable in `/dashboard`, so these read as duplicate promises of things that partly exist. *Fix: trim to 3–4 genuinely upcoming items with dates; remove any whose capability already ships elsewhere. 2 h.*

**M12 — Two unlabelled `<nav>` landmarks.** Screen readers announce two identical "navigation" regions. *Fix: `aria-label` on each. 10 min.*

---

## Low Issues

- **L1** — `caniuse-lite` outdated; build warns on every run. `npx update-browserslist-db@latest`. 5 min.
- **L2** — `hello-world` edge function is still deployed. Remove. 5 min.
- **L3** — `dist/` and `dev-server.log`/`dev-server.err.log` are committed in the working tree. Add to `.gitignore`. 10 min.
- **L4** — `purify.es` (28.91 kB) ships via a transitive dependency with no first-party `DOMPurify` usage. Harmless, but confirm it's needed once M9 lands.

---

## Recommended Improvements — Prioritised

Format: **Problem → Reason → Solution → Business impact → Effort → Priority**

### 1. Instrument everything before launch
**Problem:** no analytics, no error monitoring. **Reason:** your own five-metric PR rule is unenforceable, and production failures are invisible. **Solution:** Sentry + PostHog; instrument Discoverability, Speed (web-vitals), Trust, Growth, Revenue as first-class events; add both to CSP. **Impact:** converts every later decision from opinion to evidence; catches C3-class bugs in hours instead of never. **Effort:** 1 day. **Priority: P0.**

### 2. Make the directory indexable and shareable
**Problem:** SEO on 2/26 pages; SVG OG image. **Reason:** organic discovery *is* the product; WhatsApp sharing is the viral loop. **Solution:** `applySeo()` everywhere + `LocalBusiness` JSON-LD on profiles + 1200×630 PNG + prerender the public surface. **Impact:** the only path to non-paid acquisition; restores link-preview CTR. **Effort:** 2 days. **Priority: P0.**

### 3. Close the three security defects
**Problem:** C5 push-token policy, H6 client-side Pexels key, H9 unmetered anonymous writes. **Reason:** one is a live write vulnerability; one is a leaked credential; one is an abuse vector aimed at merchant inboxes. **Solution:** as specified in each finding. **Impact:** prevents a trust-destroying incident in week one. **Effort:** 3 days. **Priority: P0.**

### 4. Build the design system
**Problem:** 740 raw buttons, no primitives, no tokens. **Reason:** it is the multiplier on every other UI fix — H2, H3, M1 and M3 all become one-file changes once primitives exist. **Solution:** semantic tokens + `components/ui/` + ESLint enforcement + incremental migration. **Impact:** every future UI change gets cheaper; makes "refined as Apple" achievable rather than aspirational. **Effort:** 2 days foundation, 1 week migration. **Priority: P1.**

### 5. Fix the mobile experience properly
**Problem:** 87% undersized tap targets, no safe-area insets, no bottom navigation, sidebar overflow. **Reason:** the market is Android-phone-first; this is what makes the product feel unfinished in the hand. **Solution:** enforce 44px minimums in primitives; add safe-area padding; introduce a thumb-reachable bottom tab bar for authenticated merchants; redesign Studio module nav for small screens. **Impact:** directly affects perceived quality and mobile conversion. **Effort:** 1 week. **Priority: P1.**

### 6. Unify the business score
**Problem:** 8 competing scores. **Reason:** contradictory numbers destroy trust in all of them and waste the best retention mechanic you have. **Solution:** one NowOpen Business Score with four published pillars. **Impact:** the reason a merchant returns weekly. **Effort:** 3 days. **Priority: P1.**

### 7. Split the Studio bundle
**Problem:** 1,067 kB single chunk. **Reason:** African mobile bandwidth is the binding constraint on your primary paid surface. **Solution:** lazy-load per module; dynamic-import export libraries; `manualChunks` for vendor. **Impact:** Studio becomes usable on 3G. **Effort:** 1 day. **Priority: P1.**

### 8. Merge Dashboard and Studio into one merchant workspace
**Problem:** two overlapping merchant surfaces; the flagship has one entry point. **Reason:** the mission says "manage their business from one platform" and the IA contradicts it. **Solution:** single workspace, one sidebar, Dashboard's operational modules as Studio groups. **Impact:** removes the product's biggest structural confusion. **Effort:** 1 week. **Priority: P2.**

### 9. Introduce a data layer
**Problem:** inline `useEffect` Supabase calls, no caching. **Reason:** duplicated loading/error code, refetch storms, and it blocks any real offline story. **Solution:** TanStack Query + typed `src/api/` hooks. **Impact:** faster perceived performance, much less state code. **Effort:** 3 days. **Priority: P2.**

### 10. Break up the god components
**Problem:** five files of 63–96 KB. **Reason:** blocks parallel work and code review; the discipline already present in `lib/` stops at the component layer. **Solution:** extract per-section components; push logic into tested `lib/` modules. **Impact:** team can grow past one engineer per area. **Effort:** 1–2 weeks. **Priority: P2.**

---

## Code Improvements

**Architecture**
- `src/lib/` is the model to extend — pure functions, no React, 412 tests. Keep pushing logic there.
- Add `src/api/` (typed Supabase access) and `src/components/ui/` (primitives). These are the two missing layers.
- Consider a feature-folder structure for Studio: `src/features/studio/<module>/` co-locating component, logic, and tests.

**Reuse opportunities identified**
- `healthLabel` / `scoreLabel` / `analyticsScoreLabel` → one formatter.
- Six scoring functions → one `businessScore.ts`.
- 15 hand-rolled modals → one `<Dialog>`.
- 740 buttons → one `<Button>`.
- 87 `<img>` → one `<Image>` enforcing dimensions and lazy loading.
- Repeated `supabase.from('businesses').select('*').eq('user_id', …)` in Studio/Dashboard/Profile → one `useMyBusinesses()` hook.

**Hooks to add**
`useMyBusinesses`, `useBusiness(id)`, `useBookings`, `useEnquiries`, `useFocusTrap`, `useMediaQuery`, `useSafeArea`.

**Naming**
- Resolve the `DesignStudio` collision (M6).
- `HealthDashboard` vs `BrandHealthPanel` vs `GrowthScorePanel` vs `DailyGrowthDashboard` — names don't communicate scope. Rename alongside H8.

**Testing**
- Excellent unit coverage of `lib/` (412 tests). Two real gaps:
  - **No component interaction tests** beyond two smoke tests. Add React Testing Library coverage for the revenue-path modals (Payment, Booking, Cart) and auth flows.
  - **No E2E tests.** Add Playwright for: signup → create business → publish profile → receive booking; and checkout.
- Add an automated a11y gate (`axe-core` in Playwright) — it would have caught H2, H3 and H10.
- Add the CSP-vs-`fetch()`-hosts CI check from C3.

**Documentation**
- `LAUNCH.md` and `.env.example` are genuinely strong — better than most funded startups. Keep them current.
- Missing: a `CONTRIBUTING.md` with the branch model (once C1 is resolved) and the five-metric PR rule as a checklist template.

---

## Launch Checklist

### Blocking — must be done before public launch

**Process**
- [ ] Designate the canonical repo copy; archive the other 20 (C1)
- [ ] Real git history, branch protection, PR template encoding the five-metric rule

**Correctness in production**
- [ ] **Fix the 14 typecheck errors and 1 lint error, then gate CI on both** — `npm run typecheck && npm run lint`, never piped into `tee`/`tail` (a pipeline returns the last command's exit code, which is how these were missed)
- [ ] Add a typecheck step to the build script so `vite build` can't ship type errors
- [ ] Add `api.pexels.com`, `open.er-api.com` to CSP `connect-src`; `videos.pexels.com` to `media-src` (C3)
- [ ] CI check: `fetch()` hosts vs CSP allowlist
- [ ] Apply `supabase/migrations/scripts/sql/apply_all_migrations.sql` to the live project — repo migrations are known to have drifted from live schema
- [ ] Redeploy all edge functions; verify `verify-payment` + `paystack-webhook` against a real test charge
- [ ] Rotate the Anthropic API key for the concierge function (flagged in `LAUNCH.md`)

**Security**
- [x] Scope the `device_push_tokens` UPDATE policy (C5) — migration `20260808000000_device_push_tokens_scoped_update.sql` drops the anonymous UPDATE; updates are now `authenticated` + `user_id = auth.uid()`. Anonymous devices register by INSERT (token is UNIQUE). Mobile clients wanting an idempotent anonymous upsert should use an edge function with the service role.
- [x] Move the Pexels key behind an edge function (H6) — the `stock-footage` proxy exists and `PEXELS_API_KEY` is a server secret; the last client read of `VITE_PEXELS_API_KEY` was removed (`stockFootage.ts`, `vite-env.d.ts`, `.env.example`). The direct-from-browser path remains only for an owner-pasted localStorage key, which is theirs and never leaves their machine.
- [ ] Rate-limit + Turnstile the 8 anonymous-insert tables (H9) — DEFERRED: the correct fix is an edge function + revoking direct anon insert, but the mobile app also inserts to these tables directly, so this needs mobile-app coordination (and a Turnstile decision) before anything is revoked; a web-only partial rewrite would create inconsistent behavior. Revisit as a coordinated cross-app pass.
- [x] Wrap `/admin` in `ProtectedRoute` (M7) — new `src/components/AdminRoute.tsx` gates `/admin` and `/admin-creator` at the route level (signed-in + admin role, or the dev-only `?preview` mode); the pages keep their own role check and RLS backs every read.
- [ ] Server-side MIME validation on uploads (M10)
- [ ] Confirm `.env`/`.env.local` are untracked (verified clean today — re-verify before first push)

**Observability**
- [ ] Sentry with source maps and release tagging (C4)
- [ ] Product analytics with the five metrics instrumented (C4)
- [ ] Web Vitals reporting from real sessions
- [ ] Uptime monitoring on the app and each edge function

**Discovery & growth**
- [ ] `applySeo()` on all 26 routes with per-entity metadata (C2)
- [ ] `LocalBusiness` JSON-LD on every business profile
- [ ] 1200×630 PNG OG image; update `og:image` and `twitter:image` (C2)
- [ ] Verify link previews render on WhatsApp, Facebook, X, LinkedIn
- [ ] Prerender or SSR the public surface
- [ ] `sitemap.xml` including business profiles; `robots.txt`; Search Console + Bing verification

**Accessibility**
- [ ] Focus trap + Escape on all 15 dialogs (H2)
- [ ] Skip link (H10)
- [ ] 44×44 minimum tap targets (H3)
- [ ] `focus-visible` on all interactive elements (M3)
- [ ] `aria-label` on both `<nav>` landmarks (M12)
- [ ] Automated axe pass in CI, zero criticals
- [ ] Manual screen-reader pass on signup, profile creation, checkout

**Mobile**
- [ ] Safe-area insets throughout (H4)
- [ ] Studio module nav redesigned for small screens (M8)
- [ ] Real-device testing on low-end Android (the modal target, not iPhone)

**Performance**
- [ ] Studio split per module; shell under 150 kB (H5)
- [ ] `index` chunk under 250 kB
- [ ] Lazy loading + explicit dimensions on all images (M1)
- [ ] `fetchpriority="high"` on the hero LCP element
- [ ] Lighthouse ≥ 90 on Home, Businesses, BusinessDetail — throttled to 3G

**Content & legal**
- [ ] Terms, Privacy, Cookie policy reviewed by counsel for NG/KE/ZA/GH
- [ ] GDPR/NDPR data-export and deletion paths verified end to end
- [ ] Remove or date the 18 roadmap placeholders (M11)
- [ ] Confirm no `example.com` demo data reachable from production navigation

**Commercial**
- [ ] Live Paystack keys; test card, bank transfer and mobile money in each launch market
- [ ] Verify plan gating server-side (never client-only)
- [ ] Refund and failed-payment paths tested
- [ ] Transactional email deliverability verified (SPF/DKIM/DMARC on the Resend domain)

### Post-launch, first 90 days
- [ ] Design system rollout complete; ESLint ban on raw `<button>` (H1)
- [ ] Unified Business Score shipped (H8)
- [ ] Dashboard/Studio merged into one workspace (H7)
- [ ] TanStack Query data layer (M5)
- [ ] God components decomposed (M4)
- [ ] Playwright E2E on the revenue path
- [ ] Offline/poor-network strategy (service worker, optimistic writes)

---

## Founder Mindset — Straight Answers

**Would users recommend this?** The 31 industry-specific profile experiences are genuinely differentiated — a restaurant gets a menu, a realtor gets a portal with a mortgage calculator. No competitor in this market does that. But recommendation requires sharing, and sharing currently produces a bare grey WhatsApp link. Fix C2 and the answer becomes yes.

**Would businesses pay?** For Studio, yes — it is a real marketing department, not a mock-up. Two things block willingness to pay: the flagship is buried behind one link (H7), and five contradictory scores undermine confidence in the product's judgement (H8).

**Would investors be impressed?** By the feature surface and the 412-test discipline, yes. They will ask for retention and acquisition numbers, and you currently cannot produce either (C4). Instrument before the first serious conversation.

**Would designers admire it?** Not yet. It looks consistent, but 18 colour families and 740 hand-styled buttons mean the consistency is manual and will decay. Designers notice the absence of a system immediately.

**Would engineers admire the architecture?** `src/lib/` — yes, sincerely. Pure, tested, well-commented. `src/components/` — no: five files over 60 KB and no data layer. The good instincts are already in this codebase; they just haven't reached the component boundary.

**Would Apple approve this experience?** No — 87% of tap targets are below the HIG minimum and edge-to-edge rendering is enabled without safe-area handling. Both are mechanical fixes, not redesigns.

**Would it still feel modern in five years?** The config-driven industry system will age well — adding an industry is a data change. The styling layer will not survive one rebrand without the token work in H1.

---

## The Standing Rule

> Every pull request must improve at least one of: **Discoverability, Speed, Trust, Business Growth, Revenue.**

This is the right rule, and it should be adopted. One prerequisite: **it cannot be enforced until C4 ships.** A rule that requires measurable improvement against five metrics, none of which are instrumented, becomes a rule enforced by assertion — which is worse than no rule, because it manufactures false confidence.

Sequence it as: instrument the five metrics (C4) → add the PR template with the five checkboxes and a required "evidence" field → then enforce.

Suggested first application: each of C1–C5 maps cleanly onto the rule. C2 is Discoverability. C3 is Trust. C4 is all five (it is the enabling condition). C5 is Trust. H5 is Speed. H8 is Business Growth. That is not a coincidence — it is a sign the rule is well chosen.
