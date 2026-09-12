# NOWOPEN IQ™ — BASELINE AUDIT
**Date:** 2026-09-08 · **Scope:** the intelligence layer mandate (§1–§50)
**Method:** every figure below is a live query against production (`wvayqqfqqocwjripugnb`) or a read of the current working tree, taken today. Per §1, **no previous audit finding was assumed** — several turned out to have changed, and those are called out.

---

## THE HEADLINE

**The platform already has the right North Star and the wrong data to pursue it.**

Three measurements decide everything else in this brief:

### 1 · 99.4% of the event table is noise

```
event                        count   sessions   per-session
signin                      43,354         64        677.4
business_viewed                119         62          1.9
client_error                    71         25          2.8
search_performed                18          4          4.5
business_contact_clicked         5          4          1.2
… 8 more event types           ~29
                            ──────
total                       43,596
```

**43,354 of 43,596 rows are `signin`.** Real behavioural events: **242.**

§6 warns against exactly this — "never allow five `SIGNED_IN` to be interpreted as five independent user behaviours". The measured reality is **677 per session**, not five. Any intelligence engine pointed at this table today would learn almost nothing except that people sign in constantly.

### 2 · The corruption source is fixed; the corrupted history is not

```
before 2026-09-07T18:00Z :  43,354 signins / 64 sessions = 677.4 each
after                    :       0 signins /  0 sessions
```

**Zero `signin` events since the Phase-1 emitter fix deployed.** That fix is verified working against real data, not assumed. What remains is a historical purge — written and pending as item 5c in `audits/NOWOPEN_APPLY_RUNBOOK.md`, blocked because this session cannot write to production.

So §6's first requirement is **half done**: new data is clean, old data is not, and the cleanup is a single `DELETE` nobody has run.

### 3 · Anyone can forge events — and that becomes dangerous the moment IQ learns

```sql
-- analytics_events
CHECK constraints : NONE
INSERT policy     : analytics_insert  roles={anon,authenticated}  WITH CHECK (true)
```

The public anon key can insert **unlimited rows with any `name`, any `business_id`, any `user_id`, any `props`.** There is no validation, no rate limit, no bot filter, no server-side attribution.

Today the stakes are low: the table is a log that nothing acts on automatically. **This brief changes that.** Once IQ ranks businesses on engagement (§10), detects demand from searches (§9), triggers business acquisition (§22) and allocates advertising (§15), that table becomes an attack surface with obvious commercial motive — manufacture demand for your category, or fake engagement on your own listing.

This is the most consequential security finding in the audit, and it is a §45 item ("event insertion permissions") and a §26 item ("fake engagement"). **It must be closed before, not after, anything learns from this table.**

---

## WHAT ALREADY EXISTS — **READY TO EXTEND**

Per §1, functioning architecture is not to be rewritten. A meaningful amount of this brief is already built.

### §38's North Star is already the design — **FIXED**

`src/lib/northStar.ts` (351 lines) exports `connectionKind`, `isConnection`, `weeklyConnections`, `weekOnWeek`, `activationFunnel`, `verdict`, `supplyGaps`.

The platform **already measures successful connections rather than page views**, which §38 asks for and which most platforms never do. This is the single best thing to build on.

### §9's zero-result engine exists — **PARTIALLY FIXED**

`supplyGaps()` groups zero-result searches by term and place, ranked by *distinct sessions*, surfaced in `ActivationPanel.tsx`. It is deliberately honest: events with no `results` key are **skipped, not counted as zero** — it will not invent a gap.

What is missing versus §9: `result_quality`, `abandonment`, `alternative_action`, and the 74%-style quality framing. It knows *nobody found anything*; it does not yet know *people found things and they were bad*.

### §32's data-quality score exists — **FIXED (in the database)**

`businesses.listing_score` is a **generated column**, 0–100, computed from phone/WhatsApp/email presence (25), opening hours (20), address, and more. `MIN_USEFUL_SCORE = 40` already gates Discover.

Being generated, it cannot drift from the row it describes. §32's "do not use this as a fake customer rating" is already respected — it is never rendered as a rating.

### §12/§13 business insights exist — **PARTIALLY FIXED**

`src/lib/businessInsights.ts` (162 lines) answers "is NowOpen helping my business?" from real analytics under the existing `analytics_owner_read` RLS policy, with honesty rules already built in: `MIN_FOR_TREND = 10`, distinct-session counting, and the owner's own visits excluded.

Missing versus §12: the composite Business Growth Score and the measured/estimated/inferred/unavailable distinction. Missing versus §13: the coach's recommended actions.

