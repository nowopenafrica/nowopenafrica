# AUTOACQUIRE™ — ARCHITECTURE MAP
**Date:** 2026-09-08 · **§1 and §54 deliverable: inspect before building**
**Method:** live queries against production (`wvayqqfqqocwjripugnb`) and a read of the working tree. Every claim below is measured. Two of my own earlier findings were wrong and are corrected here.

---

## THE FINDING THAT DECIDES THE SEQUENCE

**The source registry exists, is well designed, and contains no authorized external source.**

```
radar_sources (4 rows)
  admin_import         admin_import          active   all permissions permitted
  business_submission  business_submission   active   all permissions permitted
  public_suggestion    business_submission   active   all permissions permitted
  businesslist_ng      licensed_directory    INACTIVE  automated_access: prohibited
                                                       bulk_extraction:  prohibited
                                                       redistribution:   prohibited
                                                       licence: None · authorised_by: None
```

Three of the four are inbound — an admin uploading a file, an owner submitting, a customer suggesting. **None of them discovers anything.** The fourth is the only external directory on record and its terms prohibit exactly what discovery requires.

So the honest position on §50's *"1,000 qualified candidates/day, starting Lagos"*:

> **AutoAcquire can be built to process 1,000/day. It cannot discover 1,000/day, because there is currently nothing it is permitted to discover from.**

That is not a code gap and I will not close it by writing an adapter that scrapes something anyway — §0, §6 and §29 forbid it, and `businesslist_ng` is already on record as a refusal. What closes it is a **signed agreement, a licensed dataset, or an authorized API** — a founder/legal action. §54 anticipates this: *"If an external data provider is required but unavailable, create a clean adapter/interface and document the required credential/configuration without pretending it works."*

**Therefore the build order inverts the brief's optimism:** everything except discovery can be built and tested now against the three *permitted* inbound sources. Discovery ships as an interface with zero live adapters, and turns on the day a source is authorized.

---

## WHAT ALREADY EXISTS — REUSE, DO NOT REBUILD

§1 is explicit that existing architecture must not be duplicated. A large fraction of this brief is already in the repository.

### Source registry — §5 · **EXISTS, and better than the brief specifies**

`radar_sources` models rights as **columns, not prose**: `automated_access`, `bulk_extraction`, `competing_dataset`, `redistribution`, `licence`, `authorised_by`, `authorised_at`, plus `last_run_at`, `records_seen`, `error_rate`-adjacent fields.

The brief's §5 field list maps onto it almost one-for-one. Missing: `accuracy_score`, `field_accuracy`, `owner_confirmation_rate`, `duplicate_rate` — the §31 learning signals.

### Candidate queue — §2, §26 · **PARTIALLY EXISTS**

`radar_candidates` (29 columns) already carries `source_key`, `source_record_id`, `source_url`, the normalised keys (`name_key`, `city_key`, `phone_e164`, `domain`), `confidence`, `status` (`pending|review|held|published|merged|rejected`), `duplicate_of`, `published_business_id`, `reviewed_by`, `reviewed_at`.

That is a candidate table with a review lifecycle. It is **not** a queue: there are no per-stage statuses, no attempts counter, no lease/checkpoint, no dead-letter.

### Normalisation & entity resolution — §7, §14 · **EXISTS**

`src/lib/radar/` — `normalize.ts`, `entity.ts`, `confidence.ts`, `sources.ts`. `normalizeBusiness()` produces the canonical keys the whole pipeline needs. `src/lib/imports/matchExisting.ts` (built today) matches candidates against live businesses on phone → domain → name+city, and proposes updates rather than duplicates.

Missing versus §14: the **weighted** score (name 25 / phone 20 / website 20 / address 15 / social 10 / coords 5 / email 5) and the three-way `MATCH | POSSIBLE_MATCH | NO_MATCH` output. Present logic is first-match-wins by tier.

### Status model — §12 · **MOSTLY EXISTS**

| §12 axis | Live | Gap |
| --- | --- | --- |
| Claim | `businesses.claim_status` — `unclaimed`, `claim_pending`, `claimed` | **`claim_rejected`, `claim_suspended` missing** |
| Verification | `verification_status` — `unverified`, `pending`, `verified`, `rejected` | **`expired` missing** |
| Data confidence | `data_status` — origin values, not confirmation values | **different axis; needs a second column** |
| Duplicate | `radar_candidates.status` + `duplicate_of` | no `POSSIBLE_DUPLICATE` tier |
| Profile | `lifecycle_status` + generated `is_listable` | no `DRAFT`/`NOINDEX`/`ARCHIVED` |

