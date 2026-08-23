# NowOpen Africa — Platform Review

**Date:** 2026-08-16 · **Scope:** web app (`src/`, `supabase/`) · **Method:** measured, not impressions
**Previous audit:** `PRODUCT-AUDIT.md` — 5.4 / 10

Every number below came from a command run against this working copy
(`NowOpen Africa - (OpenCode) - Claude - edit`). Where a claim could not be
measured, it says so.

---

## Verdict

**Overall: 6.2 / 10** — up from 5.4.

The platform has moved from "impressive demo with production-blocking gaps" to
"credible product with a measurement blind spot". The improvement is real and
concentrated in exactly the places the last audit called out: SEO went from 2 of
26 routes to **29 of 29**, the test suite tripled to **1,381 tests**, typecheck
is clean and wired into the build, and the AI assistant actually answers from
live data instead of failing silently.

What holds it at 6 rather than 8 is not polish. It is three things:

1. **Nothing is observed.** No analytics, no error monitoring. You cannot tell
   whether any of this works for real users.
2. **The live database does not match the repo.** All 68 migrations report
   unapplied. Features ship into a schema nobody can describe.
3. **Accessibility is still the weakest dimension** — 27 images with no alt
   text, 32 of 980 buttons meeting the touch-target standard the project set
   for itself.

---

## Scale

| Measure | Value |
|---|--:|
| TypeScript/TSX files | 508 |
| Lines of code | 94,523 |
| Routes | 32 |
| Test files / tests | 130 / 1,381 |
| `src/lib` modules with tests | 88 of 107 (82%) |
| Lint | 0 errors, 333 warnings |
| Shipped JS (all chunks) | 3.4 MB |

---

## Scores

| Dimension | Score | Movement | Evidence |
|---|:--:|:--:|---|
| **Content & honesty** | 8 | ▲ | The strongest dimension. Degraded states name their real cause ("The `site_settings` table is missing", "the assistant is handling a lot of requests") instead of a generic failure. No fabricated metrics anywhere — views, response time and repeat-customer rate are absent rather than invented, because no analytics layer exists to source them. |
| **Testing** | 8 | ▲▲ | 1,381 tests across 130 files, up from 412. 82% of `src/lib` covered. Tests assert *behaviour* (motion settles exactly at `settleTime`, `hexAlpha` never emits `rgba(NaN)`), not just shape. |
| **Understandability** | 7 | ▲ | Comments explain *why*, not what — the reason a value is 44px, the reason `is_admin()` must be `SECURITY DEFINER`. A new engineer can learn the system's scars from the code. Held back by four god components (2,116 / 1,933 / ~1,600 / 1,663 lines). |
| **Trust & credibility** | 7 | ▲ | Trust panel shows unverified items rather than hiding them; opening hours parse real data or say "not confirmed". Verification is admin-only. |
| **Security** | 6 | ▼ | Strong design — 100+ RLS policies, `SECURITY DEFINER` admin helpers, role-escalation guards, server-side payment verification, keys held as edge-function secrets. Marked down because **`device_push_tokens` still allows anonymous `UPDATE` with `USING (true)`** (flagged as C5 in the last audit, unfixed) and because the migration ledger drift means the live policy set is unverifiable. |
| **Design** | 6 | ▲ | Consistent-looking, full dark mode, and the new data-driven template system is a genuine architectural win. But **two competing accent families** (`blue-600` × 487, `purple-600` × 436), **87 distinct hardcoded hex values**, 367 inline `style={{}}` props, and still no token layer in `tailwind.config.js`. |
| **UI** | 6 | – | Dense but legible; dark mode is thorough. Admin surfaces carry a lot of chrome per decision. |
| **UX** | 6 | – | Flows work and the new role/permission model is coherent. Multiple overlapping "how am I doing" scores still compete for the same attention. |
| **Functionality** | 6 | ▲ | Breadth is real: assistant, generation, footage, studios, invoicing, bookings. Marked at 6 because several paths are wired only partway — a Motion Studio template animates in preview but **exports with the old renderer**; Brand Card, Landing Pages and admin studios still carry their own layout code. |
| **Growth & discovery** | 6 | ▲▲ | SEO now on 29/29 pages (was 2/26), OG images, sitemap, JSON-LD. The loop is finally *findable*. It is still **unmeasured**, so no growth claim can be validated. |
| **Accessibility** | 5 | ▲ | Improved: 89 `focus-visible` rings (was 0), 309 aria attributes, 44 roles. Still weak: **27 of 101 images have no `alt`**, **32 of 980 buttons use `min-h-[44px]`**, **no skip link**, 7 `sr-only` helpers, `prefers-reduced-motion` honoured in only 3 places. |
| **Performance** | 5 | – | 3.4 MB of JS. `ContentFactory` alone is **821 kB** (256 kB gzipped); `index` 527 kB; `AdminCreator` 438 kB. Two chunks exceed Vite's 500 kB warning. **10 of 101 images lazy-load; 1 declares dimensions**, so layout shift is near-guaranteed on slow connections. |
| **Observability** | 2 | – | No analytics table, no error monitoring, no Sentry. Nothing in production reports anything. This is the single biggest gap. |
| **Operability** | 3 | – | `supabase migration list` reports **all 68 migrations unapplied** while the schema demonstrably exists. Deploys are therefore guesswork, and this has already caused two visible failures this month. |