### §21/§24 market signals exist — **PARTIALLY FIXED**

`trendRadar.ts` exports `marketForLocation` and `trendRadarFor`. `ActivationPanel.tsx` surfaces gaps. No demand/supply/gap map per §21.

### Kill switches exist; experiments do not — **MISSING** (§16)

`featureFlags.ts` (111 lines) is a **kill-switch** system — `toFlagMap`, `isEnabled`, `KILL`, `CONSEQUENCE` — with an explicit comment that hiding a button is not a security control. It has no notion of `experiment_id`, variant, assignment, population, success metric, minimum sample or confidence threshold. §16 is genuinely unbuilt.

### There is no LLM in the product — **and per §29 that is correct**

Verified by reading the source: `aiCopy.ts` opens with *"No model behind this — a hand-written bank of on-brand copy"*. `copywriter.ts` and `dailyBrief.ts` are likewise deterministic. Only `pollinations.ts` (image generation) touches an external service, and it is guarded so importing it never needs a key.

§29 says start with "SQL + rules + statistical analysis". **The platform is already exactly there**, which means Phase 1 requires no new model infrastructure — only better data and better aggregation. §30's cost-control concern is currently moot and should stay that way.

---

## THE EVENT CONTRACT — **PARTIALLY FIXED** (§4)

Live schema:

```
analytics_events(id bigint, name text, props jsonb, user_id uuid,
                 business_id uuid, session_id text, path text, created_at timestamptz)
```

Against §4's twenty required fields:

| §4 field | Present | Note |
| --- | --- | --- |
| `event_id` | ~ | `id` is a bigint sequence — **not an idempotency key** |
| `event_name` | ✓ | `name` |
| `event_version` | ✗ | no versioning; a changed event silently pollutes its own history |
| `timestamp` | ✓ | `created_at` |
| `session_id` | ✓ | |
| `anonymous_user_id` | ✗ | `session_id` conflates session and anonymous identity |
| `account_id` | ✓ | `user_id` |
| `business_id` | ✓ | |
| `object_type` / `object_id` | ✗ | everything is flattened into `props` |
| `page` | ✓ | `path` |
| `route` | ✗ | `path` conflates URL and route pattern |
| `category_id` / `location_id` | ✗ | the two dimensions §21's demand map needs most |
| `source` | ✗ | |
| `device_context` | ✗ | |
| `experiment_id` | ✗ | blocks §16 entirely |
| `properties` | ✓ | `props` |
| `consent_state` | ✗ | blocks §27 |
| `purpose` | ✗ | blocks §27's purpose limitation |

**8 of 20.** The four that block whole sections of this brief are `experiment_id` (§16), `consent_state` and `purpose` (§27), and a real `event_id` for idempotency (§6).

Client side, `src/lib/telemetry.ts` (283 lines) already does more than most: batching with a queue and flush, `sanitizeProps`, `normalizePath`, `sessionId`, and a `shouldReport()` host gate that stops dev writing into production. It has **no** deduplication, no idempotency key, no bot filter, no consent check, and no event-schema validation.

---

## EVENT COVERAGE — **MISSING** (§5)

§5 lists roughly **50** meaningful events. Production has **13 distinct names**, and five of those are effectively unused:

| Present | Missing (examples) |
| --- | --- |
| `signin`, `business_viewed`, `client_error`, `search_performed`, `template_picked`, `campaign_view`, `business_contact_clicked`, `profile_request_started`, `profile_requested`, `create_order_requested`, `create_order_accepted`, `studio_export`, `business_nominated` | `search_started`, `search_result_clicked`, `filter_applied`, `open_now_used`, `whatsapp_clicked`, `phone_clicked`, `direction_requested`, `business_saved`, `offer_viewed`, `offer_claimed`, `booking_started`, `booking_completed`, `checkout_abandoned`, `signup_completed`, `onboarding_completed`, `business_claim_started`, `business_claimed`, `verification_completed`, `profile_completed`, `offer_created`, `creative_published`, `campaign_launched` … |

Note especially: **`business_contacted` is 5 events, ever.** §36's search-quality loop and §37's business-success loop both terminate in contact/booking/order outcomes — and those outcomes are almost entirely uninstrumented. The loops cannot close on data that is not collected.

---

## SEARCH & RECOMMENDATION — **MISSING** (§8, §10)

`src/lib/search.ts` is **70 lines**: `normalize`, `matchScore`, `rankMatches`, `splitMatch`. String matching, no intent.