### Multi-location — §15 · **EXISTS**

`business_locations` (15 columns) is already the entity→locations split §15 asks for, and already carries the per-location `open_status_set_at` / `opens_on_holidays` columns from the pending Open Now migration.

### Audit log — §30 · **EXISTS**

`audit_log` table is present. Needs the field-level shape §30 lists (`field`, `old_value`, `new_value`, `confidence`, `reason`).

### Claim engine — §18, §43 · **EXISTS**

`business_claims` + `ClaimBusiness.tsx` ("Is this your business?") + `ApprovalsHub.tsx` + `mark_claim_pending()` / `apply_business_claim()` RPCs. Approval is admin-only by design.

Missing versus §18: the four-step flow (relationship → confirm details → verification method → submit) and the fields behind it (`relationship`, `verification_method`, `risk_score`).

### Import / export — §29 · **PARTIALLY EXISTS**

`import_batches` (23 cols, incl. rollback), `import_rows` (12 cols), `rollback_import_batch()` which **refuses to delete a business that was since claimed**. CSV in; **XLSX and export absent**.

### Publishing gate & SEO — §24 · **PARTIALLY EXISTS**

`is_listable` is a **generated column** — visibility enforced in the database, not in code that can forget:

```sql
is_listable = (lifecycle_status <> 'suspended')
              AND (data_status <> 'synthetic_unverified' OR claim_status = 'claimed')
```

`middleware.ts` + `marketingPageRender.ts` server-render for crawlers; `/businesses/in/:place` and `/businesses/:category/in/:place` exist and are SSR'd; `discoveryPages()` gates on `MIN_LISTINGS_PER_PAGE`. §24's *"crawlers receive the JavaScript shell"* concern was fixed earlier — **verified: all 45 demo profiles now return 404 + noindex.**

Gap: the sitemap gate is **provenance-only** (`claim_status === 'claimed' || data_status === 'imported_authorized'`), not quality-based. §24 wants a quality threshold, and it becomes live the moment the first import runs.

### Worker substrate — §26, §27 · **EXISTS, and is the constraint**

There is no Node server. The runtime is a Vite SPA on Vercel plus **15 Supabase edge functions**, of which three are already cron-driven workers: `run-automations`, `run-workforce`, `publish-due-posts`.

```
cron.job:  nowopen-workforce   */15 * * * *   active
```

So the pattern for AutoAcquire workers already exists — **pg_cron → edge function → claim work → process → checkpoint.** One job, every 15 minutes.

**This caps throughput honestly.** A 15-minute tick with per-invocation CPU and wall-clock limits is the real ceiling, and §27's *10,000/day* means ~104 candidates per tick. Achievable, but it needs batching and leases, not one row at a time.

### AI extraction — §9, §39 · **FOUNDATION EXISTS** *(corrects my earlier audit)*

`supabase/functions/_shared/llm.ts` is a **multi-provider LLM shim** with `resolveProviders()`, a preference order, `ASSISTANT_MODEL` override, typed `FailureReason` (`no_provider | rate_limited | auth | error`), tool-calling with `MAX_TOOL_ROUNDS`, and — crucially — a `provider: 'none'` path that degrades to formatting real search results rather than failing.

**My NowOpen IQ baseline said "there is no LLM in the product." That was true of the client (`aiCopy.ts` is deterministic by design) and wrong about the server.** §39's cost-control concern is therefore real, not hypothetical, and the graceful-degradation pattern to build on already exists.

---

## WHAT DOES NOT EXIST

| § | Component | Status |
| --- | --- | --- |
| 3 | `/admin/acquisition` command center | **MISSING** |
| 4 | Acquisition campaigns | **MISSING** (`campaigns` table is the Founding-1000 marketing campaign, unrelated) |
| 6 | Source adapter interface | **MISSING** |
| 8 | **Field-level evidence model** | **MISSING** — the most important gap |
| 9 | Extraction pipeline | **MISSING** (the LLM shim it would use exists) |
| 13 | Deterministic quality score | **MISSING** (`listing_score` is completeness only) |
| 16 | Activity detection | **MISSING** |
| 20 | Claim hotlist | **MISSING** |
| 22 | Correction network | **PARTIAL** — `ReportListing`, `SuggestBusiness`, `deletion_requests`; no unified queue |
| 23 | Media rights per asset | **MISSING** |
| 25 | Schema.org structured data | **PARTIAL** — JSON-LD exists; not evidence-gated |
| 26/27 | Staged queues, leases, DLQ | **MISSING** |
| 28 | Resumable job statuses | **MISSING** |
| 33–36 | Funnel / city / category / gap analytics | **PARTIAL** — `supplyGaps()` + `trendRadar` exist |
| **38** | **SSRF protection** | **MISSING — and nothing fetches yet, which is why now is the moment** |
| 46 | Observability | **PARTIAL** — `client_error` telemetry only |

