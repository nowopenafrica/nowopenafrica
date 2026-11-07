# Instagram Manual Business Extractor

**Admin → Business Intelligence → Manual Extract → Instagram**

Status as of 2026-10-08: **built, deployed, and not configured.** No Meta
credentials exist on this project, so the screen renders its setup requirements
and makes no network call. That is the honest state, and it is the state the
code is designed to render — there is no sample profile anywhere in it.

---

## 1. The capability, stated plainly

An operator pastes **one Instagram handle they already have** and the platform
reads that account through Meta's official `business_discovery` endpoint.

**It cannot search Instagram.** Verified against Meta's documentation on
2026-10-06: `business_discovery` takes a *username* and returns that account's
public profile. There is no authorised Graph endpoint that searches Instagram
by location, category or keyword. The hashtag edge returns *media* from the
last 24 hours, not business profiles.

So a request to "find 500 fashion businesses in Lagos on Instagram" cannot be
satisfied by any permitted API. The only routes are scraping or unofficial
endpoints, and this platform does neither. The registry records the
consequence: `radar_sources.instagram_graph` carries
`bulk_extraction = 'prohibited'`.

In practice this is a lookup for a handle taken from a business card, a
shopfront sign or a website footer — an **enrichment** source, never a
discovery one.

## 2. The architecture it was added to (audited first, not assumed)

`ManualExtractTab.tsx` already ran a complete pipeline:

```
operator pastes a URL
  → extract-page (edge fn, staff JWT)
  → parsed fields + per-field evidence
  → duplicate check on (source_key, source_record_id)
  → stage into radar_candidates  [source_key: 'manual_extraction']
  → Review queue decides
  → approval creates the business
```

Instagram was therefore added as a **second input to that same pipeline**, not
as a second extractor. There remains one staging path, one duplicate check and
one place a business is created. A test pins this: the Instagram panel contains
no `radar_candidates` insert and no `businesses` insert of its own.

## 3. Data flow

```
InstagramExtract.tsx
  supabase.functions.invoke('extract-instagram', { handle })
      │  (user's JWT; CORS allows x-application-name — see §7)
      ▼
supabase/functions/extract-instagram/index.ts
  1. auth.getUser()            → 401 if signed out
  2. users.role ∈ STAFF        → 403 otherwise
  3. normalizeHandle(raw)      → 200 { stage: 'handle' } if not a handle
  4. lookupInstagramBusiness() → _shared/discovery/instagram.ts
  5. duplicate hint: businesses.social_links ILIKE '%instagram.com/<handle>%'
      ▼
  { ok, handle, url, profile, evidence[], duplicate }
      ▼
ManualExtractTab staging → radar_candidates → Review queue
```

Every failure is returned with **its own kind**, because each needs a different
thing from the operator:

| `reason` | What it means | What to do |
|---|---|---|
| `not_configured` | No Meta credentials | Setup task — §8 |
| `not_found` | Personal account, or no such handle | Nothing; personal accounts are never readable |
| `rate_limited` | App's Graph limit reached | Try later |
| `auth` | Token rejected or expired | Reissue the page token |

A single generic error would send somebody to fix the wrong thing.

## 4. Files

**New**
- `supabase/functions/extract-instagram/index.ts` — the endpoint
- `src/components/admin/businessIntelligence/InstagramExtract.tsx` — the panel
- `src/test/instagramExtract.test.ts` — 11 wiring/honesty assertions
- *(earlier)* `supabase/functions/_shared/discovery/instagram.ts` + its 16-test suite

**Modified**
- `src/components/admin/businessIntelligence/ManualExtractTab.tsx` — Website /
  Instagram source picker
- `supabase/config.toml` — `[functions.extract-instagram] verify_jwt = true`,
  declared explicitly rather than left to the default

**Migration**
- `20261018010000_instagram_source.sql` — registers `instagram_graph` in
  `radar_sources`: `source_type = 'commercial_api'`,
  `compliance_status = 'api_required'`, `active = false`,
  `bulk_extraction = 'prohibited'`, `image_reuse_allowed = 'prohibited'`.

No new tables. Candidates land in `radar_candidates`, which already exists.

## 5. Security model

- **Authentication**: the caller's JWT, verified by the platform
  (`verify_jwt = true`) *and* re-read inside the function.
- **Authorisation**: `users.role ∈ {admin, editor, business_curator}`, read with
  the service key so the caller cannot influence the answer.
- **Not** the automation secret. `AUTOMATION_SECRET` unlocks unattended work;
  it must never be the key to a tool reachable from a browser. A test asserts
  it appears nowhere in this function.
- **Injection**: `normalizeHandle()` is the guard, not an afterthought. The
  handle is interpolated into a Graph **field expression** —
  `business_discovery.username(X){...}` — where URL-encoding does not help, so
  the `[A-Za-z0-9._]{1,30}` character set *is* the defence. Tested against
  `bad){evil}`, `a&b=c`, `a/b`, spaces and over-length input.
- **Secrets** are read inside the edge function only. Nothing Meta-related is
  exposed to the browser, logged, or returned in a response.
- **SSRF**: there is no caller-supplied URL. The only host contacted is
  `graph.facebook.com`, and the handle cannot escape the field expression.

## 6. What it refuses to treat as a fact

- **The profile picture** is displayed for visual checking and **never copied
  onto a listing**. It is Meta Platform Data, the URL expires, and
  `image_reuse_allowed = 'prohibited'` records that. It is not offered as
  evidence.
- **Follower and media counts** are shown as *activity signals*, labelled on
  screen as "Not recorded as facts about the business". They are not evidence.
- **Absent fields stay null** — never a guess, never an empty string.
- Only `name`, `website` and `description` are offered as evidence, each with a
  confidence and a source URL, so the Review queue can show provenance and a
  later correction knows what it is overriding.

## 7. One measured bug, recorded so it is not repeated

The first deployment appeared completely dead: clicking the button did nothing,
and the function logged nothing. The cause was CORS —
`Access-Control-Allow-Headers` omitted `x-application-name`, which supabase-js
always sends, so the **preflight failed and the request never left the
browser**. The header list now mirrors `extract-page` verbatim, and a test pins
it.

## 8. Provider configuration required

Nothing works until all of the following exist. None of it does today.

1. `META_PAGE_ACCESS_TOKEN` — Supabase edge secret
2. `INSTAGRAM_BUSINESS_ACCOUNT_ID` — Supabase edge secret
3. An Instagram **Business or Creator** account linked to a Facebook Page
4. Meta **App Review** for `instagram_basic`, `instagram_manage_insights` and
   `pages_read_engagement`

Step 4 is the long one — weeks, not hours. Note also that `social-auth` has
expected `META_APP_ID` / `META_APP_SECRET` for some time and they have never
been set, so there is no existing Meta app to inherit.

Once the secrets exist, set `radar_sources.active = true` for `instagram_graph`.
`bulk_extraction` stays `prohibited` permanently — that is Meta's line, and it
is what separates enrichment from scraping.

## 9. Known limitations

- **No search, ever.** §1. If a future brief asks for discovery by city or
  category, the answer is that no permitted API provides it.
- Personal accounts are unreadable, and most handles on a directory listing
  belong to personal accounts. `not_found` is a normal outcome here, not a
  fault.
- The duplicate check in this endpoint matches only the handle inside
  `social_links`; the fuller check runs in the staging path.
- `businesses.social_links` is matched with `ILIKE`, so a handle recorded in an
  unusual shape can be missed. The Review queue is the backstop.