None of §8 exists: no spelling correction, synonyms, Nigerian terminology, category aliases, semantic matching, location intent or query reformulation. *"where can I fix my iPhone"* resolves to nothing structured.

`src/lib/discover.ts` (403 lines) ranks by `rating` and `created_at`, gated on `listing_score >= 40`. Its own header comment is candid that distance cannot be computed because **`businesses.location` is free text** — there is no usable coordinate ranking today.

Against §10's signal list, present are: profile completeness (`listing_score`), verification, freshness, open status. Absent are: semantic relevance, distance, availability, responsiveness, engagement, conversion quality, user preference, offer relevance. §10's controlled-exploration requirement — so established businesses cannot permanently suppress new ones — has no implementation.

**One dependency worth naming:** `20260907182000_business_search_index.sql` (tsvector + GIN + pg_trgm + a paged `search_businesses()`) is written and **not applied**. §8 and §10 largely wait on it.

---

## PRIVACY — **MISSING** (§27)

No consent state exists anywhere in the schema or the client. No `essential / analytics / personalization / marketing` categories, no user controls to disable personalization, no export, no activity deletion.

Because the platform does not personalize today, nothing is currently *misusing* consent — but §27 is a precondition for §11, not a follow-up to it. Building personalization first and consent second would be the wrong order.

---

## DOCUMENTATION — **MISSING** (§48)

`docs/` contains three files: `SOCIAL-PUBLISHING.md`, `nowopen-create-2.0-audit.md`, `visual-editor-audit.md`.

None of §48's eight deliverables exist: `NOWOPEN_IQ_ARCHITECTURE.md`, `AI_GOVERNANCE.md`, `EVENT_TAXONOMY.md`, `LEARNING_SYSTEM.md`, `EXPERIMENTATION_POLICY.md`, `DATA_RETENTION.md`, `IQ_ROADMAP.md`.

---

## VERDICT BY IQ MODULE (§3)

| Module | Verdict | Evidence |
| --- | --- | --- |
| IQ / DISCOVER | **MISSING** | 70-line string matcher; search index migration unapplied |
| IQ / CUSTOMER | **MISSING** | no journey stitching; 242 real events total |
| IQ / BUSINESS | **PARTIALLY FIXED** | `businessInsights.ts` + generated `listing_score` |
| IQ / MARKET | **PARTIALLY FIXED** | `supplyGaps()`, `trendRadar.ts`; no demand/supply map |
| IQ / CREATIVE | **MISSING** | `studio_export` = 1 event, ever |
| IQ / ADVERTISING | **MISSING** | no campaign outcome events |
| IQ / OPERATIONS | **PARTIALLY FIXED** | `client_error` + telemetry; no anomaly detection |
| IQ / EXPERIMENTS | **MISSING** | kill switches only |
| IQ / FORECAST | **MISSING** | and correctly so — insufficient history |
| IQ / GROWTH | **PARTIALLY FIXED** | `supplyGaps` + `ActivationPanel` |
| IQ / TRUST | **UNSAFE** | events forgeable by anon; no risk scoring |

---

## SECTION VERDICTS

| § | Area | Verdict |
| --- | --- | --- |
| 4 | Event contract | **PARTIALLY FIXED** — 8/20 fields |
| 5 | Event coverage | **MISSING** — 13 of ~50 |
| 6 | Analytics quality | **PARTIALLY FIXED** — source fixed, history dirty, no dedup/validation/bot filter |
| 7 | Behavioural graph | **MISSING** |
| 8 | Search intelligence | **MISSING** |
| 9 | Zero-result engine | **PARTIALLY FIXED** |
| 10 | Recommendations | **MISSING** |
| 11 | Personalization | **MISSING** (blocked on §27) |
| 12 | Business IQ | **PARTIALLY FIXED** |
| 13 | AI business coach | **MISSING** |
| 14 | Creative intelligence | **MISSING** |
| 15 | Advertising intelligence | **MISSING** |
| 16 | Experiments | **MISSING** |
| 17 | Winner detection / risk levels | **MISSING** |
| 18 | Self-improvement loop | **MISSING** |
| 19 | Opportunity engine | **PARTIALLY FIXED** |
| 20 | Admin IQ command center | **PARTIALLY FIXED** — `ActivationPanel`, `DailyBrief` |
| 21 | Market demand map | **MISSING** |
| 22 | Acquisition intelligence | **PARTIALLY FIXED** |
| 23 | Churn intelligence | **MISSING** |
| 24 | Forecasting | **MISSING** — correct at this data volume |
| 25 | Data quality intelligence | **PARTIALLY FIXED** — `listing_score`, duplicate engine |
| 26 | Trust & abuse | **UNSAFE** |
| 27 | Privacy architecture | **MISSING** |
| 28 | Retention policy | **MISSING** |
| 29 | Model strategy | **FIXED** — correctly at Phase 1 |
| 30 | AI cost control | **FIXED** — no LLM to control |
| 31 | Explainability | **PARTIALLY FIXED** — insights carry reasons |
| 32 | AI governance doc | **MISSING** |
| 33 | Fail-safe design | **FIXED** — nothing depends on an AI layer |
| 34 | IQ tables | **MISSING** — reuse candidates identified above |
| 35 | Performance | **PARTIALLY FIXED** — directory still fetches ≤500 rows client-side |
| 36 | Search quality feedback | **MISSING** |
| 37 | Business success feedback | **PARTIALLY FIXED** |
| 38 | North Star | **FIXED** |
| 39 | Learning scorecard | **MISSING** |
| 40 | Anomaly detection | **MISSING** |
| 41 | AI action log | **MISSING** |
| 42 | No magic AI | **FIXED** — no model exists to hallucinate |
| 48 | Documentation | **MISSING** — 0 of 8 |