### The SSRF position is the one piece of good news

Measured: **no code fetches a URL that came from the database.** Every `fetch()` in the edge functions targets a fixed provider endpoint (Paystack, Resend, an LLM host, a stock-footage API). There is no server-side request forgery surface today.

AutoAcquire's entire premise is fetching attacker-influenceable URLs. So §38 is not a hardening pass to bolt on later — **it is the first thing that must exist**, before any adapter can be written, and it is the one thing that cannot be retrofitted safely.

---

## CORRECTIONS TO MY OWN EARLIER AUDITS

§1 requires not trusting previous findings. Two were wrong:

1. **"There is no LLM in the product."** Wrong. The client is deterministic; `supabase/functions/_shared/llm.ts` is a real multi-provider LLM client with fallbacks. §29/§30/§39 apply to the server side today.
2. **`businesses` column names.** My import matcher initially selected `city`, `cover_image_url`, `latitude`, `longitude` — **none of which exist**; the real columns are `location`, `image_url`, and there is no lat/lng on `businesses` at all (they live on `radar_candidates` and `business_locations`). PostgREST rejects the whole select for one bad name, so the feature silently compared against nothing. Fixed and now covered by tests.

---

## IMPLEMENTATION SEQUENCE

§49's phases are right in shape and wrong in order for this repository, because Phase 2 (Discovery) is the blocked one.

### PHASE 1 — SAFETY PRIMITIVES *(unblocked, starts now)*

1. **SSRF guard (§38).** Protocol/hostname/DNS/IP-range/redirect validation, private and metadata ranges refused, before any adapter exists. Pure and fully testable.
2. **Source adapter interface (§6).** `discover / fetch / extract / normalize / validate / getRateLimit / getRightsPolicy / getSourceMetadata`, with **zero live adapters** and a registry that refuses any source whose `radar_sources` row does not permit the access it needs.
3. **Deterministic quality score (§13),** configurable weights, pure.
4. **Weighted duplicate scoring (§14)** on top of the existing `entity.ts`.

### PHASE 2 — EVIDENCE *(schema-blocked; write the migration)*

5. `business_evidence` (§8) — the field-level provenance model, and the thing that lets NowOpen answer *"why do we believe this?"*
6. Status-model completion (§12) — the missing enum values and the `data_confidence` column.
7. `acquisition_campaigns` + staged queue columns (§4, §26, §28).

### PHASE 3 — OPERATIONS *(after evidence lands)*

8. `/admin/acquisition` (§3), review queue (§41), hotlist (§20).
9. Extraction pipeline (§9) on the existing LLM shim, cheap-path-first per §39.

### PHASE 4 — DISCOVERY *(gated on an authorized source)*

10. The first real adapter — written only once a `radar_sources` row exists with `automated_access: permitted` and a named `authorised_by`.

### Blockers, stated plainly

- **DDL is refused in this session** — five attempts. Every Phase 2 item is a migration I can write and cannot apply.
- **No staging database.** `.env`, `.env.local` and the linked project are one Supabase project, so there is nowhere to rehearse.
- **Do not run `supabase db push`** — it would replay 86 applied migrations, three of which write rows. See `audits/NOWOPEN_APPLY_RUNBOOK.md`.
- **No authorized discovery source.** Phase 4 is a legal precondition, not an engineering one.

---

## THE ONE THING THIS MAP WOULD SAY IF IT COULD ONLY SAY ONE

NowOpen already owns most of an acquisition engine: a rights-aware source registry, a candidate table with a review lifecycle, normalisation and entity resolution, a claim engine, a cron-driven worker substrate, a database-enforced publishing gate, and an LLM client that degrades gracefully.

What it does not own is **permission to discover anything**, and **a way to record why it believes a fact**.

The second is mine to build. The first is not, and no amount of engineering substitutes for it — so the work starts with the safety primitive that makes discovery possible the day permission arrives, and the evidence model that makes it defensible.