---

## What genuinely improved since the last audit

Worth stating plainly, because a review that only lists faults is not useful:

- **SEO: 2/26 → 29/29 routes.** The largest single fix. A discovery platform
  that could not be discovered now can be.
- **Tests: 412 → 1,381.** And typecheck now runs in `build`, so the class of
  "reported clean when it wasn't" error is structurally prevented.
- **`focus-visible`: 0 → 89.** Keyboard users can now see where they are.
- **A working AI assistant**, on an open-weight model, with honest degradation
  when the provider is unavailable — and a `?probe=1` health endpoint, because a
  present-but-dead key was previously invisible.
- **Templates became data.** One definition renders a still, a motion frame and
  (soon) a video export, replacing 30 hardcoded JSX layouts that no other tool
  could read.
- **A real permission model** — `editor` role, one tested module, RLS as the
  actual boundary rather than hidden buttons.
- **Zero `console.log`, zero `TODO`/`FIXME`** in 94k lines. Unusual discipline.

---

## Priority 1 — do these before any new feature

### 1. Add error monitoring and product analytics (Observability 2 → 7)

You are flying blind. Two of this month's bugs — a dead API key and a crashed
Studio tab — were found by a human clicking, not by a system reporting.

- Sentry (or equivalent) in `src/main.tsx` and every edge function.
- A single `analytics_events` table: `(id, name, props jsonb, user_id, created_at)`,
  public INSERT, admin SELECT. Instrument six events only to start: signup,
  business created, listing viewed, search performed, studio export, booking.
- That table is also the honest source for the business-facing stats the Trust
  Panel currently — correctly — refuses to invent.

### 2. Reconcile the migration ledger (Operability 3 → 7)

All 68 migrations report unapplied against a database that clearly has the
schema. Until that is fixed, every schema change is a manual SQL paste and every
"it doesn't work" costs an hour of diagnosis.

- Dump the live schema, diff against `supabase/migrations`, and write down where
  they disagree **before** touching anything.
- Then `supabase migration repair --status applied` for what is genuinely
  present, so `db push` becomes usable again.

### 3. Close the `device_push_tokens` hole (Security 6 → 8)

```sql
-- Anyone can currently rewrite ANY row:
CREATE POLICY "Anyone can update a push token" ON device_push_tokens
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
```

An attacker can repoint every device token at themselves, or wipe the send list.
Scope `USING` to the row's own token value or `user_id`. Flagged in the previous
audit and still open.

---

## Priority 2 — the credibility gaps

### 4. Accessibility: the three cheapest high-value fixes

- **27 images with no `alt`.** A one-pass fix; decorative ones take `alt=""`.
- **A skip link.** Currently zero. Keyboard users traverse the whole nav on
  every page.
- **Touch targets.** 32 of 980 buttons meet the 44px standard *this project set
  for itself*. Note the root font-size drops to 14px on phones, so
  rem-based padding can never reach 44px — the fix must be `min-h-[44px]` in
  px. The `PasswordToggle` component is the pattern to copy.

### 5. Performance: split `ContentFactory` and lazy the images

- `ContentFactory` at **821 kB** is bigger than most entire apps. Split it by
  tab with `React.lazy`.
- `loading="lazy"` on the 91 images that lack it, and `width`/`height` on the
  100 that lack dimensions. On the mobile data this audience uses, that is the
  single most-felt improvement available.

### 6. A design token layer (Design 6 → 8)

Two accent colours (`blue-600` and `purple-600`, nearly a thousand usages
between them) means the product has no single brand colour. Pick one, define
`brand`, `surface`, `ink`, `muted` in `tailwind.config.js`, and migrate. The 87
distinct hex values and 367 inline styles collapse from there.

---

## Priority 3 — finish what is started

7. **Wire `renderVideo` to the template painter.** A template animates in Motion
   Studio's preview but exports with the old renderer. The painter exists and is
   tested; this is small and closes an obvious inconsistency.
8. **Migrate Brand Card, Landing Pages and the admin studios** onto the shared
   template catalogue, retiring their private layout code.
9. **Break up the god components** — 2,116 / 1,933 / 1,663 / ~1,600 lines. These
   are where bugs hide; the recursion bug this week lived in one of them.
10. **Reduce the 316 `no-explicit-any` warnings.** Not urgent, but each one is a
    place the type system stopped helping.

---

## Honest limitations of this review

- **I could not evaluate the product as a signed-in business owner.** The
  browser session available had no authenticated account, so Creative Studio's
  own picker, the owner dashboard and the booking flows were never rendered.
  Their scores lean on code reading, not use.
- **No real-device or screen-reader testing.** Accessibility numbers are
  static-analysis counts, which detect missing attributes but cannot judge
  whether a flow is actually usable with a screen reader.
- **No Lighthouse run.** Performance figures are build output and image-attribute
  counts, not measured field or lab metrics.
- **The mobile app was out of scope** for this pass.

---

## The standing rule, applied

> Every pull request must improve Discoverability, Speed, Trust, Business Growth
> or Revenue.

Measured against it: recent work has served **Trust** heavily (honest degradation,
verification, permissions) and **Discoverability** well (SEO 29/29). **Speed** has
gone backwards — the bundle grew. **Business Growth** and **Revenue** cannot be
assessed at all, because nothing is measured. That asymmetry is the argument for
making Priority 1 the next thing you do.