**Nothing is BROKEN. Nothing is DUPLICATED. Nothing is OBSOLETE.** One area is **UNSAFE** (§26/§45 — forgeable events). One is **UNSCALABLE** (§35 — client-side directory fetch).

---

## PREVIOUS FINDINGS THAT CHANGED

§1 requires not trusting earlier audits. Three did change:

1. **The 500 synthetic seed businesses are gone.** Production holds 2 businesses, both the founder's, both `user_created`/`claimed`.
2. **The `signin` emitter fix held** — 0 new events since deploy. Earlier audits recorded the fix as shipped but unverified against fresh data; it is now verified.
3. **`listing_score` and `is_listable` are generated columns.** Earlier notes treated completeness and visibility as application logic. They are enforced in the database, which is materially stronger and changes what §32 needs.

---

## RECOMMENDED ORDER

§43's phases are right, but the first two must be reordered against what was measured.

**PHASE 0 — before anything learns (all preconditions, none optional)**

1. **Close event forgery.** Constrain `name` to a known vocabulary; stop the client setting `user_id`; add rate limiting and a bot filter. *Nothing in this brief is safe to build on a table anyone can write to.*
2. **Purge the 43,354 junk `signin` rows.** Until then every aggregate is 99.4% noise. Already written; needs one production `DELETE`.
3. **Add `consent_state` and `purpose` to the event contract** (§27) — before personalization exists, not after.

**PHASE 1 — the event contract (§4, §5, §6)**
4. Idempotency key, `event_version`, `object_type`/`object_id`, `route`, `category_id`, `location_id`, `experiment_id`.
5. Client-side dedup + validation against a declared taxonomy.
6. Instrument the ~35 missing events — prioritising **outcome** events (`whatsapp_clicked`, `phone_clicked`, `booking_completed`, `business_saved`), because §36 and §37 both terminate there and both are currently blind.

**PHASE 2 — make search learnable (§8, §10)**
7. Apply `20260907182000_business_search_index.sql`, then wire the directory to `search_businesses()`.
8. Intent parsing and controlled exploration on top of it.

**PHASE 3 — then the rest**, in §43's order.

### Blockers

- **Every Phase 0 and Phase 1 item is a schema or data change.** This session has been refused production DDL **five times** by the permission classifier. Migrations can be written here; they cannot be applied here.
- **There is no staging database.** `.env`, `.env.local` and the linked project are one Supabase project, so there is nowhere to rehearse a policy change on `analytics_events`.
- **Do not run `supabase db push`** — it would replay 86 applied migrations, three of which write rows. See `audits/NOWOPEN_APPLY_RUNBOOK.md`.

---

## THE ONE THING THIS AUDIT WOULD SAY IF IT COULD ONLY SAY ONE

NowOpen already measures the right thing. `northStar.ts` counts **successful connections**, not page views — which is precisely what §38 demands and what most platforms get wrong permanently.

What it does not have is anything to count. **242 real behavioural events exist**, five of them contact actions, and the table they live in can be written to by anyone with the public key.

So the first work is not intelligence. It is **making the observations trustworthy and plentiful enough to be worth learning from** — close the forgery hole, purge the noise, instrument the outcomes. An intelligence layer built before that would be confidently, measurably wrong, which is worse than none at all.
